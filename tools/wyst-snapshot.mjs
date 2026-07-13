import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SNAPSHOT_MANIFEST = path.join(ROOT, "vendor", "wyst-snapshot.json");
const SNAPSHOT_ROOTS = [
	["vendor/wyst-design", path.join(ROOT, "vendor", "wyst-design")],
	["tests/fixtures/wyst", path.join(ROOT, "tests", "fixtures", "wyst")],
];

function compareText(left, right) {
	return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(value) {
	return createHash("sha256").update(value).digest("hex");
}

function normalizeCommit(value) {
	const commit = String(value || "").trim().toLowerCase();
	if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(commit)) {
		throw new Error("Wyst snapshot sourceCommit must be a full Git object ID");
	}
	return commit;
}

async function walk(dir, relativeDir = "") {
	const entries = await readdir(path.join(dir, relativeDir), {
		withFileTypes: true,
	});
	entries.sort((left, right) => compareText(left.name, right.name));
	const files = [];
	for (const entry of entries) {
		const relative = relativeDir
			? path.posix.join(relativeDir, entry.name)
			: entry.name;
		if (entry.isDirectory()) files.push(...(await walk(dir, relative)));
		else if (entry.isFile()) files.push(relative);
		else throw new Error(`unsupported Wyst snapshot entry: ${relative}`);
	}
	return files;
}

export async function collectWystSnapshotFiles({
	designDir = SNAPSHOT_ROOTS[0][1],
	fixtureDir = SNAPSHOT_ROOTS[1][1],
} = {}) {
	const roots = [
		["vendor/wyst-design", path.resolve(designDir)],
		["tests/fixtures/wyst", path.resolve(fixtureDir)],
	];
	const files = {};
	for (const [prefix, directory] of roots) {
		for (const relative of await walk(directory)) {
			const contents = await readFile(
				path.join(directory, ...relative.split("/")),
			);
			files[path.posix.join(prefix, relative)] = {
				sha256: sha256(contents),
				size: contents.byteLength,
			};
		}
	}
	return Object.fromEntries(
		Object.entries(files).sort(([left], [right]) => compareText(left, right)),
	);
}

export function wystSnapshotSha256For({ sourceCommit, files }) {
	const input = [
		`source-commit\0${normalizeCommit(sourceCommit)}\n`,
		...Object.entries(files)
			.sort(([left], [right]) => compareText(left, right))
			.map(
				([relativePath, entry]) =>
					`${relativePath}\0${entry.sha256}\0${entry.size}\n`,
			),
	].join("");
	return sha256(input);
}

export async function createWystSnapshotManifest({
	designDir,
	fixtureDir,
	destination = SNAPSHOT_MANIFEST,
	sourceCommit,
} = {}) {
	const commit = normalizeCommit(
		sourceCommit ??
			(await readFile(
				path.join(designDir ?? SNAPSHOT_ROOTS[0][1], ".source-commit"),
				"utf8",
			)),
	);
	const files = await collectWystSnapshotFiles({ designDir, fixtureDir });
	const manifest = {
		schema: 1,
		sourceCommit: commit,
		snapshotSha256: wystSnapshotSha256For({ sourceCommit: commit, files }),
		files,
	};
	await mkdir(path.dirname(destination), { recursive: true });
	await writeFile(destination, `${JSON.stringify(manifest, null, 2)}\n`);
	return manifest;
}

function metadataIsValid(entry) {
	return (
		entry &&
		typeof entry === "object" &&
		!Array.isArray(entry) &&
		Object.keys(entry).sort(compareText).join(",") === "sha256,size" &&
		/^[0-9a-f]{64}$/.test(entry.sha256) &&
		Number.isSafeInteger(entry.size) &&
		entry.size >= 0
	);
}

function describeMismatch(expected, actual) {
	const paths = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort(
		compareText,
	);
	for (const relativePath of paths) {
		if (!Object.hasOwn(expected, relativePath)) {
			return `${relativePath} is absent from the committed snapshot manifest`;
		}
		if (!Object.hasOwn(actual, relativePath)) {
			return `${relativePath} is missing from the snapshot`;
		}
		if (
			expected[relativePath].sha256 !== actual[relativePath].sha256 ||
			expected[relativePath].size !== actual[relativePath].size
		) {
			return `${relativePath} differs from the committed snapshot manifest`;
		}
	}
	return undefined;
}

export async function verifyWystSnapshot({
	designDir,
	fixtureDir,
	manifestPath = SNAPSHOT_MANIFEST,
} = {}) {
	const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
	if (!manifest || typeof manifest !== "object" || manifest.schema !== 1) {
		throw new Error("unsupported Wyst snapshot manifest");
	}
	const sourceCommit = normalizeCommit(manifest.sourceCommit);
	if (!/^[0-9a-f]{64}$/.test(manifest.snapshotSha256 ?? "")) {
		throw new Error("Wyst snapshot manifest has an invalid snapshotSha256");
	}
	if (
		!manifest.files ||
		typeof manifest.files !== "object" ||
		Array.isArray(manifest.files)
	) {
		throw new Error("Wyst snapshot manifest files must be an object");
	}
	const paths = Object.keys(manifest.files);
	if (JSON.stringify(paths) !== JSON.stringify([...paths].sort(compareText))) {
		throw new Error("Wyst snapshot manifest paths are not code-point sorted");
	}
	for (const [relativePath, entry] of Object.entries(manifest.files)) {
		if (
			(!relativePath.startsWith("vendor/wyst-design/") &&
				!relativePath.startsWith("tests/fixtures/wyst/")) ||
			relativePath.includes("..") ||
			!metadataIsValid(entry)
		) {
			throw new Error(`invalid Wyst snapshot metadata for ${relativePath}`);
		}
	}
	const recordedCommit = normalizeCommit(
		await readFile(
			path.join(designDir ?? SNAPSHOT_ROOTS[0][1], ".source-commit"),
			"utf8",
		),
	);
	if (sourceCommit !== recordedCommit) {
		throw new Error("Wyst snapshot sourceCommit differs from .source-commit");
	}
	const actualFiles = await collectWystSnapshotFiles({ designDir, fixtureDir });
	const mismatch = describeMismatch(manifest.files, actualFiles);
	if (mismatch) throw new Error(mismatch);
	const snapshotSha256 = wystSnapshotSha256For({
		sourceCommit,
		files: actualFiles,
	});
	if (snapshotSha256 !== manifest.snapshotSha256) {
		throw new Error(
			`Wyst snapshot digest is ${snapshotSha256}; expected ${manifest.snapshotSha256}`,
		);
	}
	return { files: actualFiles, snapshotSha256, sourceCommit };
}

if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	if (process.argv.length !== 3 || process.argv[2] !== "--write") {
		throw new Error("usage: node tools/wyst-snapshot.mjs --write");
	}
	const manifest = await createWystSnapshotManifest();
	console.log(
		`wrote ${path.relative(ROOT, SNAPSHOT_MANIFEST)} (${manifest.snapshotSha256})`,
	);
}
