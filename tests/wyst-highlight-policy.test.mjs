import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
	compilerAttributePatterns,
	compilerAttributeSpellings,
	compilerOperationSpellings,
} from "../build/wyst-highlight-catalog.mjs";
import {
	COMPILER_DIRECTIVE_CATEGORY,
	COMPILER_DIRECTIVE_MODIFIERS,
	compilerAttributePunctuationSpans,
} from "../build/wyst-highlight-policy.mjs";

const cases = JSON.parse(
	await readFile(
		new URL("./fixtures/highlighting/compiler-directives.json", import.meta.url),
		"utf8",
	),
);

function highlightedPunctuation(source) {
	return compilerAttributePunctuationSpans(source).map(({ start, end }) =>
		source.slice(start, end),
	);
}

test("shared policy owns the compiler-directive category and catalogs", () => {
	assert.equal(COMPILER_DIRECTIVE_CATEGORY, "macro");
	assert.deepEqual(COMPILER_DIRECTIVE_MODIFIERS, ["defaultLibrary"]);
	for (const spelling of ["#static_assert", "#size_of", "#link_value"]) {
		assert.ok(compilerOperationSpellings.includes(spelling));
	}
	for (const spelling of ["align", "section", "fixed_layout", "unroll", "inline"]) {
		assert.ok(compilerAttributeSpellings.includes(spelling));
	}
});

test("shared policy colors only grouped attribute punctuation", () => {
	assert.deepEqual(highlightedPunctuation(cases.groupedAttributes), [
		"#[",
		",",
		"]",
	]);
	assert.deepEqual(highlightedPunctuation(cases.nestedArguments), ["#[", "]"]);
	assert.deepEqual(
		highlightedPunctuation(
			`// ${cases.groupedAttributes}\n"${cases.groupedAttributes.replaceAll('"', '\\"')}"`,
		),
		[],
	);
});

test("Prism's attribute-group projection remains a nonempty RegExp", () => {
	assert.ok(compilerAttributePatterns.group instanceof RegExp);
	assert.equal(compilerAttributePatterns.group.exec("as"), null);
	const source = '#[section(".image]header"), align(4)]';
	assert.equal(compilerAttributePatterns.group.exec(source)?.[0], source);
});
