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
const siteCss = await readFile(new URL("../assets/wyst.css", import.meta.url), "utf8");
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

const codeBlocks = evaluateObject(
	"codeBlocks",
	'document.querySelectorAll("[data-code]")',
);

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

function heroLedeText() {
	const match = html.match(/<p class="lede">([\s\S]*?)<\/p>/);
	assert.ok(match, "missing hero lede");
	return match[1].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function primaryNavHtml(pageHtml) {
	const headerHtml = siteHeaderHtml(pageHtml);
	const match = headerHtml.match(/<nav[^>]*class="nav-links"[^>]*>([\s\S]*?)<\/nav>/);
	assert.ok(match, "missing primary nav");
	return match[1];
}

function primaryNavLinks(pageHtml) {
	return [...primaryNavHtml(pageHtml).matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(
		([, attrs, body]) => ({
			href: attrs.match(/\shref="([^"]+)"/)?.[1] ?? "",
			label:
				attrs.match(/\saria-label="([^"]+)"/)?.[1] ??
				body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(),
		}),
	);
}

function siteFooterHtml(pageHtml) {
	const match = pageHtml.match(/<footer class="site">([\s\S]*?)<\/footer>/);
	assert.ok(match, "missing site footer");
	return match[1];
}

function escapeRegExp(text) {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sectionHtmlByStart(pageHtml, startNeedle) {
	const start = pageHtml.indexOf(startNeedle);
	assert.notEqual(start, -1, `missing section start ${startNeedle}`);
	const end = pageHtml.indexOf("</section>", start);
	assert.notEqual(end, -1, `missing section end ${startNeedle}`);
	return pageHtml.slice(start, end + "</section>".length);
}

function cssRule(selector) {
	const match = siteCss.match(
		new RegExp(`${escapeRegExp(selector)}\\s*\\{([\\s\\S]*?)\\n\\}`),
	);
	assert.ok(match, `missing CSS rule for ${selector}`);
	return match[1];
}

function cssHexVar(name) {
	const match = siteCss.match(
		new RegExp(`${escapeRegExp(name)}:\\s*(#[0-9a-f]{6});`, "i"),
	);
	assert.ok(match, `missing CSS color token ${name}`);
	return match[1];
}

function cssColorVar(name) {
	const match = siteCss.match(
		new RegExp(
			`${escapeRegExp(name)}:\\s*(#[0-9a-f]{6}|rgba?\\([^;]+\\));`,
			"i",
		),
	);
	assert.ok(match, `missing CSS color token ${name}`);
	return match[1];
}

function parseCssColor(color) {
	const rgbMatch = color.match(
		/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)/,
	);
	if (rgbMatch) {
		return {
			alpha: rgbMatch[4] === undefined ? 1 : Number.parseFloat(rgbMatch[4]),
			channels: rgbMatch.slice(1, 4).map(Number),
		};
	}

	const hexMatch = color.match(/^#([0-9a-f]{6})$/i);
	assert.ok(hexMatch, `unsupported CSS color ${color}`);
	const value = Number.parseInt(hexMatch[1], 16);
	return {
		alpha: 1,
		channels: [(value >> 16) & 255, (value >> 8) & 255, value & 255],
	};
}

function compositeOver(foreground, backgroundHex) {
	const background = parseCssColor(backgroundHex);
	const alpha = foreground.alpha;
	return foreground.channels.map((channel, index) =>
		Math.round(channel * alpha + background.channels[index] * (1 - alpha)),
	);
}

function relativeLuminance(hexColor) {
	const channels = Array.isArray(hexColor)
		? hexColor
		: hexColor
				.slice(1)
				.match(/.{2}/g)
				.map((channel) => Number.parseInt(channel, 16));

	return channels
		.map((channel) => {
			const value = channel / 255;
			return value <= 0.03928
				? value / 12.92
				: ((value + 0.055) / 1.055) ** 2.4;
		})
		.reduce((sum, channel, index) => {
			const weights = [0.2126, 0.7152, 0.0722];
			return sum + weights[index] * channel;
		}, 0);
}

function contrastRatio(foreground, background) {
	const [lighter, darker] = [
		relativeLuminance(foreground),
		relativeLuminance(background),
	].sort((a, b) => b - a);
	return (lighter + 0.05) / (darker + 0.05);
}

function compositedContrastRatio(foregroundColor, backgroundHex) {
	return contrastRatio(
		compositeOver(parseCssColor(foregroundColor), backgroundHex),
		backgroundHex,
	);
}

test("landing page tracks the v0.8 release language surface", () => {
	assert.match(html, /<span class="ver">v0\.8<\/span>/);
	assert.match(
		html,
		/<span class="limits-chip-label">Version<\/span>\s*<span class="limits-chip-value">v0\.8, pre-1\.0<\/span>/,
	);
});

test("site headers expose homepage section navigation", () => {
	const homeLinks = primaryNavLinks(html);
	const homeExpected = [
		{ href: "#philosophy", label: "Design" },
		{ href: "#examples", label: "Compare" },
		{ href: "#not", label: "Non-goals" },
		{ href: "#faq", label: "FAQ" },
		{ href: "#status", label: "Status" },
		{ href: "/docs/", label: "Docs" },
		{ href: "https://github.com/wystlang/wyst", label: "GitHub" },
	];

	assert.deepEqual(homeLinks, homeExpected);
	for (const [name, pageHtml] of [
		["source-of-truth docs", docsSourceOfTruthHtml],
		["404", notFoundHtml],
	]) {
		assert.deepEqual(
			primaryNavLinks(pageHtml),
			homeExpected.map((link) =>
				link.href.startsWith("#") ? { ...link, href: `/${link.href}` } : link,
			),
			`${name} header should link back to homepage sections`,
		);
	}
});

test("homepage provides a back-to-top control for long reads", () => {
	assert.match(html, /<body id="top">/);
	assert.match(
		html,
		/<a\s+class="back-to-top"\s+href="#top"\s+aria-label="Back to top"/,
	);
	assert.match(html, /data-back-to-top/);
	assert.match(html, /classList\.add\("back-to-top-ready"\)/);
	assert.match(html, /classList\.toggle\(\s*"is-visible"/);
	assert.match(siteCss, /\.back-to-top\s*\{[\s\S]*?position:\s*fixed/);
	assert.match(siteCss, /html\.back-to-top-ready \.back-to-top\.is-visible/);
	assert.match(primaryNavHtml(html), /href="#philosophy"/);
	assert.match(primaryNavHtml(html), /href="#status"/);
});

test("site footers retain the compact project links", () => {
	const pages = [
		["home", html],
		["source-of-truth docs", docsSourceOfTruthHtml],
		["404", notFoundHtml],
	];

	for (const [name, pageHtml] of pages) {
		const footerHtml = siteFooterHtml(pageHtml);
		assert.doesNotMatch(
			footerHtml,
			/class="foot-bottom"/,
			`${name} footer should not include the bottom row`,
		);
		assert.match(
			footerHtml,
			/href="https:\/\/github\.com\/wystlang\/wyst" rel="noopener">GitHub<\/a>/,
			`${name} footer should label the project repository link GitHub`,
		);
		assert.doesNotMatch(
			footerHtml,
			/>Source/,
			`${name} footer should not label the repository link Source`,
		);
		assert.match(
			footerHtml,
			/ARM64 bare-metal language and assembler\s+for\s+kernel-oriented code/,
			`${name} footer should match the hero positioning`,
		);
		assert.match(
			footerHtml,
			/Intent stays visible without\s+hiding the machine/,
			`${name} footer should match the hero sentiment`,
		);
	}
});

test("landing page states current limits near the top", () => {
	const limitsSection = sectionHtmlByStart(
		html,
		'<section\n\t\t\t\tclass="limits-strip"',
	);
	const limitChips = [
		["Target", "ARM64 only"],
		["Validation", "QEMU-tested"],
		["Compiler", "Rust bootstrap compiler"],
		["Status", "not self-hosting"],
		["Safety", "not memory-safe"],
		["Backend", "no LLVM backend"],
		["Version", "v0.8, pre-1.0"],
	];

	assert.match(html, /aria-label="Current Wyst limits and validation"/);
	for (const phrase of [
		"ARM64 only",
		"QEMU-tested",
		"Rust bootstrap compiler",
		"not self-hosting",
		"not memory-safe",
		"no LLVM backend",
		"v0.8",
	]) {
		assert.match(html, new RegExp(phrase));
	}

	for (const [label, value] of limitChips) {
		assert.match(
			limitsSection,
			new RegExp(
				`<li class="limits-chip">\\s*<span class="limits-chip-label">${escapeRegExp(label)}</span>\\s*<span class="limits-chip-value">${escapeRegExp(value)}</span>\\s*</li>`,
			),
			`current reality chip should expose ${label}: ${value}`,
		);
	}

	assert.equal(
		[...limitsSection.matchAll(/class="limits-chip"/g)].length,
		limitChips.length,
	);
	assert.doesNotMatch(limitsSection, /<b>/);
	assert.doesNotMatch(siteCss, /limits-list li \+ li::before/);
});

test("homepage persuasive secondary copy has strong dark-theme contrast", () => {
	assert.ok(
		contrastRatio(cssHexVar("--copy-muted"), cssHexVar("--bg-elev")) >= 7,
		"persuasive secondary copy should meet a 7:1 contrast floor on elevated surfaces",
	);

	for (const selector of [
		".hero .lede",
		".sec-head p",
		".card p",
		".compare .note",
		".not-item .body .why",
		".status-card p",
		".faq-a",
	]) {
		assert.match(
			cssRule(selector),
			/color:\s*var\(--copy-muted\);/,
			`${selector} should use the high-contrast body-copy token`,
		);
	}

	assert.match(html, /class="tradeoff-intro"/);
	assert.match(
		cssRule(".tradeoff-intro"),
		/color:\s*var\(--copy-muted\);/,
		"tradeoff intro should use the high-contrast body-copy token",
	);
	assert.doesNotMatch(html, /style="color:\s*var\(--muted\);\s*font-size:\s*16px"/);
});

test("homepage principle cards have visible separators", () => {
	assert.ok(
		compositedContrastRatio(cssColorVar("--card-grid-line"), cssHexVar("--bg")) >=
			1.5,
		"principle card separators should stay readable against the card background",
	);

	assert.match(
		cssRule(".cards"),
		/background:\s*var\(--card-grid-line\);/,
		"principle grid gaps should use the stronger separator token",
	);
	assert.match(
		cssRule(".cards"),
		/border:\s*1px solid var\(--card-grid-line\);/,
		"principle grid outer border should use the stronger separator token",
	);
});

test("landing page uses narrow positioning and avoids overbroad safety copy", () => {
	const heroText = heroLedeText();
	assert.match(
		heroText,
		/ARM64 bare-metal language and assembler for kernel-oriented code/,
	);
	assert.match(
		heroText,
		/memory ordering, overflow behavior, and lowered resource facts stay explicit/,
	);
	assert.match(html, /No UB-powered rewrites/);
	assert.match(html, /invalid memory access can still fault\s+or misbehave/);
	assert.doesNotMatch(heroText, /It sits between C and assembly/);
	assert.doesNotMatch(heroText, /hidden magic of a C compiler/);
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
		{ href: "https://github.com/wystlang/wyst", label: "View on GitHub" },
	]);
});

test("homepage examples carry explicit provenance labels", () => {
	for (const name of Object.keys(codeBlocks)) {
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

test("homepage primary sections appear in order", () => {
	const headerHtml = siteHeaderHtml(html);
	const philosophyIndex = html.indexOf('id="philosophy"');
	const examplesIndex = html.indexOf('id="examples"');
	const nonGoalsIndex = html.indexOf('id="not"');
	const faqIndex = html.indexOf('id="faq"');

	assert.notEqual(philosophyIndex, -1, "missing philosophy section");
	assert.notEqual(examplesIndex, -1, "missing examples section");
	assert.notEqual(nonGoalsIndex, -1, "missing non-goals section");
	assert.notEqual(faqIndex, -1, "missing FAQ section");
	assert.ok(philosophyIndex < examplesIndex, "principles should precede examples");
	assert.ok(examplesIndex < nonGoalsIndex, "examples should precede non-goals");
	assert.ok(nonGoalsIndex < faqIndex, "non-goals should precede FAQ");

	assert.match(headerHtml, /<a href="#not">Non-goals<\/a>/);
	assert.match(headerHtml, /<a href="#faq">FAQ<\/a>/);
});

test("homepage presents project status", () => {
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
		"v0.8",
	]) {
		assert.match(html, new RegExp(phrase));
	}

	assert.match(
		statusSection,
		/href="https:\/\/github\.com\/wystlang\/wyst"[\s\S]*?>\s*<svg[\s\S]*?<\/svg>\s*Follow Progress\s*<\/a>/,
		"project status CTA should use distinct progress-oriented copy",
	);
	assert.doesNotMatch(statusSection, /View on GitHub/);

	for (const duplicate of [
		"v0.8",
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

test("generated pages track the v0.8 release header badge", () => {
	for (const [name, pageHtml] of [
		["source-of-truth docs", docsSourceOfTruthHtml],
		["404", notFoundHtml],
	]) {
		assert.match(
			pageHtml,
			/<span class="ver">v0\.8<\/span>/,
			`${name} should use the release header badge`,
		);
	}
});

test("homepage presents the side-by-side sum_to comparison", () => {
	assert.match(siteHeaderHtml(html), /<a href="#examples">Compare<\/a>/);
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
	assert.doesNotMatch(html, /<textarea/i);
	assert.doesNotMatch(html, /contenteditable/i);
	assert.doesNotMatch(html, /fetch\s*\(/);
	assert.doesNotMatch(html, /WebSocket/);
	assert.doesNotMatch(html, /eval\s*\(/);
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

function compilerCheckedSourceExamples() {
	return Object.keys(codeBlocks)
		.map((name) => ({ name, attrs: provenanceAttributes(name) }))
		.filter(({ attrs }) => attrs["data-example-kind"] === "wyst-source")
		.map(({ name, attrs }) => ({
			name,
			entry: attrs["data-example-entry"],
			source: codeBlockText(name),
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
