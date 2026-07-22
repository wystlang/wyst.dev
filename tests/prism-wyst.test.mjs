import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
	registerWyst,
	wystSyntaxWords,
} from "../build/prism-wyst.mjs";

const require = createRequire(import.meta.url);
const Prism = require("prismjs");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const corpusRoot = path.join(
	root,
	"tests/fixtures/wyst/wync/tests/fixtures/syntax-corpus",
);

registerWyst(Prism);

function highlight(source) {
	return Prism.highlight(source, Prism.languages.wyst, "wyst");
}

function active(word) {
	return ["implemented", "implemented-normative"].includes(word.state);
}

test("Wyst highlighting exposes the canonical v0.9 lexical categories", () => {
	const output = highlight(`module docs.uart
pub fn uart_write(byte: u8) {
  const UARTDR: @volatile u32 = address<@volatile u32>(0x0900_0000)
  UARTDR.store(widen<u32>(byte))
  cpu.nop()
  const length: u64 = #len(['h', '\\x48'])
  if byte is 0x20 { return }
}`);

	for (const [category, token] of [
		["module keyword", '<span class="token keyword">module</span>'],
		["public keyword", '<span class="token keyword">pub</span>'],
		["function declaration", '<span class="token function">uart_write</span>'],
		["constant", '<span class="token constant">UARTDR</span>'],
		["builtin type", '<span class="token builtin type">u8</span>'],
		["compiler operation", '<span class="token directive macro">#len</span>'],
		["character", '<span class="token char">\'h\'</span>'],
		["hex character", '<span class="token char">\'\\x48\'</span>'],
		["comparison keyword", '<span class="token keyword">is</span>'],
		["number", '<span class="token number">0x20</span>'],
	]) {
		assert.ok(output.includes(token), `missing ${category} token: ${token}`);
	}
	assert.doesNotMatch(output, /token primitive/);
});

test("keyword-led declarations and calls win over naming conventions", () => {
	const output = highlight(`fn identity<T>(value: T) { }
struct Packet<T> { value: T }
const UPPER = 1
var changing = 2
UART_INIT()
dyn_array_init<Box<u8>>()`);

	for (const token of ["identity", "UART_INIT", "dyn_array_init"]) {
		assert.ok(
			output.includes(`<span class="token function">${token}</span>`),
			`${token} should be a function`,
		);
	}
	assert.ok(
		output.includes('<span class="token class-name type">Packet</span>'),
		"keyword-led generic type declarations should be types",
	);
	assert.ok(
		output.includes('<span class="token parameter">value</span>'),
		"binding names before a type annotation should be parameters",
	);
	assert.ok(
		output.includes('<span class="token constant">UPPER</span>'),
		"const declarations should be constants",
	);
	assert.ok(
		output.includes('<span class="token variable">changing</span>'),
		"var declarations should be variables",
	);
	assert.ok(
		!output.includes('<span class="token constant">T</span>'),
		"single-letter generic type parameters should not look like constants",
	);
});

test("character highlighting follows Wyst byte-literal escapes", () => {
	const output = highlight(`'h' '\\n' '\\'' '\\\\' '\\x48' 'é'`);
	assert.equal((output.match(/class="token char"/g) ?? []).length, 5);
	assert.ok(
		!output.includes('<span class="token char">\'é\'</span>'),
		"non-ASCII source text is not a valid Wyst character literal",
	);
});

test("canonical compound operators remain single tokens", () => {
	for (const operator of [
		"%%=",
		"<<=",
		">>=",
		"&&=",
		"||=",
		"&^=",
		"->",
		"..<",
		"..=",
		"..",
	]) {
		const escapedOperator = operator
			.replaceAll("&", "&amp;")
			.replaceAll("<", "&lt;");
		const category = operator.startsWith("..") ? "punctuation" : "operator";
		assert.ok(
			highlight(`left ${operator} right`).includes(
				`<span class="token ${category}">${escapedOperator}</span>`,
			),
			`${operator} should be highlighted as one ${category}`,
		);
	}
});

test("Prism derives active word dispositions from the shared catalog", () => {
	assert.ok(
		wystSyntaxWords.every((word) => word.state !== "removed"),
		"the public syntax-word catalog must not republish legacy removals",
	);
	for (const word of wystSyntaxWords.filter(
		(word) => active(word) && word.classification === "reserved",
	)) {
		const output = highlight(word.spelling);
		if (["false", "true"].includes(word.spelling)) {
			assert.match(output, /class="token boolean"/);
		} else {
			assert.match(
				output,
				/class="token keyword"/,
				`${word.spelling} should follow its active reserved disposition`,
			);
		}
	}

	for (const word of wystSyntaxWords.filter(
		(word) =>
			active(word) &&
			word.classification === "unshadowable" &&
			word.spelling.startsWith("#"),
	)) {
		assert.match(
			highlight(`${word.spelling}()`),
			/class="token directive macro"/,
			`${word.spelling} should follow its active compiler-operation disposition`,
		);
	}
});

test("the generated reference publishes the exact editor vocabulary catalogs", async () => {
	for (const catalog of [
		"attribute-catalog.tsv",
		"c-operation-adapter-catalog.tsv",
		"meta-operation-catalog.tsv",
		"syntax-words.tsv",
	]) {
		const [vendored, published] = await Promise.all([
			readFile(path.join(root, "vendor/wyst-design", catalog), "utf8"),
			readFile(path.join(root, "dist/docs", catalog), "utf8"),
		]);
		assert.equal(published, vendored, `${catalog} must be published byte-for-byte`);
	}
});

test("the published shared positive syntax corpus highlights with the final grammar", async () => {
	const manifest = await readFile(path.join(corpusRoot, "manifest.tsv"), "utf8");
	const positiveFiles = manifest
		.split("\n")
		.filter((line) => line && !line.startsWith("#"))
		.map((line) => line.split("\t"))
		.filter(([kind]) => kind === "positive")
		.map((fields) => fields[4]);
	assert.ok(positiveFiles.length > 0, "the shared corpus should publish positives");

	for (const relative of positiveFiles) {
		const source = await readFile(path.join(corpusRoot, relative), "utf8");
		assert.doesNotMatch(highlight(source), /token primitive/);
	}
});
