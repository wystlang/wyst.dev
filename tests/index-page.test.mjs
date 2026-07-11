import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const GITHUB_URL = "https://github.com/wystlang/wyst";
const UART_EXAMPLE_PATH =
	"wync/tests/fixtures/qemu/virt/uart-hello/main.wyst";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const docsSourceOfTruthHtml = await readFile(
	new URL("../docs/source-of-truth/index.html", import.meta.url),
	"utf8",
);
const notFoundHtml = await readFile(new URL("../404.html", import.meta.url), "utf8");
const siteCss = await readFile(new URL("../assets/wyst.css", import.meta.url), "utf8");
const docsCss = await readFile(new URL("../assets/docs.css", import.meta.url), "utf8");
const uartFixtureSource = await readFile(
	new URL(`../../wyst/${UART_EXAMPLE_PATH}`, import.meta.url),
	"utf8",
);
const uartFixtureLayout = await readFile(
	new URL(
		"../../wyst/wync/tests/fixtures/qemu/virt/uart-hello/layout.wyst",
		import.meta.url,
	),
	"utf8",
);
const uartExpectedOutput = await readFile(
	new URL(
		"../../wyst/wync/tests/fixtures/qemu/virt/uart-hello/expected.txt",
		import.meta.url,
	),
	"utf8",
);
const semihostRuntimeSource = await readFile(
	new URL(
		"../../wyst/wync/tests/fixtures/common/runtime/semihost-runtime.wyst",
		import.meta.url,
	),
	"utf8",
);
const cargoManifest = fileURLToPath(
	new URL("../../wyst/wync/Cargo.toml", import.meta.url),
);

function decodeHtml(text) {
	return text
		.replaceAll("&lt;", "<")
		.replaceAll("&gt;", ">")
		.replaceAll("&quot;", '"')
		.replaceAll("&#39;", "'")
		.replaceAll("&apos;", "'")
		.replaceAll("&nbsp;", " ")
		.replaceAll("&amp;", "&");
}

function textContent(markup) {
	return decodeHtml(markup.replace(/<[^>]*>/g, " "))
		.replace(/\s+/g, " ")
		.trim();
}

function attributeMap(attributes) {
	return Object.fromEntries(
		[...attributes.matchAll(/\s([:\w-]+)="([^"]*)"/g)].map(
			([, name, value]) => [name, decodeHtml(value)],
		),
	);
}

function anchors(pageHtml) {
	return [...pageHtml.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].map(
		([, attributes, body]) => {
			const attrs = attributeMap(attributes);
			return {
				attrs,
				href: attrs.href ?? "",
				label: attrs["aria-label"] ?? textContent(body),
			};
		},
	);
}

function siteHeaderHtml(pageHtml) {
	const match = pageHtml.match(/<header\b[^>]*class="[^"]*\bsite\b[^"]*"[^>]*>([\s\S]*?)<\/header>/i);
	assert.ok(match, "missing site header");
	return match[1];
}

function primaryNavHtml(pageHtml) {
	const headerHtml = siteHeaderHtml(pageHtml);
	const match = headerHtml.match(
		/<nav\b[^>]*class="[^"]*\bnav-links\b[^"]*"[^>]*>([\s\S]*?)<\/nav>/i,
	);
	assert.ok(match, "missing primary navigation");
	return match[1];
}

function primaryNavLinks(pageHtml) {
	return anchors(primaryNavHtml(pageHtml)).map(({ href, label }) => ({
		href,
		label,
	}));
}

function sectionHtml(pageHtml, id) {
	const opening = pageHtml.match(
		new RegExp(`<section\\b[^>]*\\bid="${id}"[^>]*>`, "i"),
	);
	assert.ok(opening, `missing section #${id}`);

	const start = opening.index;
	const end = pageHtml.indexOf("</section>", start);
	assert.notEqual(end, -1, `missing closing tag for section #${id}`);
	return pageHtml.slice(start, end + "</section>".length);
}

function taggedElementWithOpeningMatch(pageHtml, openingPattern, message) {
	const opening = pageHtml.match(openingPattern);
	assert.ok(opening, message);

	const tagName = opening[1];
	const start = opening.index;
	const endTag = `</${tagName}>`;
	const end = pageHtml.indexOf(endTag, start + opening[0].length);
	assert.notEqual(end, -1, `${message}: missing ${endTag}`);
	return pageHtml.slice(start, end + endTag.length);
}

function uartExampleHtml() {
	return taggedElementWithOpeningMatch(
		html,
		/<([a-z][\w-]*)\b(?=[^>]*\bdata-example-source="uart-hello")(?=[^>]*\bdata-example-path="wync\/tests\/fixtures\/qemu\/virt\/uart-hello\/main\.wyst")[^>]*>/i,
		"missing provenance-marked uart-hello example",
	);
}

function sourceLines(markup) {
	return decodeHtml(markup.replace(/<[^>]*>/g, ""))
		.replaceAll("\r", "")
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
}

function cssHexVar(name) {
	const match = siteCss.match(
		new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*(#[0-9a-f]{6});`, "i"),
	);
	assert.ok(match, `missing CSS color token ${name}`);
	return match[1];
}

function relativeLuminance(hexColor) {
	return hexColor
		.slice(1)
		.match(/.{2}/g)
		.map((channel) => Number.parseInt(channel, 16) / 255)
		.map((channel) =>
			channel <= 0.03928
				? channel / 12.92
				: ((channel + 0.055) / 1.055) ** 2.4,
		)
		.reduce(
			(sum, channel, index) =>
				sum + channel * [0.2126, 0.7152, 0.0722][index],
			0,
		);
}

function contrastRatio(foreground, background) {
	const [lighter, darker] = [
		relativeLuminance(foreground),
		relativeLuminance(background),
	].sort((a, b) => b - a);
	return (lighter + 0.05) / (darker + 0.05);
}

test("shared headers keep only Manual and Source", () => {
	const expected = [
		{ href: "/docs/", label: "manual" },
		{ href: GITHUB_URL, label: "source" },
	];

	for (const [name, pageHtml] of [
		["home", html],
		["source-of-truth docs", docsSourceOfTruthHtml],
		["404", notFoundHtml],
	]) {
		assert.deepEqual(
			primaryNavLinks(pageHtml),
			expected,
			`${name} should expose the quiet two-link project navigation`,
		);
	}
});

test("homepage opens with a minimal personal introduction and separate project facts", () => {
	const introText = textContent(
		taggedElementWithOpeningMatch(
			html,
			/<([a-z][\w-]*)\b[^>]*class="[^"]*\bproject-introduction\b[^"]*"[^>]*>/i,
			"missing personal introduction",
		),
	);
	for (const [idea, pattern] of [
		["web-interface day job", /\bday job\b[^.]*\bweb interfaces\b/i],
		["low-level programming itch", /\blow-level programming itch\b/i],
		["ARM64 language and compiler", /\bARM64 language and compiler\b/i],
		["visual learning goal", /\bvisualize what the machine is actually doing\b/i],
		["computer science degree", /\bCS degree\b/i],
		["candid AI use", /\busing AI to help build Wyst and the tooling\b/i],
	]) {
		assert.match(introText, pattern, `the introduction should include ${idea}`);
	}
	assert.ok(
		introText.split(/\s+/).filter(Boolean).length <= 60,
		"the complete introduction should stay at or under 60 words",
	);
	assert.doesNotMatch(
		introText,
		/—/,
		"the personal introduction should not use em dashes",
	);

	const projectMeta = textContent(
		taggedElementWithOpeningMatch(
			html,
			/<([a-z][\w-]*)\b[^>]*class="[^"]*\bproject-meta\b[^"]*"[^>]*>/i,
			"missing separate project metadata",
		),
	);
	for (const [fact, pattern] of [
		["pre-1.0", /\bpre-1\.0\b/i],
		["ARM64 only", /\bARM64-only\b/i],
		["Rust bootstrap", /\bRust bootstrap compiler\b/i],
		["not memory-safe", /\bnot memory-safe\b/i],
	]) {
		assert.match(projectMeta, pattern, `the metadata should say ${fact}`);
	}

	for (const salesPhrase of [
		"Build your first program",
		"Follow Progress",
		"Evidence, not slogans",
		"See what you're actually doing",
		"Low-level programming you can actually read",
	]) {
		assert.doesNotMatch(html, new RegExp(salesPhrase, "i"));
	}
});

test("homepage links plainly to the source and manual", () => {
	const pageLinks = anchors(html);
	const expectedLinks = [
		{ href: GITHUB_URL, label: /^Source$/i },
		{ href: "/docs/", label: /^Manual$/i },
	];

	for (const expected of expectedLinks) {
		const match = pageLinks.find(
			(link) => link.href === expected.href && expected.label.test(link.label),
		);
		assert.ok(match, `missing plain ${expected.href} link`);
		assert.doesNotMatch(
			match.attrs.class ?? "",
			/(?:^|\s)(?:btn|button|cta)(?:-|\s|$)/i,
			`${match.label} should be a text link, not a conversion control`,
		);
	}
});

test("shared identity is a punctuation-free lowercase wordmark", () => {
	for (const [name, pageHtml] of [
		["home", html],
		["source-of-truth docs", docsSourceOfTruthHtml],
		["404", notFoundHtml],
	]) {
		const header = siteHeaderHtml(pageHtml);
		assert.match(
			header,
			/<span class="word">wyst<\/span>/,
			`${name} should use the lowercase text wordmark`,
		);
		assert.doesNotMatch(
			header,
			/\bclass="(?:mark|cc)"|wyst::/i,
			`${name} should not retain the punctuation or four-block identity`,
		);
		assert.match(pageHtml, /<meta name="color-scheme" content="dark" \/>/);
		assert.match(pageHtml, /<meta name="theme-color" content="#0B0D12" \/>/);
		for (const [asset, version] of [
			["favicon\\.svg", "6ed879ce"],
			["favicon-48\\.png", "090a1ea7"],
			["apple-touch-icon\\.png", "fd071720"],
		]) {
			assert.match(
				pageHtml,
				new RegExp(`href="/?assets/${asset}\\?v=${version}"`),
				`${name} should use a cache-busted ${asset}`,
			);
		}
	}

	for (const [token, value] of [
		["--bg", "#0b0d12"],
		["--bg-code", "#111722"],
		["--text", "#f4f6fa"],
		["--muted", "#9ba8b8"],
		["--line-solid", "#2b3544"],
		["--line-2", "#526276"],
		["--accent", "#93a4ff"],
		["--reference", "#7cc9e8"],
	]) {
		assert.equal(cssHexVar(token).toLowerCase(), value);
	}

	for (const token of [
		"--syn-text",
		"--syn-comment",
		"--syn-kw",
		"--syn-type",
		"--syn-num",
		"--syn-op",
		"--syn-fn",
		"--syn-var",
		"--syn-param",
		"--syn-macro",
		"--syn-punct",
		"--syn-str",
	]) {
		assert.ok(
			contrastRatio(cssHexVar(token), cssHexVar("--bg-code")) >= 7,
			`${token} should retain AAA contrast on the code surface`,
		);
	}

	assert.match(siteCss, /font-family:\s*"Newsreader"/);
	assert.match(siteCss, /font-family:\s*"Commit Mono"/);
	assert.match(siteCss, /--sans:\s*ui-sans-serif/);
	assert.match(siteCss, /body\s*\{[\s\S]*?font-family:\s*var\(--sans\)/);
	assert.match(
		siteCss,
		/\.notebook-hero h1\s*\{[\s\S]*?font-family:\s*var\(--serif\);[\s\S]*?font-size:\s*clamp\(96px,\s*11vw,\s*168px\);/,
		"the homepage should reserve the oversized serif treatment for the wordmark",
	);
	assert.match(
		siteCss,
		/\.artifact\s*>\s*pre\s*\{[\s\S]*?font-size:\s*clamp\(14px,\s*1\.6vw,\s*15px\);[\s\S]*?font-weight:\s*450;/,
		"homepage source should remain at least 14px with a medium variable-font weight",
	);
	assert.match(
		docsCss,
		/\.doc-body\s+\.wyst-code\s*\{[\s\S]*?font-size:\s*var\(--text-base\);[\s\S]*?font-weight:\s*450;/,
		"documentation source should remain at least 14px with a medium variable-font weight",
	);
	assert.doesNotMatch(
		`${siteCss}\n${docsCss}`,
		/font-style:\s*italic/,
		"source comments should not rely on a synthetic italic face",
	);
	assert.doesNotMatch(siteCss, /linear-gradient|radial-gradient|backdrop-filter|box-shadow/);
});

test("homepage contains only the introduction and real example", () => {
	assert.equal(
		[...html.matchAll(/<section\b/gi)].length,
		2,
		"homepage should have only an introduction and example section",
	);
	const example = sectionHtml(html, "example");
	assert.match(example, /<h2\b/i);
	assert.match(example, /data-example-source="uart-hello"/i);
	assert.doesNotMatch(html, /\bid="(?:why|status|bench)"|on the bench|Lately:/i);
	assert.match(html, /<main\b[^>]*class="[^"]*\bhome-split\b[^"]*"/i);
	assert.match(html, /<h1\b[^>]*>wyst<\/h1>/i);
	assert.match(
		siteCss,
		/\.home-split\s*\{[\s\S]*?grid-template-columns:\s*minmax\(300px,\s*0\.76fr\)\s+minmax\(560px,\s*1\.24fr\);/,
		"the homepage should pair the introduction with a code-led split layout",
	);
	assert.match(
		siteCss,
		/\.home-split\s*\{[\s\S]*?padding-left:\s*var\(--pad\);[\s\S]*?padding-right:\s*var\(--pad\);/,
		"the desktop split should leave room for both sides of the code artifact",
	);
	assert.match(
		siteCss,
		/\.artifact\s*\{[\s\S]*?border:\s*1px solid var\(--line-2\);[\s\S]*?border-radius:\s*18px;/,
		"the desktop code artifact should retain all four rounded corners",
	);
});

test("homepage shows one static UART example from the real fixture", () => {
	const matches = [
		...html.matchAll(/\bdata-example-source="uart-hello"/g),
	];
	assert.equal(matches.length, 1, "the UART source example should appear once");

	const example = uartExampleHtml();
	const codeBlocks = [...example.matchAll(/<code\b[^>]*>([\s\S]*?)<\/code>/gi)];
	const sourceBlock = codeBlocks
		.map((match) => ({ markup: match[1], lines: sourceLines(match[1]) }))
		.find(({ lines }) => lines.some((line) => line.startsWith("UARTDR ::")));
	assert.ok(sourceBlock, "UART example should contain a static Wyst source block");

	const fixtureLines = new Set(
		uartFixtureSource
			.replaceAll("\r", "")
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean),
	);
	for (const line of sourceBlock.lines) {
		assert.ok(
			fixtureLines.has(line),
			`displayed UART line should come from ${UART_EXAMPLE_PATH}: ${line}`,
		);
	}

	for (const line of [
		"UARTDR :: @volatile u32 = UART0_BASE + 0x00",
		"UARTFR :: @volatile u32 = UART0_BASE + 0x18",
		"uart_write :: (byte : u8) {",
		"uart_hello :: () {",
	]) {
		assert.ok(sourceBlock.lines.includes(line), `UART snippet should include: ${line}`);
	}

	const terminal = taggedElementWithOpeningMatch(
		sectionHtml(html, "example"),
		/<([a-z][\w-]*)\b[^>]*(?:class="[^"]*\bterminal(?:-[\w-]+)?\b[^"]*"|data-terminal(?:-output)?(?:="[^"]*")?|aria-label="[^"]*UART output[^"]*")[^>]*>/i,
		"UART example should include terminal output",
	);
	const terminalText = decodeHtml(terminal.replace(/<[^>]*>/g, ""));
	assert.ok(
		terminalText.includes(uartExpectedOutput.trim()),
		"terminal should contain the fixture's real `hello` output",
	);

	assert.doesNotMatch(example, /<textarea\b|contenteditable|<button\b/i);
	assert.doesNotMatch(html, /\bcodeBlocks\b|fetch\s*\(|WebSocket|eval\s*\(/);
});

test("marketing funnel furniture is absent", () => {
	for (const id of ["philosophy", "examples", "not", "faq"]) {
		assert.doesNotMatch(html, new RegExp(`\\bid="${id}"`, "i"));
	}

	for (const className of [
		"cta-row",
		"btn-primary",
		"evidence-grid",
		"cards",
		"compare-grid",
		"not-grid",
		"faq-list",
		"back-to-top",
		"nav-toggle",
		"nav-scrim",
	]) {
		assert.doesNotMatch(
			html,
			new RegExp(`class="[^"]*\\b${className}\\b`, "i"),
			`homepage should not retain .${className}`,
		);
	}

	assert.doesNotMatch(html, /<button\b|role="button"|aria-expanded=/i);
	assert.doesNotMatch(html, /data-code="compare-|\bsum_to\b|Side by side/i);
	assert.doesNotMatch(html, /\bNon-goals\b|<details\b/i);
	assert.deepEqual(
		anchors(html)
			.map(({ href }) => href)
			.filter((href) => href.startsWith("#")),
		["#main"],
		"the skip link should be the only same-page funnel anchor",
	);
});

test("minimal homepage retains accessibility and safe external links", () => {
	assert.match(html, /<html\b[^>]*\blang="en"/i);
	assert.match(html, /<meta\b[^>]*name="viewport"/i);
	assert.match(html, /<a\b[^>]*class="[^"]*\bskip\b[^"]*"[^>]*href="#main"[^>]*>/i);
	assert.match(html, /<main\b[^>]*\bid="main"/i);
	assert.equal([...html.matchAll(/<h1\b/gi)].length, 1, "homepage should have one h1");
	assert.match(siteHeaderHtml(html), /<nav\b[^>]*aria-label="Primary"/i);

	for (const [name, pageHtml] of [
		["home", html],
		["source-of-truth docs", docsSourceOfTruthHtml],
		["404", notFoundHtml],
	]) {
		assert.doesNotMatch(pageHtml, /href\s*=\s*["']javascript:/i);
		assert.doesNotMatch(pageHtml, /\son[a-z]+\s*=/i);

		for (const link of anchors(pageHtml).filter(({ href }) => /^https?:/i.test(href))) {
			assert.ok(
				(link.attrs.rel ?? "").split(/\s+/).includes("noopener"),
				`${name} external link should use rel=noopener: ${link.href}`,
			);
		}
	}

	assert.match(siteCss, /:focus-visible\s*\{[\s\S]*?outline:\s*2px solid var\(--accent\)/);
	assert.match(siteCss, /\.skip:focus\s*\{[\s\S]*?top:\s*0/);
	assert.ok(
		contrastRatio(cssHexVar("--text"), cssHexVar("--bg")) >= 7,
		"primary text should retain enhanced dark-theme contrast",
	);
	assert.ok(
		contrastRatio(cssHexVar("--copy-muted"), cssHexVar("--bg")) >= 4.5,
		"secondary prose should retain AA contrast on the dark field",
	);
});

test("the complete UART fixture used by the homepage builds to an ELF", async () => {
	const dir = await mkdtemp(join(tmpdir(), "wyst-index-uart-"));
	const sourcePath = join(dir, "main.wyst");
	const layoutPath = join(dir, "layout.wyst");
	const outputPath = join(dir, "uart-hello.elf");

	try {
		await writeFile(
			sourcePath,
			`${uartFixtureSource.trimEnd()}\n\n${semihostRuntimeSource}`,
		);
		await writeFile(layoutPath, uartFixtureLayout);

		const result = spawnSync(
			"cargo",
			[
				"run",
				"--quiet",
				"--locked",
				"--manifest-path",
				cargoManifest,
				"--",
				"build",
				sourcePath,
				"--layout",
				layoutPath,
				"-o",
				outputPath,
			],
			{ encoding: "utf8", timeout: 120_000 },
		);

		assert.equal(
			result.status,
			0,
			`uart-hello fixture should build\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
		);
		const elf = await readFile(outputPath);
		assert.deepEqual([...elf.subarray(0, 4)], [0x7f, 0x45, 0x4c, 0x46]);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
