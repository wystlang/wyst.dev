import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyWystSnapshot } from "./wyst-snapshot.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = ".well-known/build.json";
const EXCLUDED_PATHS = new Set([MANIFEST_PATH, "_headers"]);
const RELEASE_FILE_PATHS = ["_headers", "wrangler.jsonc"];

export function compareText(left, right) {
	return left < right ? -1 : left > right ? 1 : 0;
}

export function resolveOutputDir() {
	return process.env.WYST_OUTPUT_DIR
		? path.resolve(process.env.WYST_OUTPUT_DIR)
		: path.join(ROOT, "dist");
}

function sha256(value) {
	return createHash("sha256").update(value).digest("hex");
}

function fileMetadata(contents) {
	return {
		sha256: sha256(contents),
		size: contents.byteLength,
	};
}

async function walkFiles(dir, relativeDir = "") {
	const currentDir = relativeDir
		? path.join(dir, ...relativeDir.split("/"))
		: dir;
	const entries = await readdir(currentDir, { withFileTypes: true });
	entries.sort((a, b) => compareText(a.name, b.name));

	const files = [];
	for (const entry of entries) {
		const relative = relativeDir
			? path.posix.join(relativeDir, entry.name)
			: entry.name;
		const absolute = path.join(dir, ...relative.split("/"));
		if (entry.isDirectory()) {
			files.push(...(await walkFiles(dir, relative)));
		} else if (entry.isFile()) {
			files.push({ absolute, relative });
		} else {
			throw new Error(`build output contains unsupported entry: ${relative}`);
		}
	}
	return files;
}

export function publicUrlFor(relativePath) {
	if (relativePath === "index.html") return "/";
	if (relativePath.endsWith("/index.html")) {
		return `/${relativePath.slice(0, -"index.html".length)}`;
	}
	return `/${relativePath}`;
}

export async function collectBuildFiles(outputDir = resolveOutputDir()) {
	const output = path.resolve(outputDir);
	const files = {};
	for (const file of await walkFiles(output)) {
		if (EXCLUDED_PATHS.has(file.relative)) continue;
		const url = publicUrlFor(file.relative);
		if (Object.hasOwn(files, url)) {
			throw new Error(`multiple build files resolve to public URL ${url}`);
		}
		const contents = await readFile(file.absolute);
		files[url] = fileMetadata(contents);
	}
	return Object.fromEntries(
		Object.entries(files).sort(([a], [b]) => compareText(a, b)),
	);
}

export async function collectReleaseFiles(outputDir = resolveOutputDir()) {
	const output = path.resolve(outputDir);
	const releaseFiles = {
		_headers: fileMetadata(await readFile(path.join(output, "_headers"))),
		"wrangler.jsonc": fileMetadata(
			await readFile(path.join(ROOT, "wrangler.jsonc")),
		),
	};
	return Object.fromEntries(
		Object.entries(releaseFiles).sort(([a], [b]) => compareText(a, b)),
	);
}

export function treeSha256ForFiles(files) {
	const tree = Object.entries(files)
		.sort(([a], [b]) => compareText(a, b))
		.map(([url, entry]) => `${url}\0${entry.sha256}\0${entry.size}\n`)
		.join("");
	return sha256(tree);
}

export function releaseSha256For({ treeSha256, releaseFiles }) {
	const releaseTree = [
		`public-tree\0${treeSha256}\n`,
		...Object.entries(releaseFiles)
			.sort(([a], [b]) => compareText(a, b))
			.map(
				([relativePath, entry]) =>
					`${relativePath}\0${entry.sha256}\0${entry.size}\n`,
			),
	].join("");
	return sha256(releaseTree);
}

export function expectedReleaseFilePaths() {
	return [...RELEASE_FILE_PATHS].sort(compareText);
}

function normalizeCommit(value, label) {
	const commit = String(value || "").trim().toLowerCase();
	if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(commit)) {
		throw new Error(`${label} must be a full hexadecimal Git object ID`);
	}
	return commit;
}

export function resolveSiteCommit() {
	const value =
		process.env.WYST_SITE_COMMIT ||
		execFileSync("git", ["rev-parse", "HEAD"], {
			cwd: ROOT,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		});
	return normalizeCommit(value, "siteCommit");
}

export async function resolveWystSourceCommit() {
	return (await verifyWystSnapshot()).sourceCommit;
}

export async function createBuildManifest({
	outputDir = resolveOutputDir(),
	siteCommit = resolveSiteCommit(),
	wystSourceCommit,
} = {}) {
	const output = path.resolve(outputDir);
	const files = await collectBuildFiles(output);
	const treeSha256 = treeSha256ForFiles(files);
	const releaseFiles = await collectReleaseFiles(output);
	const wystSnapshot = await verifyWystSnapshot();
	const selectedWystCommit = normalizeCommit(
		wystSourceCommit ?? wystSnapshot.sourceCommit,
		"wystSourceCommit",
	);
	if (selectedWystCommit !== wystSnapshot.sourceCommit) {
		throw new Error(
			"wystSourceCommit must match the verified Wyst snapshot attribution",
		);
	}
	const manifest = {
		schema: 2,
		siteCommit: normalizeCommit(siteCommit, "siteCommit"),
		wystSourceCommit: selectedWystCommit,
		wystSnapshotSha256: wystSnapshot.snapshotSha256,
		treeSha256,
		releaseSha256: releaseSha256For({ treeSha256, releaseFiles }),
		releaseFiles,
		files,
	};

	const destination = path.join(output, ...MANIFEST_PATH.split("/"));
	await mkdir(path.dirname(destination), { recursive: true });
	await writeFile(destination, `${JSON.stringify(manifest, null, 2)}\n`);
	console.log(
		`wrote ${path.relative(ROOT, destination)} (${Object.keys(files).length} files)`,
	);
	return manifest;
}

function parseArgs(argv) {
	let outputDir = resolveOutputDir();
	for (let index = 0; index < argv.length; index++) {
		if (argv[index] === "--output-dir" && argv[index + 1]) {
			outputDir = path.resolve(argv[++index]);
			continue;
		}
		throw new Error(`unknown argument: ${argv[index]}`);
	}
	return { outputDir };
}

if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	await createBuildManifest(parseArgs(process.argv.slice(2)));
}
