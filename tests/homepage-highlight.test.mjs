import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
	createHomepageSemanticArtifact,
	readHomepageSemanticArtifact,
	renderHomepageSemanticMarkup,
	updateHomepageIndex,
	verifyHomepageExample,
} from "../tools/homepage-example.mjs";

const artifact = await readHomepageSemanticArtifact();
const indexHtml = await readFile(new URL("../index.html", import.meta.url), "utf8");
const siteCss = await readFile(new URL("../assets/wyst.css", import.meta.url), "utf8");

function tokenMarkup(type, text) {
	return new RegExp(
		`<span data-token="${type}"(?: data-token-modifiers="[^"]+")?>${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</span>`,
	);
}

test("homepage markup is generated exactly from the captured wync token stream", async () => {
	assert.equal(updateHomepageIndex(indexHtml, artifact), indexHtml);
	assert.equal((await verifyHomepageExample()).excerpt.sha256, artifact.excerpt.sha256);
	assert.equal(artifact.generator, "wync-lsp-semanticTokens/full");
	assert.deepEqual(artifact.legend.tokenTypes, [
		"namespace",
		"type",
		"function",
		"variable",
		"parameter",
		"property",
		"enumMember",
		"keyword",
		"number",
		"string",
		"operator",
		"macro",
	]);
	assert.deepEqual(artifact.legend.tokenModifiers, [
		"declaration",
		"readonly",
		"defaultLibrary",
	]);
});

test("homepage keeps the compiler's semantic distinctions", () => {
	const markup = renderHomepageSemanticMarkup(artifact);
	for (const [type, token] of [
		["keyword", "register_map"],
		["type", "Pl011"],
		["property", "DR"],
		["property", "FR"],
		["property", "DATA"],
		["property", "TXFF"],
		["property", "read"],
		["property", "write"],
		["variable", "UART0"],
		["variable", "msg"],
		["variable", "i"],
		["parameter", "byte"],
		["function", "_start"],
		["function", "kernel_main"],
		["function", "uart_write"],
		["macro", "#len"],
	]) {
		assert.match(markup, tokenMarkup(type, token), `${token} should be ${type}`);
	}
	assert.doesNotMatch(
		markup,
		/class="(?:k|primitive|t|n|const|o|f|param|p|s)"/,
		"generated highlighting should not contain handwritten token classes",
	);
});

test("homepage stylesheet covers every token type in the compiler legend", () => {
	for (const type of artifact.legend.tokenTypes) {
		assert.match(
			siteCss,
			new RegExp(`\\[data-token="${type}"\\]`),
			`missing a homepage style for the ${type} semantic token`,
		);
	}
});

test("renderer keeps comments readable without inventing semantic tokens", () => {
	const markup = renderHomepageSemanticMarkup(artifact);
	assert.match(markup, /<span class="source-comment">\/\*<\/span>/);
	assert.match(
		markup,
		/<span class="source-comment block-comment-line">\* QEMU `virt`/,
	);
	assert.doesNotMatch(markup, /data-token="comment"/);
});

test("semantic-token artifact rebases the compiler stream to the marked excerpt", () => {
	const source = [
		"module fixture",
		"// homepage-example:start",
		"fn hello(value: u8) {}",
		"// homepage-example:end",
		"fn outside() {}",
		"",
	].join("\n");
	const legend = {
		tokenModifiers: ["declaration"],
		tokenTypes: ["keyword", "function", "parameter", "type"],
	};
	const inputData = [
		2, 0, 2, 0, 0,
		0, 3, 5, 1, 1,
		0, 6, 5, 2, 1,
		0, 7, 2, 3, 0,
		2, 0, 2, 0, 0,
		0, 3, 7, 1, 1,
	];
	const rebased = createHomepageSemanticArtifact({
		data: inputData,
		legend,
		source,
	});

	assert.equal(rebased.excerpt.text, "fn hello(value: u8) {}");
	assert.deepEqual(rebased.data, [
		0, 0, 2, 0, 0,
		0, 3, 5, 1, 1,
		0, 6, 5, 2, 1,
		0, 7, 2, 3, 0,
	]);
	assert.doesNotMatch(renderHomepageSemanticMarkup(rebased), /outside/);
});

test("renderer rejects token artifacts whose excerpt bytes were edited", () => {
	const tampered = structuredClone(artifact);
	tampered.excerpt.text += " ";
	assert.throws(
		() => renderHomepageSemanticMarkup(tampered),
		/invalid excerpt metadata/,
	);
});
