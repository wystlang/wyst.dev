import { spawnSync } from "node:child_process";
import {
	copyFile,
	mkdir,
	mkdtemp,
	readFile,
	readdir,
	rename,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	captureHomepageSemanticArtifact,
	updateHomepageIndex,
} from "./homepage-example.mjs";
import { createWystSnapshotManifest } from "./wyst-snapshot.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const designDestination = path.join(root, "vendor", "wyst-design");
const fixtureDestination = path.join(root, "tests", "fixtures", "wyst");
const snapshotDestination = path.join(root, "vendor", "wyst-snapshot.json");
const homepageArtifactDestination = path.join(
	root,
	"vendor",
	"wyst-homepage-semantic-tokens.json",
);
const homepageIndexDestination = path.join(root, "index.html");

const coreFixturePaths = [
	"wync/tests/fixtures/qemu/virt/uart-hello/main.wyst",
	"wync/tests/fixtures/qemu/virt/uart-hello/layout.wyst",
	"wync/tests/fixtures/qemu/virt/uart-hello/expected.txt",
	"wync/tests/fixtures/common/runtime/semihost-runtime.wyst",
];
const syntaxCorpusRoot = "wync/tests/fixtures/syntax-corpus";
const vocabularyCatalogs = [
	"attribute-catalog.tsv",
	"meta-operation-catalog.tsv",
	"syntax-words.tsv",
];
const snapshotPathspecs = [
	":(top,glob)design/*.md",
	":(top,literal)design/semantic-db.json",
	...vocabularyCatalogs.map((file) => `:(top,literal)design/${file}`),
	":(top,literal)wync/Cargo.lock",
	":(top,literal)wync/Cargo.toml",
	":(top,glob)wync/core/**/*.wyst",
	":(top,glob)wync/src/**/*.rs",
	...coreFixturePaths.map((file) => `:(top,literal)${file}`),
	`:(top,glob)${syntaxCorpusRoot}/**`,
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

async function walkFiles(directory, relativeDirectory = "") {
	const entries = await readdir(path.join(directory, relativeDirectory), {
		withFileTypes: true,
	});
	entries.sort((left, right) =>
		left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
	);
	const files = [];
	for (const entry of entries) {
		const relative = relativeDirectory
			? path.posix.join(relativeDirectory, entry.name)
			: entry.name;
		if (entry.isDirectory()) files.push(...(await walkFiles(directory, relative)));
		else if (entry.isFile()) files.push(relative);
		else throw new Error(`unsupported Wyst syntax-corpus entry: ${relative}`);
	}
	return files;
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
			(entry.name.endsWith(".md") ||
				entry.name === "semantic-db.json" ||
				vocabularyCatalogs.includes(entry.name)),
	)
	.map((entry) => entry.name)
	.sort();

for (const requiredDesignFile of [
	"README.md",
	"semantic-db.json",
	...vocabularyCatalogs,
]) {
	if (!designFileNames.includes(requiredDesignFile)) {
		throw new Error(`Missing Wyst design input: design/${requiredDesignFile}`);
	}
}

const syntaxCorpusFiles = await walkFiles(path.join(wystRoot, syntaxCorpusRoot));
if (!syntaxCorpusFiles.includes("manifest.tsv")) {
	throw new Error(`Missing Wyst syntax corpus: ${syntaxCorpusRoot}/manifest.tsv`);
}
const fixturePaths = [
	...coreFixturePaths,
	...syntaxCorpusFiles.map((file) => path.posix.join(syntaxCorpusRoot, file)),
].sort();

for (const relativePath of fixturePaths) {
	if (!(await isFile(path.join(wystRoot, relativePath)))) {
		throw new Error(`Missing Wyst snapshot input: ${relativePath}`);
	}
}

// A commit marker is useful only when it names the exact copied content and the
// compiler that produced the homepage token stream. Ignore unrelated work, but
// reject changes to snapshot inputs or the relevant wync implementation.
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
const stagedHomepageArtifact = path.join(
	stagingRoot,
	"wyst-homepage-semantic-tokens.json",
);
const stagedHomepageIndex = path.join(stagingRoot, "index.html");

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
	const homepageArtifact = await captureHomepageSemanticArtifact({
		sourceCommit,
		wystRoot,
	});
	await writeFile(
		stagedHomepageArtifact,
		`${JSON.stringify(homepageArtifact, null, 2)}\n`,
	);
	await writeFile(
		stagedHomepageIndex,
		updateHomepageIndex(
			await readFile(homepageIndexDestination, "utf8"),
			homepageArtifact,
		),
	);
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
	await rename(stagedHomepageArtifact, homepageArtifactDestination);
	await rename(stagedHomepageIndex, homepageIndexDestination);
} finally {
	await rm(stagingRoot, { recursive: true, force: true });
}

console.log(
	`Synced Wyst design, ${fixturePaths.length} test fixtures, and homepage semantic tokens from ${sourceCommit}`,
);
