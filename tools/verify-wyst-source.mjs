import { spawnSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

const wystRoot = await findWystRoot();
const dirtySource = git(wystRoot, ["status", "--short", "--untracked-files=all"]);
if (dirtySource) {
	throw new Error(
		`Wyst checkout has uncommitted changes:\n${dirtySource}\nCommit or restore them before checking the snapshot.`,
	);
}
const sourceCommit = git(wystRoot, ["rev-parse", "HEAD"]);
const snapshotCommit = (
	await readFile(path.join(root, "vendor", "wyst-design", ".source-commit"), "utf8")
).trim();

if (snapshotCommit !== sourceCommit) {
	throw new Error(
		`Wyst snapshot is stale: expected ${sourceCommit}, found ${snapshotCommit}. Run npm run sync:wyst.`,
	);
}

console.log(`Wyst snapshot matches ${sourceCommit}`);
