// Checks the Wyst examples of the site with a compiler:
//
//   npm run check:examples -- <path to wync>
//
// The path can also come from $WYST_WYNC, or `wync` can be on PATH.
//
// In content/docs/, the info string of a fence selects the check:
//
//   ```wyst                 a module that `wync fmt --check` accepts and
//                           that the checker accepts
//   ```wyst name.wyst       the same, with this file name
//   ```wyst fails           a module that the checker refuses; the next
//                           fence is ```text with the exact error output
//   ```wyst dir/name.wyst   a module that the other examples of the page
//                           import; the importing examples check it
//   ```wyst fragment        not checked
//
// The homepage example in content/home/ also builds with its layout.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import MarkdownIt from "markdown-it";
import { EXAMPLE, exampleLayout, exampleSource } from "../build/home.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOCS = path.join(ROOT, "content", "docs");
const WYNC = path.resolve(process.argv[2] || process.env.WYST_WYNC || "wync");

// The entry names a function that a checked module does not declare, so a
// build stops after the checker with this one error.
function layout(module) {
	return `entry ${module}._start at 0x4008_0000
region ram: readwrite at 0x4008_0000 size 0x0010_0000
section .text:    code   in ram align 16
section .el0:     code   in ram after .text align 16
section .vectors: code   in ram after .el0 align 0x800
section .rodata:  rodata in ram after .vectors align 16
section .data:    data   in ram after .rodata align 8
symbol __stack_top: u64 = 0x4010_0000
`;
}

function run(args, cwd, input) {
	const result = spawnSync(WYNC, args, { cwd, encoding: "utf8", input });
	if (result.error) throw result.error;
	return { status: result.status, stdout: result.stdout, stderr: result.stderr.trim() };
}

// Gives the first line that `wync fmt` changes, or "".
function formatChange(dir, file) {
	const source = fs.readFileSync(path.join(dir, file), "utf8");
	const fmt = run(["fmt"], dir, source);
	if (fmt.status !== 0) return fmt.stderr;
	const before = source.split("\n");
	const after = fmt.stdout.split("\n");
	const line = before.findIndex((text, i) => text !== after[i]);
	if (line === -1) return "";
	return `wync fmt changes line ${line + 1} from ${JSON.stringify(before[line])} to ${JSON.stringify(after[line])}`;
}

// Gives the error text, or "" when the checker accepts the module.
function check(dir, file, layoutText) {
	const module = file.replace(/\.wyst$/, "");
	fs.writeFileSync(path.join(dir, "check.layout"), layoutText ?? layout(module));
	const change = formatChange(dir, file);
	if (change) return change;
	const build = run(["build", file, "--layout", "check.layout", "-o", "out.elf"], dir);
	const noEntry = `check.layout:1:1: error: no function \`${module}._start\``;
	return build.status === 0 || build.stderr === noEntry ? "" : build.stderr;
}

function examples(file) {
	const tokens = new MarkdownIt().parse(fs.readFileSync(file, "utf8"), {});
	const fences = tokens.filter((token) => token.type === "fence");
	return fences
		.map((fence, i) => {
			const words = fence.info.trim().split(/\s+/);
			if (words[0] !== "wyst" || words.includes("fragment")) return null;
			const name = words.find((word) => word.endsWith(".wyst")) ?? "main.wyst";
			const fails = words.includes("fails");
			const next = fences[i + 1];
			if (fails && next?.info.trim() !== "text") {
				throw new Error(`${file}:${fence.map[0] + 1}: no \`text\` fence after \`wyst fails\``);
			}
			return {
				line: fence.map[0] + 1,
				name,
				source: fence.content,
				expected: fails ? next.content.trim() : "",
			};
		})
		.filter(Boolean);
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), "wyst-examples-"));
let failures = 0;
let count = 0;

function report(where, actual, expected) {
	count++;
	if (actual === expected) return;
	failures++;
	console.log(`${where}\n  expected: ${expected || "no error"}\n  actual:   ${actual || "no error"}`);
}

for (const file of fs.readdirSync(DOCS).filter((f) => f.endsWith(".md")).sort()) {
	const all = examples(path.join(DOCS, file));
	const support = all.filter((example) => example.name.includes("/"));
	for (const example of all.filter((example) => !example.name.includes("/"))) {
		const dir = fs.mkdtempSync(path.join(work, "example-"));
		for (const module of support) {
			fs.mkdirSync(path.join(dir, path.dirname(module.name)), { recursive: true });
			fs.writeFileSync(path.join(dir, module.name), module.source);
		}
		fs.writeFileSync(path.join(dir, example.name), example.source);
		report(`content/docs/${file}:${example.line}`, check(dir, example.name), example.expected);
	}
}

const home = fs.mkdtempSync(path.join(work, "home-"));
fs.writeFileSync(path.join(home, EXAMPLE.file), exampleSource());
report(`content/home/${EXAMPLE.file}`, check(home, EXAMPLE.file, exampleLayout()), "");

fs.rmSync(work, { recursive: true, force: true });
console.log(`${count - failures} of ${count} examples pass`);
process.exitCode = failures ? 1 : 0;
