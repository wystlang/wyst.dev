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
	HOMEPAGE_EXAMPLES,
	captureHomepageSemanticArtifact,
	updateHomepageIndex,
	updateHomepageOutputs,
} from "./homepage-example.mjs";
import {
	coreFixturePaths,
	designCatalogs,
	publicReferencePaths,
	referenceDestination as referenceSnapshotPath,
	syntaxCorpusRoot,
	walkFiles,
} from "./wyst-snapshot-inputs.mjs";
import { createWystSnapshotManifest } from "./wyst-snapshot.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const designDestination = path.join(root, "vendor", "wyst-design");
const referenceDestination = path.join(root, "vendor", "wyst-reference");
const fixtureDestination = path.join(root, "tests", "fixtures", "wyst");
const snapshotDestination = path.join(root, "vendor", "wyst-snapshot.json");
const homepageIndexDestination = path.join(root, "index.html");

const snapshotPathspecs = [
	":(top,glob)design/*.md",
	...designCatalogs.map(({ source }) => `:(top,literal)${source}`),
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
	.filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
	.map((entry) => entry.name)
	.sort();

if (!designFileNames.includes("README.md")) {
	throw new Error("Missing Wyst design input: design/README.md");
}
for (const { source } of designCatalogs) {
	if (!(await isFile(path.join(wystRoot, source)))) {
		throw new Error(`Missing Wyst design input: ${source}`);
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
const referencePaths = await publicReferencePaths(wystRoot, designFileNames);

for (const relativePath of [...fixturePaths, ...referencePaths]) {
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
		...referencePaths.map((file) => `:(top,literal)${file}`),
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
const stagedReference = path.join(stagingRoot, "wyst-reference");
const stagedFixtures = path.join(stagingRoot, "fixtures");
const stagedManifest = path.join(stagingRoot, "wyst-snapshot.json");
const stagedHomepageArtifacts = Object.fromEntries(
	Object.entries(HOMEPAGE_EXAMPLES).map(([id, example]) => [
		id,
		path.join(stagingRoot, path.basename(example.artifactPath)),
	]),
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
	for (const { destination, source } of designCatalogs) {
		await copyFile(
			path.join(wystRoot, source),
			path.join(stagedDesign, destination),
		);
	}
	await writeFile(path.join(stagedDesign, ".source-commit"), `${sourceCommit}\n`);
	await mkdir(stagedReference, { recursive: true });
	for (const source of referencePaths) {
		const relative = referenceSnapshotPath(source);
		const destination = path.join(stagedReference, relative);
		await mkdir(path.dirname(destination), { recursive: true });
		await copyFile(path.join(wystRoot, source), destination);
	}

	for (const relativePath of fixturePaths) {
		const destination = path.join(stagedFixtures, relativePath);
		await mkdir(path.dirname(destination), { recursive: true });
		await copyFile(path.join(wystRoot, relativePath), destination);
	}
	const homepageArtifactEntries = await Promise.all(
		Object.entries(HOMEPAGE_EXAMPLES).map(async ([id, example]) => [
			id,
			await captureHomepageSemanticArtifact({
				sourceCommit,
				sourcePath: example.sourcePath,
				wystRoot,
			}),
		]),
	);
	const homepageArtifacts = Object.fromEntries(homepageArtifactEntries);
	await Promise.all(
		homepageArtifactEntries.map(([id, artifact]) =>
			writeFile(
				stagedHomepageArtifacts[id],
				`${JSON.stringify(artifact, null, 2)}\n`,
			),
		),
	);
	const homepageOutputEntries = await Promise.all(
		Object.entries(HOMEPAGE_EXAMPLES).map(async ([id, example]) => [
			id,
			await readFile(path.join(wystRoot, example.outputSourcePath), "utf8"),
		]),
	);
	await writeFile(
		stagedHomepageIndex,
		updateHomepageOutputs(
			updateHomepageIndex(
				await readFile(homepageIndexDestination, "utf8"),
				homepageArtifacts,
			),
			Object.fromEntries(homepageOutputEntries),
		),
	);
	await createWystSnapshotManifest({
		designDir: stagedDesign,
		referenceDir: stagedReference,
		fixtureDir: stagedFixtures,
		destination: stagedManifest,
		sourceCommit,
	});

	await mkdir(path.dirname(designDestination), { recursive: true });
	await mkdir(path.dirname(referenceDestination), { recursive: true });
	await mkdir(path.dirname(fixtureDestination), { recursive: true });
	await rm(designDestination, { recursive: true, force: true });
	await rm(referenceDestination, { recursive: true, force: true });
	await rm(fixtureDestination, { recursive: true, force: true });
	await rename(stagedDesign, designDestination);
	await rename(stagedReference, referenceDestination);
	await rename(stagedFixtures, fixtureDestination);
	await rename(stagedManifest, snapshotDestination);
	for (const [id, example] of Object.entries(HOMEPAGE_EXAMPLES)) {
		await rename(stagedHomepageArtifacts[id], example.artifactPath);
	}
	await rename(stagedHomepageIndex, homepageIndexDestination);
} finally {
	await rm(stagingRoot, { recursive: true, force: true });
}

console.log(
	`Synced Wyst design, ${referencePaths.length} public references, ${fixturePaths.length} test fixtures, and homepage semantic tokens from ${sourceCommit}`,
);
