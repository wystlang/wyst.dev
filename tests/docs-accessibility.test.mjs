import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { makeMd } from "../build/generate.mjs";
import { docPage } from "../build/template.mjs";

const docsCss = await readFile(new URL("../assets/docs.css", import.meta.url), "utf8");
const docsScript = await readFile(new URL("../assets/docs.js", import.meta.url), "utf8");

test("prose code wraps without changing scrollable code and table behavior", () => {
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

test("documentation markdown permits only the intentional safe HTML subset", () => {
	const rendered = makeMd().render(
		'<script>alert("x")</script>\n\ntext<br>next<img src=x onerror=alert(1)>\n\n<!-- wyst-contract: sketch -->\n',
	);
	assert.doesNotMatch(rendered, /<script>|<img\b/);
	assert.match(rendered, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
	assert.match(rendered, /text<br>next&lt;img src=x onerror=alert\(1\)&gt;/);
	assert.doesNotMatch(rendered, /wyst-contract/);
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
});

test("documentation pages emit page-specific social metadata", () => {
	const page = docPage({
		title: "Memory Model · Wyst",
		description: "Wyst memory ordering and effects.",
		canonical: "https://wyst.dev/docs/chapter-09-memory-model/",
		navModel: [],
		current: { url: "/docs/chapter-09-memory-model/", h1: "Memory Model" },
		eyebrow: "Reference",
		articleHtml: "<p>Test</p>",
		tocHtml: "",
	});
	assert.match(
		page,
		/<meta property="og:url" content="https:\/\/wyst\.dev\/docs\/chapter-09-memory-model\/" \/>/,
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
