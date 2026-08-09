import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { buildToc, makeMd } from "../build/generate.mjs";
import { docIndexPage, docPage } from "../build/template.mjs";

const docsCss = await readFile(new URL("../assets/docs.css", import.meta.url), "utf8");
const docsScript = await readFile(new URL("../assets/docs.js", import.meta.url), "utf8");

test("prose code wraps without changing scrollable code and table behavior", () => {
	assert.match(
		docsCss,
		/\.doc-body p,\s*\.doc-body ul,\s*\.doc-body ol\s*\{[^}]*overflow-wrap:\s*anywhere;/s,
	);
	assert.match(
		docsCss,
		/\.doc-body :not\(pre\) > code\s*\{[^}]*overflow-wrap:\s*anywhere;[^}]*white-space:\s*normal;/s,
	);
	assert.match(
		docsCss,
		/\.doc-body th code,\s*\.doc-body td code\s*\{[^}]*overflow-wrap:\s*normal;[^}]*white-space:\s*nowrap;/s,
	);
	assert.match(
		docsCss,
		/\.doc-body table\s*\{[^}]*overflow-x:\s*auto;/s,
	);
	assert.match(
		docsCss,
		/\.doc-body \.wyst-code\s*\{[^}]*overflow-x:\s*auto;/s,
	);
	assert.match(
		docsCss,
		/\.doc-body \.wyst-code code\s*\{[^}]*white-space:\s*pre;/s,
	);
});

test("table alignment uses CSP-compatible metadata", () => {
	const rendered = makeMd().render(
		"| Left | Center | Right |\n| :--- | :---: | ---: |\n| a | b | c |\n",
	);

	assert.doesNotMatch(rendered, /\sstyle=/);
	assert.match(rendered, /<th data-align="left">Left<\/th>/);
	assert.match(rendered, /<th data-align="center">Center<\/th>/);
	assert.match(rendered, /<th data-align="right">Right<\/th>/);
	assert.match(rendered, /<td data-align="right">c<\/td>/);
	assert.match(
		docsCss,
		/\.doc-body th\[data-align="right"\],\s*\.doc-body td\[data-align="right"\]\s*\{[^}]*text-align:\s*right;/s,
	);
});

test("heading permalinks are focusable, named controls", () => {
	const rendered = makeMd().render("## Memory `Layout`\n");
	assert.match(
		rendered,
		/<h2 id="memory-layout" tabindex="-1"><a class="doc-anchor" href="#memory-layout" aria-label="Permalink to Memory Layout">#<\/a> Memory <code>Layout<\/code><\/h2>/,
	);
	assert.doesNotMatch(rendered, /class="doc-anchor"[^>]*aria-hidden=/);
});

test("generated heading fragments match GitHub-style source links", () => {
	const rendered = makeMd().render(
		"### 4.3 Mangling\n\n#### B.6.3 Calling Variadic C Functions: `printf` via `va_list`\n",
	);
	assert.match(rendered, /<h3 id="43-mangling"/);
	assert.match(
		rendered,
		/<h4 id="b63-calling-variadic-c-functions-printf-via-va_list"/,
	);
});

test("design catalog links use authenticated local or pinned upstream artifacts", () => {
	const commit = "a".repeat(40);
	const rendered = makeMd({ wystSourceCommit: commit }).render(
		"[syntax words](catalogs/language/syntax-words.tsv) [attributes](catalogs/language/attribute-catalog.tsv) [C interactive adapters](catalogs/language/c-interactive-adapter-catalog.tsv) [meta operations](catalogs/language/meta-operation-catalog.tsv) [semantic operations](catalogs/language/semantic-operation-catalog.tsv) [raw forms](catalogs/aarch64/generated/a64-raw-encoding-source-forms.jsonl.gz) [catalog index](catalogs/README.md) [architectural decisions](../docs/adr/)\n",
	);
	for (const artifact of [
		"attribute-catalog.tsv",
		"c-interactive-adapter-catalog.tsv",
		"meta-operation-catalog.tsv",
		"syntax-words.tsv",
	]) {
		assert.match(rendered, new RegExp(`href="/docs/${artifact.replace(".", "\\.")}"`));
	}
	assert.match(
		rendered,
		new RegExp(
			`href="https://github\\.com/wystlang/wyst/blob/${commit}/design/catalogs/aarch64/generated/a64-raw-encoding-source-forms\\.jsonl\\.gz" rel="noopener"`,
		),
	);
	assert.match(
		rendered,
		new RegExp(
			`href="https://github\\.com/wystlang/wyst/blob/${commit}/design/catalogs/README\\.md" rel="noopener"`,
		),
	);
	assert.match(
		rendered,
		new RegExp(
			`href="https://github\\.com/wystlang/wyst/blob/${commit}/design/catalogs/language/semantic-operation-catalog\\.tsv" rel="noopener"`,
		),
	);
	assert.match(
		rendered,
		new RegExp(
			`href="https://github\\.com/wystlang/wyst/tree/${commit}/docs/adr/" rel="noopener"`,
		),
	);
});

test("documentation markdown permits only the intentional safe HTML subset", () => {
	const rendered = makeMd().render(
		'<SCRIPT type="text/javascript">alert("x")</SCRIPT>\n\ntext<br>next<IMG src=x onerror=alert(1)>\n\n<!-- wyst-contract: sketch -->\n',
	);
	assert.doesNotMatch(rendered, /<(?:script|img)\b/i);
	assert.match(
		rendered,
		/&lt;SCRIPT type=&quot;text\/javascript&quot;&gt;alert\(&quot;x&quot;\)&lt;\/SCRIPT&gt;/,
	);
	assert.match(rendered, /text<br>next&lt;IMG src=x onerror=alert\(1\)&gt;/);
	assert.doesNotMatch(rendered, /wyst-contract/);
});

test("documentation TOC derives escaped labels from parsed heading tokens", () => {
	const md = makeMd();
	const tokens = md.parse(
		'## Memory `Layout` *model*\n\n### Raw <SCRIPT data-label="x">\n\n### Wrapped<br>line\n',
		{},
	);
	const toc = buildToc(tokens);

	assert.match(toc, />Memory Layout model<\/a>/);
	assert.match(
		toc,
		/>Raw &lt;SCRIPT data-label=&quot;x&quot;&gt;<\/a>/,
	);
	assert.match(toc, />Wrapped line<\/a>/);
	assert.doesNotMatch(toc, /<script\b/i);
});

test("mobile Contents is an ARIA disclosure backed by an external script", () => {
	const page = docPage({
		title: "Test · Wyst",
		description: "Test documentation page",
		canonical: "https://wyst.dev/docs/test/",
		navModel: [],
		current: { url: "/docs/test/", h1: "Test" },
		eyebrow: "Reference",
		articleHtml: "<p>Test</p>",
		tocHtml: "",
	});

	assert.match(
		page,
		/<button class="doc-sidebar-toggle" type="button" aria-expanded="false" aria-controls="doc-sidebar">/,
	);
	assert.match(page, /<aside id="doc-sidebar" class="doc-sidebar"/);
	assert.match(page, /<script src="\/assets\/docs\.js" defer><\/script>/);
	assert.doesNotMatch(page, /<script>(?:.|\n)*doc-sidebar-toggle/);
	assert.doesNotMatch(page, /class="ver"|>v0\.9</);
});

test("reference navigation groups topics by subject without a reading sequence", () => {
	const page = docIndexPage({
		title: "Language and Compiler Reference · Wyst",
		description: "Wyst reference",
		canonical: "https://wyst.dev/docs/",
		h1: "Wyst Language and Compiler Reference",
		introHtml: "<p>Lookup by subject.</p>",
		navModel: [
			{
				group: "reference",
				section: "language",
				navTitle: "Type System",
				url: "/docs/type-system/",
				summary: "Types.",
			},
			{
				group: "reference",
				section: "tools",
				navTitle: "Editor Integration",
				url: "/docs/editor-integration/",
				summary: "Editors.",
			},
			{
				group: "appendix",
				navTitle: "Formal Grammar",
				url: "/docs/formal-grammar/",
				summary: "Grammar.",
			},
			{
				group: "contributor",
				navTitle: "Documentation Example Contracts",
				url: "/docs/documentation-examples/",
				summary: "Contributor rules.",
			},
		],
	});

	assert.match(page, /<h2>Language<\/h2>/);
	assert.match(page, /<h2>Tools<\/h2>/);
	assert.match(page, /<h2>Appendices<\/h2>/);
	assert.match(page, /href="\/docs\/type-system\/"/);
	assert.doesNotMatch(page, /<h2>Topics<\/h2>|Documentation Example Contracts/);
});

test("documentation pages emit page-specific social metadata", () => {
	const page = docPage({
		title: "Memory Model · Wyst",
		description: "Wyst memory ordering and effects.",
		canonical: "https://wyst.dev/docs/memory-model/",
		navModel: [],
		current: { url: "/docs/memory-model/", h1: "Memory Model" },
		eyebrow: "Reference",
		articleHtml: "<p>Test</p>",
		tocHtml: "",
	});
	assert.match(
		page,
		/<meta property="og:url" content="https:\/\/wyst\.dev\/docs\/memory-model\/" \/>/,
	);
	assert.match(page, /<meta property="og:title" content="Memory Model · Wyst" \/>/);
	assert.match(
		page,
		/<meta name="twitter:description" content="Wyst memory ordering and effects\." \/>/,
	);
});

test("mobile Contents keeps its visual and accessibility states synchronized", () => {
	const toggleListeners = new Map();
	const documentListeners = new Map();
	const attributes = new Map([
		["aria-controls", "doc-sidebar"],
		["aria-expanded", "false"],
	]);
	let open = true;
	let focused = false;
	const toggle = {
		addEventListener(type, listener) {
			toggleListeners.set(type, listener);
		},
		focus() {
			focused = true;
		},
		getAttribute(name) {
			return attributes.get(name) ?? null;
		},
		setAttribute(name, value) {
			attributes.set(name, value);
		},
	};
	const sidebar = {
		classList: {
			toggle(name, force) {
				assert.equal(name, "is-open");
				open = force;
			},
		},
	};
	const document = {
		addEventListener(type, listener) {
			documentListeners.set(type, listener);
		},
		getElementById(id) {
			return id === "doc-sidebar" ? sidebar : null;
		},
		querySelector(selector) {
			return selector === ".doc-sidebar-toggle" ? toggle : null;
		},
	};

	vm.runInNewContext(docsScript, { document });
	assert.equal(open, false, "initial collapsed state should match aria-expanded");

	toggleListeners.get("click")();
	assert.equal(attributes.get("aria-expanded"), "true");
	assert.equal(open, true);

	documentListeners.get("keydown")({ key: "Escape" });
	assert.equal(attributes.get("aria-expanded"), "false");
	assert.equal(open, false);
	assert.equal(focused, true);
});
