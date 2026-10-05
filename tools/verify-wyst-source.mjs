import { spawnSync } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	coreFixturePaths,
	designCatalogs,
	publicReferencePaths,
	referenceDestination,
	syntaxCorpusRoot,
	walkFiles,
} from "./wyst-snapshot-inputs.mjs";
import { verifyWystSnapshot } from "./wyst-snapshot.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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

async function findWystRoot() {
	for (const candidate of candidates) {
		const directory = path.resolve(candidate);
		if (
			(await isFile(path.join(directory, "design", "README.md"))) &&
			(await isFile(path.join(directory, "wync", "Cargo.toml")))
		) {
			return directory;
		}
	}
	throw new Error(
		"Could not find wystlang/wyst. Set WYST_REPO_DIR or clone it next to this repository.",
	);
}

function git(directory, args) {
	const result = spawnSync("git", ["-C", directory, ...args], {
		encoding: "utf8",
	});
	if (result.status !== 0) {
		throw new Error(result.stderr || result.stdout || "git command failed");
	}
	return result.stdout.trim();
}

function addMapping(mappings, snapshotPath, sourcePath) {
	if (mappings.has(snapshotPath)) {
		throw new Error(`duplicate Wyst snapshot mapping for ${snapshotPath}`);
	}
	mappings.set(snapshotPath, sourcePath);
}

async function expectedMappings(wystRoot) {
	const designFileNames = (await readdir(path.join(wystRoot, "design"), {
		withFileTypes: true,
	}))
		.filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
		.map((entry) => entry.name)
		.sort();
	if (!designFileNames.includes("README.md")) {
		throw new Error("Wyst source is missing design/README.md");
	}
	const syntaxCorpusFiles = await walkFiles(
		path.join(wystRoot, syntaxCorpusRoot),
	);
	const fixturePaths = [
		...coreFixturePaths,
		...syntaxCorpusFiles.map((file) => path.posix.join(syntaxCorpusRoot, file)),
	].sort();
	const referencePaths = await publicReferencePaths(wystRoot, designFileNames);
	const mappings = new Map();
	for (const file of designFileNames) {
		addMapping(
			mappings,
			path.posix.join("vendor/wyst-design", file),
			path.posix.join("design", file),
		);
	}
	for (const { destination, source } of designCatalogs) {
		addMapping(
			mappings,
			path.posix.join("vendor/wyst-design", destination),
			source,
		);
	}
	for (const source of referencePaths) {
		addMapping(
			mappings,
			path.posix.join("vendor/wyst-reference", referenceDestination(source)),
			source,
		);
	}
	for (const source of fixturePaths) {
		addMapping(
			mappings,
			path.posix.join("tests/fixtures/wyst", source),
			source,
		);
	}
	return mappings;
}

async function verifyCopiedBytes(wystRoot, snapshotFiles) {
	const mappings = await expectedMappings(wystRoot);
	const importedPaths = Object.keys(snapshotFiles).filter(
		(file) => file !== "vendor/wyst-design/.source-commit",
	);
	for (const snapshotPath of mappings.keys()) {
		if (!Object.hasOwn(snapshotFiles, snapshotPath)) {
			throw new Error(`Wyst snapshot is missing copied file ${snapshotPath}`);
		}
	}
	for (const snapshotPath of importedPaths) {
		if (!mappings.has(snapshotPath)) {
			throw new Error(`Wyst snapshot contains unmappable copied file ${snapshotPath}`);
		}
	}
	for (const [snapshotPath, sourcePath] of mappings) {
		let snapshotBytes;
		let sourceBytes;
		try {
			[snapshotBytes, sourceBytes] = await Promise.all([
				readFile(path.join(root, ...snapshotPath.split("/"))),
				readFile(path.join(wystRoot, ...sourcePath.split("/"))),
			]);
		} catch (error) {
			throw new Error(
				`Could not compare ${snapshotPath} with Wyst source ${sourcePath}: ${error.message}`,
			);
		}
		if (!snapshotBytes.equals(sourceBytes)) {
			throw new Error(
				`Wyst snapshot copy differs from source: ${snapshotPath} != ${sourcePath}. Run npm run sync:wyst.`,
			);
		}
	}
}

const wystRoot = await findWystRoot();
const dirtySource = git(wystRoot, ["status", "--short", "--untracked-files=all"]);
if (dirtySource) {
	throw new Error(
		`Wyst checkout has uncommitted changes:\n${dirtySource}\nCommit or restore them before checking the snapshot.`,
	);
}
const sourceCommit = git(wystRoot, ["rev-parse", "HEAD"]);
const verifiedSnapshot = await verifyWystSnapshot();
const snapshotCommit = (
	await readFile(path.join(root, "vendor", "wyst-design", ".source-commit"), "utf8")
).trim();

if (snapshotCommit !== sourceCommit) {
	throw new Error(
		`Wyst snapshot is stale: expected ${sourceCommit}, found ${snapshotCommit}. Run npm run sync:wyst.`,
	);
}

await verifyCopiedBytes(wystRoot, verifiedSnapshot.files);

console.log(`Wyst snapshot matches ${sourceCommit}`);
