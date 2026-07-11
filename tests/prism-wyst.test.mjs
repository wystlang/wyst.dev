import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { registerWyst } from "../build/prism-wyst.mjs";

const require = createRequire(import.meta.url);
const Prism = require("prismjs");

registerWyst(Prism);

function highlight(source) {
	return Prism.highlight(source, Prism.languages.wyst, "wyst");
}

test("Wyst highlighting separates the safe lexical semantic categories", () => {
	const output = highlight(`pub uart_write :: (byte : u8) {
	UARTDR = byte as.widen u32
	%nop()
	uart_write('h')
	uart_write('\\x48')
	value is 0x20
}`);

	for (const [category, token] of [
		["keyword", '<span class="token keyword">pub</span>'],
		["function declaration", '<span class="token function">uart_write</span>'],
		["constant", '<span class="token constant">UARTDR</span>'],
		["builtin type", '<span class="token builtin type">u8</span>'],
		["primitive", '<span class="token primitive macro">%nop</span>'],
		["character", '<span class="token char">\'h\'</span>'],
		["hex character", '<span class="token char">\'\\x48\'</span>'],
		["comparison keyword", '<span class="token keyword">is</span>'],
		["number", '<span class="token number">0x20</span>'],
	]) {
		assert.ok(output.includes(token), `missing ${category} token: ${token}`);
	}
});

test("context wins over naming conventions for declarations and calls", () => {
	const output = highlight(`identity<T> :: (value : T) { }
Packet<T> :: struct { value : T }
UPPER := 1
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
		"generic type declarations should be types",
	);
	assert.ok(
		output.includes('<span class="token parameter">value</span>'),
		"binding names before a type annotation should be parameters",
	);
	assert.ok(
		output.includes('<span class="token variable">UPPER</span>'),
		"a mutable binding declaration should win over the all-caps convention",
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

test("compound Wyst operators remain single tokens", () => {
	for (const operator of [
		"::=",
		"%%=",
		"<<=",
		">>=",
		"&&=",
		"||=",
		"&^=",
		"::",
		":=",
		"->",
		"..",
	]) {
		const escapedOperator = operator
			.replaceAll("&", "&amp;")
			.replaceAll("<", "&lt;");
		assert.ok(
			highlight(`left ${operator} right`).includes(
				`<span class="token operator">${escapedOperator}</span>`,
			),
			`${operator} should be highlighted as one operator`,
		);
	}
});
