import { spawnSync } from "node:child_process";
import {
	copyFile,
	mkdir,
	mkdtemp,
	readdir,
	rename,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createWystSnapshotManifest } from "./wyst-snapshot.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const designDestination = path.join(root, "vendor", "wyst-design");
const fixtureDestination = path.join(root, "tests", "fixtures", "wyst");
const snapshotDestination = path.join(root, "vendor", "wyst-snapshot.json");

const fixturePaths = [
	"wync/tests/fixtures/qemu/virt/uart-hello/main.wyst",
	"wync/tests/fixtures/qemu/virt/uart-hello/layout.wyst",
	"wync/tests/fixtures/qemu/virt/uart-hello/expected.txt",
	"wync/tests/fixtures/common/runtime/semihost-runtime.wyst",
];
const snapshotPathspecs = [
	":(top,glob)design/*.md",
	":(top,literal)design/semantic-db.json",
	...fixturePaths.map((file) => `:(top,literal)${file}`),
];

const candidates = [
	process.env.WYST_REPO_DIR,
	path.resolve(root, "..", "wyst"),
].filter(Boolean);

async function isFile(file) {
	try {
		return (await stat(file)).isFile();
	} catch {
		return false;
	}
}

async function isWystRoot(dir) {
	return (
		(await isFile(path.join(dir, "design", "README.md"))) &&
		(await isFile(path.join(dir, "design", "semantic-db.json"))) &&
		(await isFile(path.join(dir, "wync", "Cargo.toml")))
	);
}

async function resolveWystRoot() {
	for (const candidate of candidates) {
		const dir = path.resolve(candidate);
		if (await isWystRoot(dir)) return dir;
	}

	throw new Error(
		"Could not find wystlang/wyst. Set WYST_REPO_DIR or clone it next to this repo as ../wyst.",
	);
}

function git(wystRoot, args) {
	const result = spawnSync("git", ["-C", wystRoot, ...args], {
		encoding: "utf8",
	});
	if (result.status !== 0) {
		throw new Error(
			`git ${args.join(" ")} failed:\n${result.stderr || result.stdout}`,
		);
	}
	return result.stdout.trim();
}

const wystRoot = await resolveWystRoot();
const designFileNames = (await readdir(path.join(wystRoot, "design"), {
	withFileTypes: true,
}))
	.filter(
		(entry) =>
			entry.isFile() &&
			(entry.name.endsWith(".md") || entry.name === "semantic-db.json"),
	)
	.map((entry) => entry.name)
	.sort();

for (const requiredDesignFile of ["README.md", "semantic-db.json"]) {
	if (!designFileNames.includes(requiredDesignFile)) {
		throw new Error(`Missing Wyst design input: design/${requiredDesignFile}`);
	}
}

for (const relativePath of fixturePaths) {
	if (!(await isFile(path.join(wystRoot, relativePath)))) {
		throw new Error(`Missing Wyst snapshot input: ${relativePath}`);
	}
}

// A commit marker is useful only when it names the exact copied content. Ignore
// unrelated compiler work, but reject edits or untracked files in snapshot inputs.
const dirtyInputs = git(wystRoot, [
	"status",
	"--short",
	"--untracked-files=all",
	"--",
	...snapshotPathspecs,
]);
if (dirtyInputs) {
	throw new Error(
		`Commit or restore Wyst snapshot inputs before syncing:\n${dirtyInputs}`,
	);
}

const sourceCommit = git(wystRoot, ["rev-parse", "HEAD"]);
if (!/^[0-9a-f]{40,64}$/i.test(sourceCommit)) {
	throw new Error(`Unexpected Wyst source commit: ${sourceCommit}`);
}

const stagingRoot = await mkdtemp(path.join(root, ".wyst-snapshot-sync-"));
const stagedDesign = path.join(stagingRoot, "wyst-design");
const stagedFixtures = path.join(stagingRoot, "fixtures");
const stagedManifest = path.join(stagingRoot, "wyst-snapshot.json");

try {
	await mkdir(stagedDesign, { recursive: true });
	for (const file of designFileNames) {
		await copyFile(
			path.join(wystRoot, "design", file),
			path.join(stagedDesign, file),
		);
	}
	await writeFile(path.join(stagedDesign, ".source-commit"), `${sourceCommit}\n`);

	for (const relativePath of fixturePaths) {
		const destination = path.join(stagedFixtures, relativePath);
		await mkdir(path.dirname(destination), { recursive: true });
		await copyFile(path.join(wystRoot, relativePath), destination);
	}
	await createWystSnapshotManifest({
		designDir: stagedDesign,
		fixtureDir: stagedFixtures,
		destination: stagedManifest,
		sourceCommit,
	});

	await mkdir(path.dirname(designDestination), { recursive: true });
	await mkdir(path.dirname(fixtureDestination), { recursive: true });
	await rm(designDestination, { recursive: true, force: true });
	await rm(fixtureDestination, { recursive: true, force: true });
	await rename(stagedDesign, designDestination);
	await rename(stagedFixtures, fixtureDestination);
	await rename(stagedManifest, snapshotDestination);
} finally {
	await rm(stagingRoot, { recursive: true, force: true });
}

console.log(
	`Synced Wyst design and ${fixturePaths.length} test fixtures from ${sourceCommit}`,
);
