import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	copyFile,
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	rm,
	stat,
	unlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { verifyWystSnapshot } from "../tools/wyst-snapshot.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const designDir = path.join(root, "vendor", "wyst-design");
const fixtureDir = path.join(root, "tests", "fixtures", "wyst");
const syncScript = path.join(root, "tools", "sync-wyst-snapshot.mjs");
const snapshotScript = path.join(root, "tools", "wyst-snapshot.mjs");

const expectedFixtures = [
	"wync/tests/fixtures/common/runtime/semihost-runtime.wyst",
	"wync/tests/fixtures/qemu/virt/uart-hello/expected.txt",
	"wync/tests/fixtures/qemu/virt/uart-hello/layout.wyst",
	"wync/tests/fixtures/qemu/virt/uart-hello/main.wyst",
];

async function listFiles(dir, relative = "") {
	const files = [];
	for (const entry of await readdir(path.join(dir, relative), {
		withFileTypes: true,
	})) {
		const entryPath = path.join(relative, entry.name);
		if (entry.isDirectory()) files.push(...(await listFiles(dir, entryPath)));
		else if (entry.isFile()) files.push(entryPath.split(path.sep).join("/"));
	}
	return files.sort();
}

async function write(relativeTo, file, contents) {
	const destination = path.join(relativeTo, file);
	await mkdir(path.dirname(destination), { recursive: true });
	await writeFile(destination, contents);
}

function git(cwd, args) {
	const result = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
	assert.equal(
		result.status,
		0,
		`git ${args.join(" ")} failed:\n${result.stderr || result.stdout}`,
	);
	return result;
}

async function makeWystRepo(t) {
	const temporaryRoot = await mkdtemp(path.join(tmpdir(), "wyst-snapshot-test-"));
	t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
	const wystRoot = path.join(temporaryRoot, "wyst-source");
	const siteRoot = path.join(temporaryRoot, "wyst.dev");

	const inputs = [
		["design/README.md", "# Wyst design\n"],
		["design/chapter-deleted.md", "# Tracked chapter\n"],
		["design/semantic-db.json", "{}\n"],
		["wync/Cargo.toml", "[package]\nname = \"fixture\"\nversion = \"0.0.0\"\n"],
		["wync/fuzz/fuzz_targets/parse.rs", "fn original() {}\n"],
		[expectedFixtures[0], "# semihost runtime\n"],
		[expectedFixtures[1], "hello\n"],
		[expectedFixtures[2], "layout fixture\n"],
		[expectedFixtures[3], "main :: () {}\n"],
	];
	await Promise.all(inputs.map(([file, contents]) => write(wystRoot, file, contents)));
	await mkdir(path.join(siteRoot, "tools"), { recursive: true });
	await copyFile(syncScript, path.join(siteRoot, "tools", "sync-wyst-snapshot.mjs"));
	await copyFile(snapshotScript, path.join(siteRoot, "tools", "wyst-snapshot.mjs"));

	git(wystRoot, ["init", "--quiet"]);
	git(wystRoot, ["add", "."]);
	git(wystRoot, [
		"-c",
		"user.name=Wyst Snapshot Test",
		"-c",
		"user.email=wyst-snapshot@example.invalid",
		"commit",
		"--quiet",
		"-m",
		"fixture",
	]);

	return { siteRoot, wystRoot };
}

function runSync(siteRoot, wystRoot) {
	return spawnSync(
		process.execPath,
		[path.join(siteRoot, "tools", "sync-wyst-snapshot.mjs")],
		{
			cwd: siteRoot,
			encoding: "utf8",
			env: { ...process.env, WYST_REPO_DIR: wystRoot },
		},
	);
}

test("the versioned Wyst publication snapshot has provenance and build inputs", async () => {
	const [sourceCommit, readme, semanticDb, files] = await Promise.all([
		readFile(path.join(designDir, ".source-commit"), "utf8"),
		stat(path.join(designDir, "README.md")),
		stat(path.join(designDir, "semantic-db.json")),
		listFiles(designDir),
	]);

	assert.match(sourceCommit, /^[0-9a-f]{40,64}\n$/i);
	assert.ok(readme.isFile());
	assert.ok(semanticDb.isFile());
	assert.ok(
		files.every(
			(file) =>
				!file.includes("/") &&
				(file === ".source-commit" ||
					file === "semantic-db.json" ||
					file.endsWith(".md")),
		),
		"the design snapshot should contain only top-level publication inputs",
	);
});

test("the versioned Wyst fixture snapshot contains only site test inputs", async () => {
	assert.deepEqual(await listFiles(fixtureDir), expectedFixtures);
});

test("the committed snapshot manifest binds every imported byte", async () => {
	const snapshot = await verifyWystSnapshot();
	assert.match(snapshot.snapshotSha256, /^[0-9a-f]{64}$/);
	assert.equal(
		Object.keys(snapshot.files).length,
		(await listFiles(designDir)).length + (await listFiles(fixtureDir)).length,
	);
});

test("snapshot sync writes a deterministic byte manifest", async (t) => {
	const { siteRoot, wystRoot } = await makeWystRepo(t);
	const result = runSync(siteRoot, wystRoot);
	assert.equal(result.status, 0, result.stderr || result.stdout);
	const manifest = JSON.parse(
		await readFile(path.join(siteRoot, "vendor", "wyst-snapshot.json"), "utf8"),
	);
	assert.equal(manifest.schema, 1);
	assert.equal(manifest.sourceCommit, git(wystRoot, ["rev-parse", "HEAD"]).stdout.trim());
	assert.match(manifest.snapshotSha256, /^[0-9a-f]{64}$/);
	assert.equal(Object.keys(manifest.files).length, 8);
	assert.ok(manifest.files["vendor/wyst-design/.source-commit"]);
	for (const fixture of expectedFixtures) {
		assert.ok(manifest.files[`tests/fixtures/wyst/${fixture}`]);
	}
});

test("snapshot sync rejects a deleted tracked design chapter", async (t) => {
	const { siteRoot, wystRoot } = await makeWystRepo(t);
	await unlink(path.join(wystRoot, "design", "chapter-deleted.md"));
	await write(
		wystRoot,
		"wync/fuzz/fuzz_targets/parse.rs",
		"fn unrelated_fuzz_work() {}\n",
	);

	const result = runSync(siteRoot, wystRoot);
	assert.notEqual(result.status, 0);
	assert.match(result.stderr, /Commit or restore Wyst snapshot inputs/);
	assert.match(result.stderr, /D design\/chapter-deleted\.md/);
	assert.doesNotMatch(result.stderr, /parse\.rs/);
});

test("snapshot sync rejects an untracked top-level design input", async (t) => {
	const { siteRoot, wystRoot } = await makeWystRepo(t);
	await write(wystRoot, "design/new-chapter.md", "# New chapter\n");

	const result = runSync(siteRoot, wystRoot);
	assert.notEqual(result.status, 0);
	assert.match(result.stderr, /Commit or restore Wyst snapshot inputs/);
	assert.match(result.stderr, /\?\? design\/new-chapter\.md/);
});
