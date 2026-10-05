import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { registerWyst, wystSyntaxWords } from "../build/prism-wyst.mjs";

const Prism = createRequire(import.meta.url)("prismjs");
registerWyst(Prism);
const binaryEnabled = ["binary", "where"].every((spelling) =>
	wystSyntaxWords.some((word) => word.spelling === spelling &&
		["implemented", "implemented-normative"].includes(word.state)),
);

function tokens(source) {
	const result = [];
	const text = (node) => typeof node === "string" ? node :
		Array.isArray(node) ? node.map(text).join("") : text(node.content);
	function visit(node) {
		if (typeof node === "string") return;
		if (Array.isArray(node)) return node.forEach(visit);
		result.push({ type: node.type, value: text(node.content) });
		visit(node.content);
	}
	const stream = Prism.tokenize(source, Prism.languages.wyst);
	assert.equal(text(stream), source, "highlighting must preserve every source byte");
	visit(stream);
	return result;
}

function values(source, type) {
	return tokens(source).filter((token) => token.type === type).map((token) => token.value);
}

test("named parameter modifiers follow the colon inside function headers", () => {
	const source = `fn attach<T>(
  count: comptime u64,
  input: mut noescape []u8,
  owner: var noescape Owner,
  callback: fn(mut noescape Owner) -> u8,
) -> Owner from input { }
fn Owner.close(self: var Owner) { }`;
	assert.deepEqual(values(source, "parameter-modifier"),
		["comptime", "mut", "noescape", "var", "noescape", "var"]);
	assert.equal(values(source, "variable").includes("noescape"), false);
	assert.ok(values(source, "class-name").includes("Owner"));
	for (const name of ["count", "input", "owner", "callback", "self"]) {
		assert.ok(values(source, name === "callback" ? "function" : "parameter").includes(name));
	}
});

test("parameter highlighting preserves contextual types and other colon positions", () => {
	const source = `fn names(mut: mut, comptime: comptime, noescape: noescape,
  first: mut noescape, second: comptime mut) { }
struct Record { mut: mut noescape: noescape }
fn body() {
  comptime var count: u64 = 1
  const value: mut = input
  target(mut value)
}
fn obsolete(mut input: []u8, comptime count: u64) { }`;
	assert.deepEqual(values(source, "parameter-modifier"), ["mut", "comptime"]);
	assert.ok(values(source, "variable").includes("count"));
	assert.ok(values(source, "parameter").includes("noescape"));
	assert.equal(values(source, "parameter-contract").length, 2);
	assert.deepEqual(values(`fn comments(value: u8 /* decoy: var noescape Owner */) { }
// fn hidden(input: mut noescape []u8) { }
const text = "fn literal(input: mut noescape []u8) { }"`, "parameter-modifier"), []);
});

test("binary declarations use the active catalog and retain schema roles", () => {
	const source = `pub binary Samples(width: u8) where(width > 0) {
  where: u8
  count: u16(endian = .big)
  values: [count]u64(bits = width, bit_order = .msb_first, pad_to = 1B, fill = 0)
  children: [count]Child(width)
  opaque: bits(length = width, bit_order = .lsb_first)
} where(count >= 0)`;
	assert.deepEqual(values(source, "binary-keyword"), binaryEnabled ? ["binary", "where", "where"] : []);
	assert.deepEqual(values(source, "binary-schema-name"), binaryEnabled ? ["Samples"] : []);
	if (binaryEnabled) {
		for (const atom of ["u8", "u16", "u64", "Child", "bits"]) {
			assert.ok(values(source, "binary-format-name").includes(atom), atom);
			assert.equal(values(source, "function").includes(atom), false, atom);
		}
		assert.ok(values(source, "parameter").includes("where"));
	}
});

test("binary context does not promote ordinary identifier calls or field names", () => {
	const source = `fn binary(where: u8, bits: u8) -> u8 { return where + bits }
fn where(value: u8) -> u8 { return value }
struct Record { binary: u8 where: u8 bits: u8 pad_to: u8 fill: u8 }
fn use() { binary(where(1), 2) }
binary Container { where: u8 bits: u8 value: where(count = 1) }
// binary Comment { where(false) }
const text = "binary Literal { where(false) }"`;
	assert.deepEqual(values(source, "binary-keyword"), binaryEnabled ? ["binary"] : []);
	assert.ok(values(source, "function").includes("binary"));
	assert.ok(values(source, "function").includes("where"));
	if (binaryEnabled) assert.ok(values(source, "binary-format-name").includes("where"));
});

test("binary comments and predicates keep their source boundaries", () => {
	const source = `binary /* header } */ Header(count: u8)
  where /* predicate ) } */ ((count > 0) && (count < 8))
{
  // A delimiter in a comment does not end the schema: }
  data: [count] /* format */ u8 /* where(false) { */
} where(count != 4)`;
	assert.deepEqual(values(source, "binary-keyword"), binaryEnabled ? ["binary", "where", "where"] : []);
	assert.deepEqual(values(source, "binary-schema-name"), binaryEnabled ? ["Header"] : []);
	assert.equal(values(source, "comment").length, 5);
	if (binaryEnabled) assert.ok(values(source, "binary-format-name").includes("u8"));
});

test("parameter contracts keep comment trivia", () => {
	const source = `fn trivia(value: /* start */ mut/* mode */ noescape []u8,
  owner: var /* owner */ noescape Owner, count: comptime // stage
  u64) { }`;
	assert.deepEqual(values(source, "parameter-modifier"),
		["mut", "noescape", "var", "noescape", "comptime"]);
	assert.equal(values(source, "comment").length, 4);
});

test("contextual parameter types stay types before register placement", () => {
	assert.deepEqual(values(`fn aliases(a: mut in x0, b: comptime in x1,
  c: noescape in x2, d: mut noescape in x3) { }`, "parameter-modifier"), ["mut"]);
	assert.deepEqual(values(`fn decoys(a: /* fake: var noescape Owner */ mut in x0,
  b: mut /* noescape Owner */ noescape in x1) { }`, "parameter-modifier"), ["mut"]);
});

test("binary dotted child formats retain comment trivia", () => {
	const source = `binary Case {
  first: child /* module */ .Schema(1)
  second: [count] child. /* member */ Schema(2)
}`;
	const formats = values(source, "binary-format-name")
		.map((value) => value.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s/g, ""));
	assert.deepEqual(formats, binaryEnabled ? ["child.Schema", "child.Schema"] : []);
	assert.equal(values(source, "comment").length, 2);
	if (binaryEnabled) assert.equal(values(source, "function").includes("Schema"), false);
});
