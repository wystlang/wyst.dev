// Static documentation generator for wyst.dev.
//
// Reads the Wyst design reference (markdown) and emits styled HTML under /docs/,
// reusing the homepage design system. Markdown source is treated as
// read-only: cross-links (`*.md`) are rewritten to site URLs at build time so
// the source stays valid when viewed on GitHub.
//
//   WYST_DOCS_DIR  override for the docs source directory
//   default order: ../wyst/design, then vendor/wyst-design

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

function resolveDocsDir() {
	const candidates = [
		process.env.WYST_DOCS_DIR,
		path.join(ROOT, "..", "wyst", "design"),
		path.join(ROOT, "vendor", "wyst-design"),
	].filter(Boolean);
	for (const c of candidates) {
		if (fs.existsSync(path.join(c, "README.md"))) return path.resolve(c);
	}
	throw new Error(
		"Could not locate the Wyst design docs. Set WYST_DOCS_DIR, clone wystlang/wyst next to this repo as ../wyst, or sync vendor/wyst-design.",
	);
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

export function makeMd() {
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
			if (href === "semantic-db.json") {
				tok.attrs[hi][1] = "/docs/semantic-db.json";
				return defaultLinkOpen(tokens, i, opts, env, self);
			}
			const m = href.match(/^(?:\.\/)?([\w.-]+\.md)(#[^)\s]*)?$/);
			if (m) {
				const target = fileToUrl.get(m[1]);
				if (target) tok.attrs[hi][1] = target + (m[2] || "");
			}
		}
		return defaultLinkOpen(tokens, i, opts, env, self);
	};

	return md;
}

// ---- build an "on this page" TOC from rendered h2/h3 -----------------------
function buildToc(html) {
	const re = /<h([23]) id="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g;
	const items = [];
	let m;
	while ((m = re.exec(html))) {
		const text = m[3]
			.replace(/<a class="doc-anchor"[\s\S]*?<\/a>/g, "")
			.replace(/<[^>]+>/g, "")
			.trim();
		if (text) items.push({ level: Number(m[1]), id: m[2], text });
	}
	if (items.length < 2) return "";
	const lis = items
		.map(
			(it) =>
				`<li class="lvl-${it.level}"><a href="#${it.id}">${escapeHtml(it.text)}</a></li>`,
		)
		.join("\n\t\t\t\t");
	return `<ul class="doc-toc-list">\n\t\t\t\t${lis}\n\t\t\t</ul>`;
}

// ---------------------------------------------------------------------------
function main() {
	const DOCS = resolveDocsDir();
	console.log("docs source:", DOCS);

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

	const md = makeMd();
	const outDir = path.join(ROOT, "docs");
	fs.rmSync(outDir, { recursive: true, force: true });
	fs.mkdirSync(outDir, { recursive: true });
	fs.copyFileSync(
		path.join(DOCS, "semantic-db.json"),
		path.join(outDir, "semantic-db.json"),
	);

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

		const articleHtml = md.render(body);
		const tocHtml = buildToc(articleHtml);

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
}

if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	main();
}
