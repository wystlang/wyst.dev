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

test("landing page tracks the v0.8 draft language surface", () => {
	assert.match(html, /<span class="ver">v0\.8-draft<\/span>/);
	assert.match(html, /The current v0\.8-draft compiler/);
	assert.match(html, /<b>Current:<\/b> v0\.8-draft ·/);
	assert.doesNotMatch(html, /The current v0\.7 compiler/);
	assert.doesNotMatch(html, /<b>Current:<\/b> v0\.7 ·/);
});

test("landing page states current limits near the top", () => {
	assert.match(html, /aria-label="Current Wyst limits and evidence"/);
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
	assert.match(html, /Reproduce this/);
	assert.match(
		html,
		/cargo run --manifest-path \.\.\/wyst\/wync\/Cargo\.toml -- explain lowering \.\.\/wyst\/wync\/tests\/fixtures\/reports\/lowering --function mix/,
	);
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

test("landing page describes the sum_to example as a while loop", () => {
	assert.match(html, /The <code>while<\/code> loop lowers to the/);
	assert.doesNotMatch(html, /The <code>repeat<\/code> loop lowers to the/);
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
	for (const [name, source] of [
		["hero-uart", codeBlockText("hero-uart")],
		["compare-wyst", codeBlockText("compare-wyst")],
		["uart-source", snippetText("uart-source")],
		["atomic-source", snippetText("atomic-source")],
		["sumto-source", snippetText("sumto-source")],
	]) {
		await t.test(name, () => assertWyncCheckPasses(name, source));
	}
});

test("index examples that are presented as complete source build to ELF", async (t) => {
	for (const [name, source, entry] of [
		["hero-uart", codeBlockText("hero-uart"), "uart_write"],
		["compare-wyst", codeBlockText("compare-wyst"), "sum_to"],
		["uart-source", snippetText("uart-source"), "uart_write"],
		["atomic-source", snippetText("atomic-source"), "publish"],
		["sumto-source", snippetText("sumto-source"), "sum_to"],
	]) {
		await t.test(name, () => assertWyncBuildPasses(name, source, entry));
	}
});

test("sum_to examples use while for runtime n and match signed i32 assembly", () => {
	for (const [sourceName, asmName] of [
		["compare-wyst", "compare-arm64"],
		["sumto-source", "sumto-asm"],
	]) {
		const source = sourceName === "compare-wyst"
			? codeBlockText(sourceName)
			: snippetText(sourceName);
		const asm = asmName === "compare-arm64"
			? codeBlockText(asmName)
			: snippetText(asmName);

		assert.match(source, /i : i32 = 0/);
		assert.match(source, /while i < n/);
		assert.match(source, /acc \+= i/);
		assert.match(source, /i \+= 1/);
		assert.doesNotMatch(source, /repeat n/);

		assert.match(asm, /cmp\s+w2,\s+w0/);
		assert.match(asm, /b\.ge\s+\.Ldone/);
		assert.doesNotMatch(asm, /repeat/);
	}

	const sumToAsm = snippetText("sumto-asm");
	assert.match(sumToAsm, /\/\/ while i < n/);
	assert.match(sumToAsm, /\/\/ i \+= 1/);
});

test("other index source and assembly snippets advertise documented patterns", () => {
	const uartSource = snippetText("uart-source");
	const uartAsm = snippetText("uart-asm");
	assert.match(uartSource, /@mmio records MMIO intent/);
	assert.doesNotMatch(uartSource, /@volatile marks MMIO/);
	assert.match(uartSource, /UARTDR :: @mmio u32/);
	assert.match(uartSource, /UARTFR :: @mmio u32/);
	assert.match(uartSource, /while u32@\[UARTFR\] & TXFF != 0/);
	assert.match(uartAsm, /ldr w2, \[x1, #0x18\]/);
	assert.match(uartAsm, /tbnz w2, #5, \.Lwait/);
	assert.match(uartAsm, /str w0, \[x1\]/);

	const atomicSource = snippetText("atomic-source");
	const atomicAsm = snippetText("atomic-asm");
	assert.match(atomicSource, /#release u32@\[flag\] = v/);
	assert.match(atomicSource, /return #acquire u32@\[flag\]/);
	assert.match(atomicAsm, /stlr w1, \[x0\]/);
	assert.match(atomicAsm, /ldar w0, \[x0\]/);

	const vectorsSource = snippetText("vectors-source");
	const vectorsAsm = snippetText("vectors-asm");
	assert.match(vectorsSource, /Abbreviated EL1 vector sketch/);
	assert.match(vectorsSource, /slots 2-3 omitted here/);
	assert.match(vectorsAsm, /\.fill 31, 4, 0xd503201f/);
	assert.match(vectorsAsm, /; \.\.\. slots 6\S15/);
});

test("compact lowering examples do not claim current-run compiler artifacts", () => {
	assert.doesNotMatch(html, /freshness: current-run/);
	assert.doesNotMatch(html, /current-run provenance/);
});
