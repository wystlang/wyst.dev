import assert from "node:assert/strict";
import { access, chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { extractExamples, verifyGuides } from "../tools/verify-guide-examples.mjs";

const source = "module example.valid\n\nfn value() -> u64 {\n  return 1\n}\n";
const markdown = `# Example\n\n\`\`\`wyst\n${source}\`\`\`\n`;
const { sourceCommit } = JSON.parse(await readFile(
	new URL("../vendor/wyst-snapshot.json", import.meta.url), "utf8",
));

test("extracts source locations and skips code quoted inside a longer fence", () => {
	const quoted = `\`\`\`\`text\n${markdown}\`\`\`\`\n`;
	assert.deepEqual(extractExamples(markdown + quoted, "guide.md"), [{
		source,
		module: "example.valid",
		location: "guide.md:3",
	}]);
});

test("rejects missing modules, unsafe module paths, and incomplete fences", () => {
	for (const invalid of ["", "module ../escape\n", "module first\nmodule second\n"]) {
		assert.throws(
			() => extractExamples(`\`\`\`wyst\n${invalid}\`\`\`\n`, "guide.md"),
			/guide.md:1: expected one complete module declaration/,
		);
	}
	assert.throws(() => extractExamples(`# Guide\n`, "guide.md"), /no Wyst examples/);
	assert.throws(
		() => extractExamples(`\`\`\`wyst\n${source}`, "guide.md"),
		/unterminated Wyst fence/,
	);
});

async function fixture(t, { sourceId = sourceCommit, failCommand } = {}) {
	const directory = await mkdtemp(path.join(os.tmpdir(), "wyst-guide-test-"));
	t.after(() => rm(directory, { recursive: true, force: true }));
	const guide = path.join(directory, "guide with spaces.md");
	const compiler = path.join(directory, "fake wync.mjs");
	const log = path.join(directory, "commands.jsonl");
	await writeFile(guide, markdown);
	await writeFile(compiler, `#!/usr/bin/env node
import { appendFileSync, readFileSync } from "node:fs";
const args = process.argv.slice(2);
if (args[0] === "--version") {
  console.log(JSON.stringify({ name: "wync", sourceId: ${JSON.stringify(sourceId)} }));
} else {
  appendFileSync(${JSON.stringify(log)}, JSON.stringify(args) + "\\n");
  if (args[0] === "fmt") {
    if (args[2] !== "--check") throw new Error("formatter must be read-only");
    readFileSync(args[1], "utf8");
  } else {
    const project = readFileSync(args[1] + "/wyst.project", "utf8");
    if (!project.includes("root example.valid")) throw new Error("wrong project module");
  }
  if (args[0] === ${JSON.stringify(failCommand)}) {
    console.error("example compiler rejection");
    process.exitCode = 1;
  }
}
`);
	await chmod(compiler, 0o755);
	return { guide, compiler, log };
}

test("validates paths with spaces, preserves the guide, and removes temporary projects", async (t) => {
	const { guide, compiler, log } = await fixture(t);
	assert.deepEqual(await verifyGuides({ wync: compiler, files: [guide] }), {
		count: 1,
		sourceCommit,
	});
	const commands = (await readFile(log, "utf8")).trim().split("\n").map(JSON.parse);
	assert.deepEqual(commands.map(([command]) => command), ["fmt", "check", "build"]);
	assert.equal(await readFile(guide, "utf8"), markdown);
	await assert.rejects(access(commands[1][1]), { code: "ENOENT" });
});

test("rejects a different compiler before validating any example", async (t) => {
	const { guide, compiler, log } = await fixture(t, { sourceId: "different-commit" });
	await assert.rejects(
		verifyGuides({ wync: compiler, files: [guide] }),
		/compiler sourceId different-commit does not match/,
	);
	await assert.rejects(access(log), { code: "ENOENT" });
});

for (const failCommand of ["fmt", "check", "build"]) {
	test(`reports ${failCommand} failure at the source fence and cleans up`, async (t) => {
		const { guide, compiler, log } = await fixture(t, { failCommand });
		await assert.rejects(
			verifyGuides({ wync: compiler, files: [guide] }),
			(error) => error.message.includes(`${guide}:3: wync ${failCommand} failed`) &&
				error.message.includes("example compiler rejection"),
		);
		const commands = (await readFile(log, "utf8")).trim().split("\n").map(JSON.parse);
		assert.equal(commands.at(-1)[0], failCommand);
		assert.equal(await readFile(guide, "utf8"), markdown);
		await assert.rejects(access(commands[0][1]), { code: "ENOENT" });
	});
}
