import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	chmod,
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
const homepageExampleScript = path.join(root, "tools", "homepage-example.mjs");
const vocabularyCatalogs = [
	"attribute-catalog.tsv",
	"meta-operation-catalog.tsv",
	"syntax-words.tsv",
];
const designCatalogs = [
	...vocabularyCatalogs,
	"c-operation-adapter-catalog.tsv",
	"declaration-roles.tsv",
];
const designAuthorities = ["language-snapshot-inputs-v1.txt"];

const coreFixtures = [
	"wync/tests/fixtures/common/runtime/semihost-runtime.wyst",
	"wync/tests/fixtures/qemu/virt/uart-hello/expected.txt",
	"wync/tests/fixtures/qemu/virt/uart-hello/layout.wyst",
	"wync/tests/fixtures/qemu/virt/uart-hello/main.wyst",
];
const syntaxCorpusManifest =
	"wync/tests/fixtures/syntax-corpus/manifest.tsv";
const fakeSyntaxCorpusFixtures = [
	syntaxCorpusManifest,
	"wync/tests/fixtures/syntax-corpus/negative/removed.wyst",
	"wync/tests/fixtures/syntax-corpus/positive/canonical.wyst",
];

async function syntaxCorpusFixtures(rootDirectory = fixtureDir) {
	const manifest = await readFile(path.join(rootDirectory, syntaxCorpusManifest), "utf8");
	const files = manifest
		.split("\n")
		.filter((line) => line && !line.startsWith("#"))
		.map((line) => line.split("\t"))
		.map((fields) => {
			assert.equal(fields.length, 6, `invalid syntax-corpus manifest row: ${fields}`);
			return path.posix.join("wync/tests/fixtures/syntax-corpus", fields[4]);
		});
	return [syntaxCorpusManifest, ...files].sort();
}

async function expectedFixtures(rootDirectory = fixtureDir) {
	return [...coreFixtures, ...(await syntaxCorpusFixtures(rootDirectory))].sort();
}

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
	const fakeWync = `#!/usr/bin/env node
const responses = [
  {
    jsonrpc: "2.0",
    id: 1,
    result: {
      capabilities: {
        semanticTokensProvider: {
          legend: {
            tokenTypes: ["namespace", "type", "function", "variable", "parameter", "property", "enumMember", "keyword", "number", "string", "operator", "macro"],
            tokenModifiers: ["declaration", "readonly", "defaultLibrary"]
          }
        }
      }
    }
  },
  { jsonrpc: "2.0", id: 2, result: { data: [1, 0, 2, 7, 4, 0, 3, 4, 2, 1] } },
  { jsonrpc: "2.0", id: 3, result: null }
];
for (const response of responses) {
  const body = JSON.stringify(response);
  process.stdout.write(\`Content-Length: \${Buffer.byteLength(body)}\\r\\n\\r\\n\${body}\`);
}
`;

	const inputs = [
		["design/README.md", "# Wyst design\n"],
		["design/chapter-deleted.md", "# Tracked chapter\n"],
		["design/semantic-db.json", "{}\n"],
		[
			"design/syntax-words.tsv",
			"// wyst.syntaxWords.v0.9\nfn\treserved\tcore.declarations\tdeclaration\timplemented\n",
		],
		[
			"design/attribute-catalog.tsv",
			"name\tstate\nalign\tactive\n",
		],
		[
			"design/meta-operation-catalog.tsv",
			"spelling\tstate\n#len\timplemented\n",
		],
		[
			"design/declaration-roles.tsv",
			"role_id\tversion\tstate\nfixture.role\t1\timplemented\n",
		],
		[
			"design/c-operation-adapter-catalog.tsv",
			"profile\tstate\nstatus-out\timplemented\n",
		],
		[
			"design/language-snapshot-inputs-v1.txt",
			"design/language-snapshot-inputs-v1.txt\n",
		],
		["wync/Cargo.toml", "[package]\nname = \"fixture\"\nversion = \"0.0.0\"\n"],
		["wync/fuzz/fuzz_targets/parse.rs", "fn original() {}\n"],
		["wync/src/main.rs", "fn compiler() {}\n"],
		[coreFixtures[0], "# semihost runtime\n"],
		[coreFixtures[1], "hello\n"],
		[coreFixtures[2], "layout fixture\n"],
		[
			coreFixtures[3],
			"// homepage-example:start\nfn main() {}\n// homepage-example:end\n",
		],
		...fakeSyntaxCorpusFixtures.map((file) => [
			file,
			file.endsWith("manifest.tsv")
				? [
						"# kind\tstage\tname\ttags\tfile\texpect",
						"positive\tparse\tcanonical\tversion-gating\tpositive/canonical.wyst\t-",
						"negative\tparse\tremoved\tversion-gating\tnegative/removed.wyst\texpected error",
						"",
					].join("\n")
				: "module syntax.fixture\n",
		]),
		["wync/fake-wync.mjs", fakeWync],
	];
	await Promise.all(inputs.map(([file, contents]) => write(wystRoot, file, contents)));
	await mkdir(path.join(siteRoot, "tools"), { recursive: true });
	await copyFile(syncScript, path.join(siteRoot, "tools", "sync-wyst-snapshot.mjs"));
	await copyFile(snapshotScript, path.join(siteRoot, "tools", "wyst-snapshot.mjs"));
	await copyFile(
		homepageExampleScript,
		path.join(siteRoot, "tools", "homepage-example.mjs"),
	);
	await write(
		siteRoot,
		"index.html",
		"<!-- homepage-semantic-example:start -->\n<pre>stale</pre>\n<!-- homepage-semantic-example:end -->\n",
	);
	await chmod(path.join(wystRoot, "wync", "fake-wync.mjs"), 0o755);

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
			env: {
				...process.env,
				NODE_ENV: "test",
				WYST_REPO_DIR: wystRoot,
				WYST_TEST_WYNC_BIN: path.join(wystRoot, "wync", "fake-wync.mjs"),
			},
		},
	);
}

test("the versioned Wyst publication snapshot has provenance and build inputs", async () => {
	const [sourceCommit, readme, semanticDb, catalogs, authorities, files] =
		await Promise.all([
			readFile(path.join(designDir, ".source-commit"), "utf8"),
			stat(path.join(designDir, "README.md")),
			stat(path.join(designDir, "semantic-db.json")),
			Promise.all(designCatalogs.map((file) => stat(path.join(designDir, file)))),
			Promise.all(
				designAuthorities.map((file) => stat(path.join(designDir, file))),
			),
			listFiles(designDir),
		]);

	assert.match(sourceCommit, /^[0-9a-f]{40,64}\n$/i);
	assert.ok(readme.isFile());
	assert.ok(semanticDb.isFile());
	assert.ok(catalogs.every((catalog) => catalog.isFile()));
	assert.ok(authorities.every((authority) => authority.isFile()));
	assert.ok(
		files.every(
			(file) =>
				!file.includes("/") &&
				(file === ".source-commit" ||
					file === "semantic-db.json" ||
					designCatalogs.includes(file) ||
					designAuthorities.includes(file) ||
					file.endsWith(".md")),
		),
		"the design snapshot should contain only top-level publication inputs",
	);
});

test("the versioned Wyst fixture snapshot contains only site test inputs", async () => {
	assert.deepEqual(await listFiles(fixtureDir), await expectedFixtures());
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
	const [manifestText, homepageTokenText, homepageIndex] = await Promise.all([
		readFile(path.join(siteRoot, "vendor", "wyst-snapshot.json"), "utf8"),
		readFile(
			path.join(siteRoot, "vendor", "wyst-homepage-semantic-tokens.json"),
			"utf8",
		),
		readFile(path.join(siteRoot, "index.html"), "utf8"),
	]);
	const manifest = JSON.parse(manifestText);
	const homepageTokens = JSON.parse(homepageTokenText);
	assert.equal(manifest.schema, 1);
	assert.equal(manifest.sourceCommit, git(wystRoot, ["rev-parse", "HEAD"]).stdout.trim());
	assert.match(manifest.snapshotSha256, /^[0-9a-f]{64}$/);
	assert.equal(
		Object.keys(manifest.files).length,
		(await listFiles(path.join(siteRoot, "vendor", "wyst-design"))).length +
			(await listFiles(path.join(siteRoot, "tests", "fixtures", "wyst"))).length,
	);
	assert.ok(manifest.files["vendor/wyst-design/.source-commit"]);
	for (const catalog of designCatalogs) {
		assert.ok(manifest.files[`vendor/wyst-design/${catalog}`]);
	}
	for (const authority of designAuthorities) {
		assert.ok(manifest.files[`vendor/wyst-design/${authority}`]);
	}
	for (const fixture of [...coreFixtures, ...fakeSyntaxCorpusFixtures].sort()) {
		assert.ok(manifest.files[`tests/fixtures/wyst/${fixture}`]);
	}
	assert.equal(homepageTokens.source.gitCommit, manifest.sourceCommit);
	assert.equal(homepageTokens.generator, "wync-lsp-semanticTokens/full");
	assert.match(
		homepageIndex,
		/<span data-token="keyword" data-token-modifiers="defaultLibrary">fn<\/span>/,
	);
	assert.match(
		homepageIndex,
		/<span data-token="function" data-token-modifiers="declaration">main<\/span>/,
	);

	const repeated = runSync(siteRoot, wystRoot);
	assert.equal(repeated.status, 0, repeated.stderr || repeated.stdout);
	assert.equal(
		await readFile(path.join(siteRoot, "vendor", "wyst-snapshot.json"), "utf8"),
		manifestText,
	);
	assert.equal(
		await readFile(
			path.join(siteRoot, "vendor", "wyst-homepage-semantic-tokens.json"),
			"utf8",
		),
		homepageTokenText,
	);
	assert.equal(await readFile(path.join(siteRoot, "index.html"), "utf8"), homepageIndex);
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

test("snapshot sync rejects compiler changes that could alter homepage tokens", async (t) => {
	const { siteRoot, wystRoot } = await makeWystRepo(t);
	await write(wystRoot, "wync/src/main.rs", "fn changed_compiler() {}\n");

	const result = runSync(siteRoot, wystRoot);
	assert.notEqual(result.status, 0);
	assert.match(result.stderr, /Commit or restore Wyst snapshot inputs/);
	assert.match(result.stderr, /wync\/src\/main\.rs/);
});

test("snapshot sync rejects syntax-corpus changes outside the committed source identity", async (t) => {
	const { siteRoot, wystRoot } = await makeWystRepo(t);
	await write(
		wystRoot,
		"wync/tests/fixtures/syntax-corpus/positive/canonical.wyst",
		"module syntax.changed\n",
	);

	const result = runSync(siteRoot, wystRoot);
	assert.notEqual(result.status, 0);
	assert.match(result.stderr, /Commit or restore Wyst snapshot inputs/);
	assert.match(
		result.stderr,
		/wync\/tests\/fixtures\/syntax-corpus\/positive\/canonical\.wyst/,
	);
});
