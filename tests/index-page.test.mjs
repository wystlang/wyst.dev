import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const docsSourceOfTruthHtml = await readFile(
	new URL("../docs/source-of-truth/index.html", import.meta.url),
	"utf8",
);
const notFoundHtml = await readFile(new URL("../404.html", import.meta.url), "utf8");
const prepareWorkerAssetsScript = await readFile(
	new URL("../tools/prepare-worker-assets.mjs", import.meta.url),
	"utf8",
);
const cargoManifest = fileURLToPath(
	new URL("../../wyst/wync/Cargo.toml", import.meta.url),
);

function extractObjectLiteral(name, endNeedle) {
	const assignmentStart = html.indexOf(`const ${name} = `);
	assert.notEqual(assignmentStart, -1, `missing ${name} object`);

	const objectStart = html.indexOf("{", assignmentStart);
	const afterObject = html.indexOf(endNeedle, objectStart);
	assert.notEqual(afterObject, -1, `missing ${name} end marker`);

	const objectEnd = html.lastIndexOf("};", afterObject);
	assert.notEqual(objectEnd, -1, `missing ${name} closing brace`);

	return html.slice(objectStart, objectEnd + 1);
}

function token(_className, text) {
	return text;
}

function evaluateObject(name, endNeedle) {
	return Function(
		"token",
		`"use strict"; return (${extractObjectLiteral(name, endNeedle)});`,
	)(token);
}

const codeBlocks = evaluateObject("codeBlocks", "const snippets = ");
const snippets = evaluateObject("snippets", 'document.querySelectorAll("[data-code]")');

function provenanceAttributes(name) {
	const match = html.match(
		new RegExp(`<[^>]+data-example-provenance="${name}"[^>]*>`),
	);
	assert.ok(match, `${name} should have a provenance element`);

	return Object.fromEntries(
		[...match[0].matchAll(/\s(data-[\w-]+)="([^"]*)"/g)].map(
			([, key, value]) => [key, value],
		),
	);
}

function siteHeaderHtml(pageHtml) {
	const match = pageHtml.match(/<header class="site">([\s\S]*?)<\/header>/);
	assert.ok(match, "missing site header");
	return match[1];
}

function siteFooterHtml(pageHtml) {
	const match = pageHtml.match(/<footer class="site">([\s\S]*?)<\/footer>/);
	assert.ok(match, "missing site footer");
	return match[1];
}

function escapeRegExp(text) {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtmlText(text) {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function sectionHtmlByStart(pageHtml, startNeedle) {
	const start = pageHtml.indexOf(startNeedle);
	assert.notEqual(start, -1, `missing section start ${startNeedle}`);
	const end = pageHtml.indexOf("</section>", start);
	assert.notEqual(end, -1, `missing section end ${startNeedle}`);
	return pageHtml.slice(start, end + "</section>".length);
}

test("landing page tracks the v0.8 draft language surface", () => {
	assert.match(html, /<span class="ver">v0\.8-draft<\/span>/);
	assert.match(html, /<li><b>Version:<\/b> v0\.8-draft, pre-1\.0<\/li>/);
	assert.doesNotMatch(html, /The current v0\.7 compiler/);
	assert.doesNotMatch(html, /<li><b>Version:<\/b> v0\.7/);
});

test("site headers do not include the old lang brand tag", async () => {
	const pages = [
		["home", html],
		["source-of-truth docs", docsSourceOfTruthHtml],
		["404", notFoundHtml],
		[
			"examples",
			await readFile(new URL("../examples/index.html", import.meta.url), "utf8"),
		],
	];

	for (const [name, pageHtml] of pages) {
		assert.doesNotMatch(
			siteHeaderHtml(pageHtml),
			/<span class="tag">lang<\/span>/,
			`${name} header should not show the lang tag`,
		);
	}
});

test("site footers do not link the examples page", async () => {
	const pages = [
		["home", html],
		["source-of-truth docs", docsSourceOfTruthHtml],
		["404", notFoundHtml],
	];

	for (const [name, pageHtml] of pages) {
		const footerHtml = siteFooterHtml(pageHtml);
		assert.doesNotMatch(
			footerHtml,
			/href="\/examples\/"/,
			`${name} footer should not link examples page`,
		);
	}
});

test("landing page states current limits near the top", () => {
	assert.match(html, /aria-label="Current Wyst limits and validation"/);
	for (const phrase of [
		"ARM64 only",
		"QEMU-tested",
		"Rust bootstrap compiler",
		"not self-hosting",
		"not memory-safe",
		"no LLVM backend",
		"v0.8-draft",
	]) {
		assert.match(html, new RegExp(phrase));
	}
});

test("landing page uses narrow positioning and avoids overbroad safety copy", () => {
	assert.match(
		html,
		/ARM64 bare-metal and kernel-oriented language and assembler/,
	);
	assert.match(html, /No UB-powered rewrites/);
	assert.match(html, /invalid memory access can still fault\s+or misbehave/);
	assert.doesNotMatch(html, /Zero UB Exploitation/);
	assert.doesNotMatch(html, /Defined\s+inputs produce defined output/);
});

test("hero keeps calls to action focused", () => {
	const match = html.match(
		/<div class="cta-row">([\s\S]*?)<\/div>\s*<\/div>\s*<div class="hero-card">/,
	);
	assert.ok(match, "hero CTA row should exist");

	const heroCtas = [...match[1].matchAll(/<a\b[^>]*href="([^"]+)"[\s\S]*?>([\s\S]*?)<\/a\s*>/g)]
		.map(([, href, body]) => ({
			href,
			label: body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(),
		}));

	assert.deepEqual(heroCtas, [
		{ href: "/docs/", label: "Read the Docs →" },
		{ href: "#examples", label: "View examples" },
	]);
});

test("homepage examples carry explicit provenance labels", () => {
	for (const name of [...Object.keys(codeBlocks), ...Object.keys(snippets)]) {
		assert.match(
			html,
			new RegExp(`data-example-provenance="${name}"`),
			`${name} should have a provenance marker`,
		);
	}

	assert.match(html, /checked by website tests/);
	assert.match(html, /illustrative excerpt/);
	assert.doesNotMatch(html, /Reproduce this/);
});

test("compiler-checked homepage examples declare type and entry metadata", () => {
	assert.deepEqual(Object.keys(snippets), []);

	for (const [name, entry] of [["hero-uart", "uart_write"]]) {
		const attrs = provenanceAttributes(name);
		assert.equal(attrs["data-example-kind"], "wyst-source");
		assert.equal(attrs["data-example-entry"], entry);
	}

	assert.equal(
		provenanceAttributes("compare-wyst")["data-example-kind"],
		"wyst-source-excerpt",
	);
	assert.equal(
		provenanceAttributes("compare-arm64")["data-example-kind"],
		"assembly-excerpt",
	);
});

test("homepage omits the evidence section while retaining primary sections", () => {
	const headerHtml = siteHeaderHtml(html);
	const evidenceIndex = html.indexOf('id="evidence"');
	const philosophyIndex = html.indexOf('id="philosophy"');
	const examplesIndex = html.indexOf('id="examples"');
	const nonGoalsIndex = html.indexOf('id="not"');
	const faqIndex = html.indexOf('id="faq"');

	assert.equal(evidenceIndex, -1, "evidence section should be removed");
	assert.notEqual(philosophyIndex, -1, "missing philosophy section");
	assert.notEqual(examplesIndex, -1, "missing examples section");
	assert.notEqual(nonGoalsIndex, -1, "missing non-goals section");
	assert.notEqual(faqIndex, -1, "missing FAQ section");
	assert.ok(philosophyIndex < examplesIndex, "principles should precede examples");
	assert.ok(examplesIndex < nonGoalsIndex, "examples should precede non-goals");
	assert.ok(nonGoalsIndex < faqIndex, "non-goals should precede FAQ");

	assert.doesNotMatch(html, /class="sec evidence-band"/);
	assert.doesNotMatch(html, /class="evidence-grid"/);
	assert.doesNotMatch(html, /Evidence first/);
	assert.doesNotMatch(html, /Artifacts before claims/);
	assert.doesNotMatch(html, /QEMU fixtures/);
	assert.doesNotMatch(html, /deterministic rebuild proof/);
	assert.doesNotMatch(html, /release gates/);
	assert.doesNotMatch(html, /id="overview"/);
	assert.doesNotMatch(html, /class="sec overview-band"/);
	assert.doesNotMatch(headerHtml, /href="#evidence"/);
	assert.match(headerHtml, /<a href="#not">Non-goals<\/a>/);
	assert.match(headerHtml, /<a href="#faq">FAQ<\/a>/);
	assert.doesNotMatch(headerHtml, /href="#overview"/);
});

test("homepage owns project status without a standalone status route", async () => {
	const statusSection = sectionHtmlByStart(
		html,
		'<section class="sec status-sec" id="status">',
	);

	for (const phrase of [
		"Project status",
		"Built in the open. Early, but real.",
		"ARM64 only",
		"QEMU-tested",
		"Rust bootstrap compiler",
		"not self-hosting",
		"not memory-safe",
		"no LLVM backend",
		"v0.8-draft",
	]) {
		assert.match(html, new RegExp(phrase));
	}

	for (const pageHtml of [
		html,
		notFoundHtml,
		await readFile(new URL("../examples/index.html", import.meta.url), "utf8"),
	]) {
		assert.doesNotMatch(pageHtml, /href="\/status\/"/);
	}

	assert.doesNotMatch(prepareWorkerAssetsScript, /"status"/);
	await assert.rejects(
		readFile(new URL("../status/index.html", import.meta.url), "utf8"),
	);

	for (const duplicate of [
		"v0.8-draft",
		"Rust bootstrap",
		"ARM64",
		"QEMU",
		"self-hosting",
		"no LLVM backend",
		"not memory-safe",
	]) {
		assert.doesNotMatch(
			statusSection,
			new RegExp(duplicate),
			`project status card should not duplicate Current reality fact: ${duplicate}`,
		);
	}
});

test("FAQ directly preempts common skeptical-reader questions", () => {
	const faqSection = sectionHtmlByStart(html, '<section class="sec" id="faq">');

	for (const question of [
		"What can be built today?",
		"Why isn't Wyst self-hosting?",
		"Why no LLVM backend?",
		"Is Wyst safer than C?",
		"What happens on invalid memory access?",
		"What should I not use Wyst for?",
	]) {
		assert.match(faqSection, new RegExp(question.replace(/[?]/g, "\\?")));
	}

	assert.match(faqSection, /not memory-safe/);
	assert.match(faqSection, /invalid memory access can still fault\s+or misbehave/);
	assert.match(faqSection, /no LLVM backend/);
});

test("homepage and worker assets omit removed migration guides", () => {
	assert.doesNotMatch(html, /class="migration-strip"/);
	assert.doesNotMatch(html, /Migration guides/);

	for (const route of [
		"coming-from-c",
		"coming-from-assembly",
		"coming-from-rust-zig",
	]) {
		assert.doesNotMatch(html, new RegExp(`href="/${route}/"`));
		assert.doesNotMatch(prepareWorkerAssetsScript, new RegExp(`"${route}"`));
	}
});

test("examples page presents compiler-backed sum_to plus additional static examples", async () => {
	const examplesHtml = await readFile(
		new URL("../examples/index.html", import.meta.url),
		"utf8",
	);
	const reportText = await readFile(
		new URL(
			"../../wyst/wync/tests/fixtures/reports/sum-to-lowering/expected.txt",
			import.meta.url,
		),
		"utf8",
	);
	const reportJson = JSON.parse(
		await readFile(
			new URL(
				"../../wyst/wync/tests/fixtures/reports/sum-to-lowering/expected.json",
				import.meta.url,
			),
			"utf8",
		),
	);
	const disasm = await readFile(
		new URL(
			"../../wyst/wync/tests/fixtures/reports/sum-to-lowering/expected.disasm",
			import.meta.url,
		),
		"utf8",
	);

	assert.match(examplesHtml, /href="\/examples\/"/);
	assert.doesNotMatch(html, /href="\/try\/"/);
	assert.match(prepareWorkerAssetsScript, /"examples"/);
	assert.doesNotMatch(prepareWorkerAssetsScript, /"try"/);
	await assert.rejects(
		readFile(new URL("../try/index.html", import.meta.url), "utf8"),
	);

	for (const phrase of [
		"Examples with compiler artifacts",
		"compiler-backed",
		"sum_to",
		"Additional examples",
		"MMIO UART write",
		"Release/acquire flag",
		"EL1 vector sketch",
		"No arbitrary code execution",
		"Source",
		"Explain report",
		"Generated AArch64",
		"Bytes / provenance",
		"wync explain lowering",
	]) {
		assert.match(examplesHtml, new RegExp(phrase));
	}

	assert.equal(reportJson.function.name, "sum_to");
	assert.equal(reportJson.project, "examples-sum-to");
	assert.match(reportText, /function: \$\d+ sum_to/);
	assert.match(reportText, /arm64 instructions \[provenance=arm64-lowering freshness=current-run\]/);
	assert.match(disasm, /\.text addr=/);
	assert.match(disasm, /b\.cond/);
	assert.match(disasm, /ret/);

	assert.match(
		examplesHtml,
		/data-report-fixture="\.\.\/wyst\/wync\/tests\/fixtures\/reports\/sum-to-lowering"/,
	);
	assert.match(
		examplesHtml,
		new RegExp(
			escapeRegExp(
				escapeHtmlText(`function: ${reportJson.function.symbol} sum_to`),
			),
		),
	);
	for (const item of reportJson.arm64Instructions.items.slice(0, 4)) {
		assert.match(examplesHtml, new RegExp(escapeRegExp(item.bytes)));
		assert.match(examplesHtml, new RegExp(escapeRegExp(item.encoding)));
	}
	for (const line of [".text addr=", "b.cond", "b", "ret"]) {
		assert.match(examplesHtml, new RegExp(escapeRegExp(line)));
	}
	assert.match(examplesHtml, /<pre class="wyst-code language-wyst"/);
	assert.match(examplesHtml, /<span class="token keyword">while<\/span>/);
	for (const card of ["mmio-uart", "release-acquire", "el1-vector"]) {
		assert.match(
			examplesHtml,
			new RegExp(`data-example-card="${card}"`),
			`${card} should be an examples-page card`,
		);
	}
	assert.match(examplesHtml, /<span class="token directive macro">#module<\/span> drivers\.uart/);
	assert.match(examplesHtml, /<span class="token directive macro">#release<\/span>/);
	assert.match(examplesHtml, /<span class="token directive macro">#exception_vector<\/span>/);
	assert.match(examplesHtml, /static language example/);
	assert.doesNotMatch(examplesHtml, /data-inspector-example="uart"/);
	assert.doesNotMatch(examplesHtml, /data-inspector-example="atomic"/);
	assert.doesNotMatch(examplesHtml, /Static inspector/);
	assert.doesNotMatch(examplesHtml, /Try Wyst/);
	assert.doesNotMatch(examplesHtml, /<textarea/i);
	assert.doesNotMatch(examplesHtml, /contenteditable/i);
	assert.doesNotMatch(examplesHtml, /fetch\s*\(/);
	assert.doesNotMatch(examplesHtml, /WebSocket/);
	assert.doesNotMatch(examplesHtml, /eval\s*\(/);
});

test("generated pages track the v0.8 draft header badge", () => {
	for (const [name, pageHtml] of [
		["source-of-truth docs", docsSourceOfTruthHtml],
		["404", notFoundHtml],
	]) {
		assert.match(
			pageHtml,
			/<span class="ver">v0\.8-draft<\/span>/,
			`${name} should use the draft header badge`,
		);
		assert.doesNotMatch(
			pageHtml,
			/<span class="ver">v0\.7<\/span>/,
			`${name} should not use the old release badge`,
		);
	}
});

test("generated pages do not link removed homepage example anchors", () => {
	for (const [name, pageHtml] of [
		["source-of-truth docs", docsSourceOfTruthHtml],
		["404", notFoundHtml],
	]) {
		assert.doesNotMatch(pageHtml, /\/#compare/, `${name} should not link #compare`);
		assert.doesNotMatch(pageHtml, /\/#inspect/, `${name} should not link #inspect`);
		assert.match(pageHtml, /href="\/examples\/"/, `${name} should link examples page`);
	}

	assert.doesNotMatch(prepareWorkerAssetsScript, /"try"/);
});

test("homepage presents the side-by-side sum_to comparison", () => {
	assert.match(siteHeaderHtml(html), /<a href="#examples">Examples<\/a>/);
	assert.match(html, /id="examples"/);
	assert.match(html, /Side by side/);
	assert.match(html, /See what you're actually doing/);
	assert.match(html, /data-code="compare-c"/);
	assert.match(html, /data-code="compare-arm64"/);
	assert.match(html, /data-code="compare-wyst"/);
	assert.match(codeBlockText("compare-c"), /int sum_to\(int n\)/);
	assert.match(codeBlockText("compare-arm64"), /sum_to:/);
	assert.match(codeBlockText("compare-wyst"), /#module demo\.math/);
	assert.match(codeBlockText("compare-wyst"), /while i < n/);
	assert.match(html, /The <code>while<\/code> loop lowers to the/);
	assert.doesNotMatch(html, /href="#compare"/);
	assert.doesNotMatch(html, /href="#explain"/);
	assert.doesNotMatch(html, /Examples with compiler artifacts/);
	assert.doesNotMatch(html, /data-example-artifact="sum-to"/);
	assert.doesNotMatch(html, /data-report-fixture=/);
	assert.doesNotMatch(html, /Explain report/);
	assert.doesNotMatch(html, /Generated AArch64/);
	assert.doesNotMatch(html, /Bytes \/ provenance/);
	assert.doesNotMatch(html, /wync explain lowering/);
	assert.doesNotMatch(html, /<textarea/i);
	assert.doesNotMatch(html, /contenteditable/i);
	assert.doesNotMatch(html, /fetch\s*\(/);
	assert.doesNotMatch(html, /WebSocket/);
	assert.doesNotMatch(html, /eval\s*\(/);
});

test("homepage does not duplicate the examples page card grid", () => {
	assert.doesNotMatch(html, /id="inspect"/);
	assert.doesNotMatch(html, /href="#inspect"/);
	assert.doesNotMatch(html, /data-snippet=/);
	assert.deepEqual(Object.keys(snippets), []);

	assert.doesNotMatch(html, /Additional examples/);
	assert.doesNotMatch(html, /MMIO UART write/);
	assert.doesNotMatch(html, /Release\/acquire flag/);
	assert.doesNotMatch(html, /EL1 vector sketch/);
	for (const card of ["mmio-uart", "release-acquire", "el1-vector"]) {
		assert.doesNotMatch(
			html,
			new RegExp(`data-example-card="${card}"`),
			`${card} should not be duplicated on the homepage`,
		);
	}
	assert.doesNotMatch(html, /static language example/);
});

test("removed migration comparisons are not presented on the homepage", () => {
	assert.doesNotMatch(html, /data-language-comparison=/);
	assert.doesNotMatch(html, /Coming from C/);
	assert.doesNotMatch(html, /Coming from assembly/);
	assert.doesNotMatch(html, /Coming from Rust or Zig/);
	assert.doesNotMatch(html, /Familiar concept/);
	assert.doesNotMatch(html, /Wyst equivalent/);
});

test("UART examples use MMIO-intent addresses, not volatile as MMIO shorthand", () => {
	assert.match(html, /<b>@mmio<\/b> records\s+MMIO intent/);
	assert.doesNotMatch(html, /<b>@volatile<\/b> marks\s+MMIO/);

	assert.match(codeBlockText("hero-uart"), /UARTDR :: @mmio u32 = 0x0900_0000/);
	assert.match(codeBlockText("hero-uart"), /UARTFR :: @mmio u32 = 0x0900_0018/);
	assert.doesNotMatch(codeBlockText("hero-uart"), /@volatile u32/);
});

function renderLines(lines) {
	return lines.map((line) => line.join("")).join("\n");
}

function codeBlockText(name) {
	assert.ok(codeBlocks[name], `missing ${name} code block`);
	return renderLines(codeBlocks[name]);
}

function snippetText(name) {
	assert.ok(snippets[name], `missing ${name} snippet`);
	return renderLines(snippets[name].lines);
}

function exampleText(name) {
	if (codeBlocks[name]) {
		return codeBlockText(name);
	}
	return snippetText(name);
}

function compilerCheckedSourceExamples() {
	return [...Object.keys(codeBlocks), ...Object.keys(snippets)]
		.map((name) => ({ name, attrs: provenanceAttributes(name) }))
		.filter(({ attrs }) => attrs["data-example-kind"] === "wyst-source")
		.map(({ name, attrs }) => ({
			name,
			entry: attrs["data-example-entry"],
			source: exampleText(name),
		}));
}

async function assertWyncCheckPasses(name, source) {
	const dir = await mkdtemp(join(tmpdir(), "wyst-index-"));
	const path = join(dir, `${name}.wyst`);
	const layoutPath = join(dir, "layout.wyst");

	try {
		await writeFile(path, source);
		await writeFile(
			layoutPath,
			[
				"#module layout",
				"",
				"#region ram : origin = 0x4000_0000, size = 0x0010_0000, attrs = (readwrite)",
				"#entry _start at 0x4000_0000",
				"",
			].join("\n"),
		);
		const result = spawnSync(
			"cargo",
			[
				"run",
				"--quiet",
				"--manifest-path",
				cargoManifest,
				"--",
				"check",
				path,
				"--layout",
				layoutPath,
				"--target",
				"qemu-virt-aarch64-el2",
			],
			{ encoding: "utf8" },
		);

		assert.equal(
			result.status,
			0,
			`${name} should pass wync check\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
		);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

async function assertWyncBuildPasses(name, source, entry) {
	const dir = await mkdtemp(join(tmpdir(), "wyst-index-"));
	const path = join(dir, `${name}.wyst`);
	const layoutPath = join(dir, "layout.wyst");
	const outPath = join(dir, `${name}.elf`);

	try {
		await writeFile(path, source);
		await writeFile(
			layoutPath,
			[
				"#module layout",
				"",
				"#region ram : origin = 0x4000_0000, size = 0x0010_0000, attrs = (readwrite)",
				`#entry ${entry} at 0x4000_0000`,
				"",
			].join("\n"),
		);
		const build = spawnSync(
			"cargo",
			[
				"run",
				"--quiet",
				"--manifest-path",
				cargoManifest,
				"--",
				"build",
				path,
				"--layout",
				layoutPath,
				"--target",
				"qemu-virt-aarch64-el2",
				"-o",
				outPath,
			],
			{ encoding: "utf8" },
		);

		assert.equal(
			build.status,
			0,
			`${name} should pass wync build\nstdout:\n${build.stdout}\nstderr:\n${build.stderr}`,
		);

		const disasm = spawnSync(
			"cargo",
			[
				"run",
				"--quiet",
				"--manifest-path",
				cargoManifest,
				"--",
				"disasm",
				outPath,
			],
			{ encoding: "utf8" },
		);

		assert.equal(
			disasm.status,
			0,
			`${name} should disassemble after wync build\nstdout:\n${disasm.stdout}\nstderr:\n${disasm.stderr}`,
		);
		assert.match(disasm.stdout, /\.text addr=/);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

test("index examples that are presented as real source pass wync check", async (t) => {
	const examples = compilerCheckedSourceExamples();
	assert.equal(examples.length, 1);

	for (const { name, source } of examples) {
		await t.test(name, () => assertWyncCheckPasses(name, source));
	}
});

test("index examples that are presented as complete source build to ELF", async (t) => {
	const examples = compilerCheckedSourceExamples();
	assert.equal(examples.length, 1);

	for (const { name, source, entry } of examples) {
		assert.ok(entry, `${name} should declare a build entry`);
		await t.test(name, () => assertWyncBuildPasses(name, source, entry));
	}
});

test("homepage side-by-side comparison is not labeled as a current-run artifact", () => {
	assert.doesNotMatch(html, /freshness: current-run/);
	assert.doesNotMatch(html, /provenance=arm64-lowering/);
	assert.doesNotMatch(html, /current-run provenance/);
});
