// Static documentation generator for wyst.dev.
//
// Reads the vendored Wyst design reference (markdown) and emits styled HTML
// under the configured build output's /docs/ directory,
// reusing the homepage design system. Markdown source is treated as
// read-only: cross-links (`*.md`) are rewritten to site URLs at build time so
// the source stays valid when viewed on GitHub.
//
//   WYST_DOCS_DIR    explicit override for the docs source directory
//   WYST_OUTPUT_DIR  build output directory (default: dist)

import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import MarkdownIt from "markdown-it";
import anchor from "markdown-it-anchor";
import { registerWyst } from "./prism-wyst.mjs";
import {
	docPage,
	docIndexPage,
	escapeHtml,
	GITHUB_URL,
} from "./template.mjs";

const require = createRequire(import.meta.url);
const Prism = require("prismjs");
require("prismjs/components/prism-clike.js");
require("prismjs/components/prism-c.js");
require("prismjs/components/prism-bash.js");
require("prismjs/components/prism-json.js");
try {
	require("prismjs/components/prism-armasm.js");
} catch {}
registerWyst(Prism);

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
const SITE = "https://wyst.dev";
const WYST_SOURCE_URL = "https://github.com/wystlang/wyst";
const LOCAL_DESIGN_ARTIFACTS = new Set([
	"attribute-catalog.tsv",
	"meta-operation-catalog.tsv",
	"semantic-db.json",
	"syntax-words.tsv",
]);

function resolveDocsDir() {
	const candidate = process.env.WYST_DOCS_DIR
		? path.resolve(process.env.WYST_DOCS_DIR)
		: path.join(ROOT, "vendor", "wyst-design");
	if (fs.existsSync(path.join(candidate, "README.md"))) return candidate;
	throw new Error(
		`Could not locate the Wyst design docs at ${candidate}. Sync vendor/wyst-design or explicitly set WYST_DOCS_DIR.`,
	);
}

function resolveOutputDir() {
	return process.env.WYST_OUTPUT_DIR
		? path.resolve(process.env.WYST_OUTPUT_DIR)
		: path.join(ROOT, "dist");
}

const LANG_MAP = {
	sh: "bash",
	shell: "bash",
	asm: "armasm",
	wyst: "wyst",
	c: "c",
	json: "json",
};

function highlight(code, lang) {
	const pl = LANG_MAP[lang] || lang;
	if (pl && Prism.languages[pl]) {
		try {
			return Prism.highlight(code, Prism.languages[pl], pl);
		} catch {
			/* fall through to escaped plain text */
		}
	}
	return escapeHtml(code);
}

// ---- minimal frontmatter parser (we control the exact format) -------------
function parseFrontmatter(text) {
	if (!text.startsWith("---\n") && !text.startsWith("---\r\n")) {
		return { data: {}, body: text };
	}
	const end = text.indexOf("\n---", 3);
	if (end === -1) return { data: {}, body: text };
	const raw = text.slice(text.indexOf("\n") + 1, end);
	const body = text.slice(text.indexOf("\n", end + 1) + 1);
	const data = {};
	for (const line of raw.split("\n")) {
		const m = line.match(/^([A-Za-z_]\w*):\s*(.*)$/);
		if (!m) continue;
		let v = m[2].trim();
		if (/^".*"$/.test(v)) v = v.slice(1, -1).replace(/\\"/g, '"');
		else if (/^-?\d+$/.test(v)) v = Number(v);
		data[m[1]] = v;
	}
	return { data, body };
}

function navTitleFrom(title) {
	return String(title)
		.replace(/^(?:Chapter \d+|Appendix [A-Z]):\s*/, "")
		.replace(/^Wyst\s+/, "")
		.trim();
}

// Match the fragments readers get when viewing the Markdown on GitHub. This
// keeps source-authored cross-links valid in both the design repository and the
// generated site (notably numbered headings such as `B.6.3`).
function githubSlugify(value) {
	return String(value)
		.trim()
		.toLowerCase()
		.replace(/[\u200b-\u200d\ufeff]/g, "")
		.replace(/[^\p{L}\p{N}\s_-]/gu, "")
		.replace(/\s+/g, "-");
}

// ---- markdown-it setup -----------------------------------------------------
const fileToUrl = new Map(); // "chapter-07-operators.md" -> "/docs/chapter-07-operators/"
const fileToFragments = new Map();

function fragmentIdsFor(markdown) {
	const parser = new MarkdownIt({ html: false, linkify: false, typographer: false });
	parser.use(anchor, {
		level: [2, 3, 4],
		slugify: githubSlugify,
	});
	return new Set(
		parser
			.parse(markdown, {})
			.filter((token) => token.type === "heading_open")
			.map((token) => token.attrGet("id"))
			.filter(Boolean),
	);
}

function resolvedFragment(file, fragment) {
	if (!fragment) return "";
	const slug = fragment.replace(/^#/, "");
	const fragments = fileToFragments.get(file);
	if (!fragments || fragments.has(slug)) return `#${slug}`;

	// Numbered design headings sometimes gain a more precise title while an
	// older cross-link retains that section number. Resolve only an unambiguous
	// same-section match; the public-reference audit catches everything else.
	const section = slug.split("-", 1)[0];
	if (!/^(?:[a-z]+)?\d+$/i.test(section)) return `#${slug}`;
	const matches = [...fragments].filter((candidate) =>
		candidate.startsWith(`${section}-`),
	);
	return matches.length === 1 ? `#${matches[0]}` : `#${slug}`;
}

function headingPermalink(slug, _options, state, tokenIndex) {
	const inline = state.tokens[tokenIndex + 1];
	const headingText = inline.children
		.filter((token) => token.type === "text" || token.type === "code_inline")
		.map((token) => token.content)
		.join("")
		.trim();
	const label = headingText || slug;

	const linkOpen = new state.Token("link_open", "a", 1);
	linkOpen.attrSet("class", "doc-anchor");
	linkOpen.attrSet("href", `#${slug}`);
	linkOpen.attrSet("aria-label", `Permalink to ${label}`);

	const symbol = new state.Token("text", "", 0);
	symbol.content = "#";
	const linkClose = new state.Token("link_close", "a", -1);
	const space = new state.Token("text", "", 0);
	space.content = " ";

	inline.children.unshift(linkOpen, symbol, linkClose, space);
}

export function makeMd({ wystSourceCommit } = {}) {
	if (
		wystSourceCommit !== undefined &&
		!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(wystSourceCommit)
	) {
		throw new Error("Wyst documentation source commit must be a full Git object ID");
	}
	const md = new MarkdownIt({
		html: true,
		// linkify off: the reference mentions bare filenames (e.g. "foo.md:321")
		// in prose; auto-linking them produces bogus http:// links. Real links
		// are explicit markdown and handled by the link_open rewrite below.
		linkify: false,
		typographer: false,
		highlight(str, lang) {
			const out = highlight(str, (lang || "").trim());
			const cls = lang ? ` language-${escapeHtml(lang)}` : "";
			const badge = lang ? ` data-lang="${escapeHtml(lang)}"` : "";
			return `<pre class="wyst-code${cls}"${badge}><code class="${cls.trim()}">${out}</code></pre>`;
		},
	});

	// The design repository is build input, not trusted page markup. Preserve
	// the one HTML element used for table line breaks and suppress the compiler's
	// exact contract annotations; render every other raw HTML token as text.
	md.renderer.rules.html_inline = (tokens, i) =>
		/^<br\s*\/?>$/i.test(tokens[i].content)
			? "<br>"
			: escapeHtml(tokens[i].content);
	md.renderer.rules.html_block = (tokens, i) => {
		const raw = tokens[i].content;
		return /^<!--\s*wyst-contract:\s*[\w-]+\s*-->\s*$/i.test(raw)
			? ""
			: escapeHtml(raw);
	};

	md.use(anchor, {
		level: [2, 3, 4],
		permalink: headingPermalink,
		slugify: githubSlugify,
	});

	// rewrite *.md cross-links to site URLs at render time
	const defaultLinkOpen =
		md.renderer.rules.link_open ||
		((tokens, i, opts, _env, self) => self.renderToken(tokens, i, opts));
	md.renderer.rules.link_open = (tokens, i, opts, env, self) => {
		const tok = tokens[i];
		const hi = tok.attrIndex("href");
		if (hi >= 0) {
			const href = tok.attrs[hi][1];
			if (LOCAL_DESIGN_ARTIFACTS.has(href)) {
				tok.attrs[hi][1] = `/docs/${href}`;
				return defaultLinkOpen(tokens, i, opts, env, self);
			}
			const m = href.match(/^(?:\.\/)?([\w.-]+\.md)(#[^)\s]*)?$/);
			if (m) {
				const target = fileToUrl.get(m[1]);
				if (target) {
					tok.attrs[hi][1] = target + resolvedFragment(m[1], m[2]);
				}
			} else if (/^#[\w-]+$/.test(href) && env?.sourceFile) {
				tok.attrs[hi][1] = resolvedFragment(env.sourceFile, href);
			} else {
				const artifact = href.match(
					/^(?:\.\/)?([\w.-]+\.(?:json|tsv|jsonl\.gz))$/,
				);
				if (artifact && wystSourceCommit) {
					tok.attrs[hi][1] =
						`${WYST_SOURCE_URL}/blob/${wystSourceCommit.toLowerCase()}/design/` +
						artifact[1];
					tok.attrSet("rel", "noopener");
				}
			}
		}
		return defaultLinkOpen(tokens, i, opts, env, self);
	};

	// markdown-it represents table-column alignment with inline styles. Keep
	// the authored alignment as inert metadata styled by the external stylesheet
	// so it remains compatible with the site's strict Content Security Policy.
	for (const rule of ["th_open", "td_open"]) {
		md.renderer.rules[rule] = (tokens, i, opts, _env, self) => {
			const token = tokens[i];
			const styleIndex = token.attrIndex("style");
			if (styleIndex >= 0) {
				const style = token.attrs[styleIndex][1];
				const alignment = style.match(/^text-align:(left|center|right)$/)?.[1];
				if (alignment) {
					token.attrs.splice(styleIndex, 1);
					token.attrSet("data-align", alignment);
				}
			}
			return self.renderToken(tokens, i, opts);
		};
	}

	return md;
}

// ---- build an "on this page" TOC from parsed h2/h3 tokens ------------------
function headingText(inline) {
	let text = "";
	let insidePermalink = false;
	for (const token of inline.children || []) {
		if (
			token.type === "link_open" &&
			token.attrGet("class")?.split(/\s+/).includes("doc-anchor")
		) {
			insidePermalink = true;
			continue;
		}
		if (insidePermalink) {
			if (token.type === "link_close") insidePermalink = false;
			continue;
		}
		if (token.type === "html_inline" && /^<br\s*\/?>$/i.test(token.content)) {
			text += " ";
		} else if (
			["text", "code_inline", "html_inline", "image"].includes(token.type)
		) {
			text += token.content;
		} else if (token.type === "softbreak" || token.type === "hardbreak") {
			text += " ";
		}
	}
	return text.trim();
}

export function buildToc(tokens) {
	const items = [];
	for (let index = 0; index < tokens.length; index++) {
		const heading = tokens[index];
		if (heading.type !== "heading_open" || !/^h[23]$/.test(heading.tag)) {
			continue;
		}
		const inline = tokens[index + 1];
		const id = heading.attrGet("id");
		const text = inline?.type === "inline" ? headingText(inline) : "";
		if (id && text) {
			items.push({ level: Number(heading.tag.slice(1)), id, text });
		}
	}
	if (items.length < 2) return "";
	const lis = items
		.map(
			(it) =>
				`<li class="lvl-${it.level}"><a href="#${escapeHtml(it.id)}">${escapeHtml(it.text)}</a></li>`,
		)
		.join("\n\t\t\t\t");
	return `<ul class="doc-toc-list">\n\t\t\t\t${lis}\n\t\t\t</ul>`;
}

// ---------------------------------------------------------------------------
export function generateDocs({
	docsDir = resolveDocsDir(),
	outputDir = resolveOutputDir(),
} = {}) {
	const DOCS = path.resolve(docsDir);
	const OUTPUT = path.resolve(outputDir);
	console.log("docs source:", DOCS);
	fileToUrl.clear();
	fileToFragments.clear();
	const wystSourceCommit = fs
		.readFileSync(path.join(DOCS, ".source-commit"), "utf8")
		.trim();
	if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(wystSourceCommit)) {
		throw new Error("Wyst documentation snapshot has an invalid source commit");
	}

	const mdFiles = fs
		.readdirSync(DOCS)
		.filter((f) => f.endsWith(".md"))
		.sort();

	// pass 1: read frontmatter, build the nav model + url map
	const pages = [];
	for (const file of mdFiles) {
		const text = fs.readFileSync(path.join(DOCS, file), "utf-8");
		const { data, body } = parseFrontmatter(text);
		const stem = file.replace(/\.md$/, "");
		const isIndex = file === "README.md";
		const url = isIndex ? "/docs/" : `/docs/${stem}/`;
		fileToUrl.set(file, url);
		fileToFragments.set(file, fragmentIdsFor(body));
		const title = data.title || stem;
		pages.push({
			file,
			stem,
			url,
			isIndex,
			title,
			navTitle: navTitleFrom(title),
			group: data.group || (isIndex ? "manual" : "chapter"),
			order: typeof data.order === "number" ? data.order : 999,
			chapter: data.chapter,
			appendix: data.appendix,
			summary: data.summary || "",
			body,
		});
	}
	fileToUrl.set("README.md", "/docs/");

	pages.sort((a, b) => a.order - b.order);
	const navModel = pages.filter((p) => !p.isIndex);

	const md = makeMd({ wystSourceCommit });
	const outDir = path.join(OUTPUT, "docs");
	fs.rmSync(outDir, { recursive: true, force: true });
	fs.mkdirSync(outDir, { recursive: true });
	for (const artifact of LOCAL_DESIGN_ARTIFACTS) {
		fs.copyFileSync(path.join(DOCS, artifact), path.join(outDir, artifact));
	}

	let count = 0;
	for (const page of pages) {
		// first H1 becomes the article heading; strip it from the body so it
		// isn't rendered twice (the template renders the title).
		let body = page.body.replace(/^\s*#\s+(.+?)\s*$/m, (_, h1) => {
			page.h1 = navTitleFrom(h1.trim());
			return "";
		});

		// docs home: a custom card grid, not the raw README. Use the README
		// preamble (text before the first "## ") as the intro.
		if (page.isIndex) {
			const intro = body.split(/^##\s+/m)[0];
			const html = docIndexPage({
				title: "Language Reference · Wyst",
				description:
					"The canonical Wyst language and compiler design reference.",
				canonical: SITE + page.url,
				navModel,
				h1: "Reference Manual",
				introHtml: md.render(intro),
			});
			fs.writeFileSync(path.join(outDir, "index.html"), html);
			count++;
			continue;
		}

		const env = { sourceFile: page.file };
		const tokens = md.parse(body, env);
		const articleHtml = md.renderer.render(tokens, md.options, env);
		const tocHtml = buildToc(tokens);

		const eyebrow = page.isIndex
			? "Reference"
			: page.chapter
				? ""
				: page.appendix
					? `Appendix ${page.appendix}`
					: "Reference";

		const html = docPage({
			title: `${page.navTitle} · Wyst`,
			description: page.summary,
			canonical: SITE + page.url,
			navModel,
			current: page,
			eyebrow,
			articleHtml,
			tocHtml,
		});

		const dest = page.isIndex
			? path.join(outDir, "index.html")
			: path.join(outDir, page.stem, "index.html");
		fs.mkdirSync(path.dirname(dest), { recursive: true });
		fs.writeFileSync(dest, html);
		count++;
	}

	console.log(`generated ${count} pages -> ${path.relative(ROOT, outDir)}/`);
	console.log("github:", GITHUB_URL);
	return { count, docsDir: DOCS, outputDir: outDir };
}

if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	generateDocs();
}
