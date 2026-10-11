// Builds the site into dist/, or into $WYST_OUTPUT_DIR: the homepage, the
// documentation, the 404 page, the sitemap, and the Cloudflare `_headers`
// file. The output depends only on the files in this repository.

import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import MarkdownIt from "markdown-it";
import anchor from "markdown-it-anchor";
import { homeBody } from "./home.mjs";
import {
	docIndexPage,
	docPage,
	escapeHtml,
	homePage,
	notFoundPage,
	SITE,
} from "./template.mjs";
import { registerWyst } from "./wyst-prism.mjs";

const require = createRequire(import.meta.url);
const Prism = require("prismjs");
require("prismjs/components/prism-bash.js");
registerWyst(Prism);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOCS = path.join(ROOT, "content", "docs");

// These files get a content hash in their names, so that a browser can
// keep them for a year.
const FINGERPRINTED = ["wyst.css", "docs.css", "docs.js", "home.js"];

const SECURITY_HEADERS = `/*
  Content-Security-Policy: default-src 'none'; base-uri 'none'; connect-src 'none'; font-src 'self'; form-action 'none'; frame-ancestors 'none'; img-src 'self' data:; script-src 'self'; style-src 'self'; upgrade-insecure-requests
  Cross-Origin-Opener-Policy: same-origin
  Permissions-Policy: accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()
  Referrer-Policy: strict-origin-when-cross-origin
  Strict-Transport-Security: max-age=31536000
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  X-XSS-Protection: 0`;

export function highlight(code, lang) {
	const grammar = Prism.languages[lang === "sh" ? "bash" : lang];
	return grammar ? Prism.highlight(code, grammar, lang) : escapeHtml(code);
}

// GitHub's heading slugs, so that a link to a heading looks the same in
// the Markdown source and on the site.
function slugify(value) {
	return String(value)
		.trim()
		.toLowerCase()
		.replace(/[^\p{L}\p{N}\s_-]/gu, "")
		.replace(/\s+/g, "-");
}

function permalink(slug, _options, state, index) {
	const link = new state.Token("link_open", "a", 1);
	link.attrSet("class", "doc-anchor");
	link.attrSet("href", `#${slug}`);
	link.attrSet("aria-label", "Link to this heading");
	const symbol = new state.Token("text", "", 0);
	symbol.content = "#";
	const space = new state.Token("text", "", 0);
	space.content = " ";
	state.tokens[index + 1].children.unshift(
		link,
		symbol,
		new state.Token("link_close", "a", -1),
		space,
	);
}

function markdown() {
	const md = new MarkdownIt({
		html: false,
		highlight(code, lang) {
			const cls = lang ? ` language-${escapeHtml(lang)}` : "";
			return `<pre class="wyst-code${cls}"><code>${highlight(code, lang)}</code></pre>`;
		},
	});
	md.use(anchor, { level: [2, 3], permalink, slugify });
	// markdown-it aligns table cells with a style attribute, which the
	// Content Security Policy refuses. docs.css aligns them from
	// `data-align`.
	for (const rule of ["th_open", "td_open"]) {
		md.renderer.rules[rule] = (tokens, i, options, _env, self) => {
			const style = tokens[i].attrGet("style");
			const align = style?.match(/^text-align:(left|center|right)$/)?.[1];
			if (align) {
				tokens[i].attrs = tokens[i].attrs.filter(([name]) => name !== "style");
				tokens[i].attrSet("data-align", align);
			}
			return self.renderToken(tokens, i, options);
		};
	}
	return md;
}

function headingText(inline) {
	// Skip the permalink: `#` and the space after it.
	return inline.children
		.slice(4)
		.filter((token) => token.type === "text" || token.type === "code_inline")
		.map((token) => token.content)
		.join("")
		.trim();
}

function toc(tokens) {
	const items = [];
	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];
		if (token.type !== "heading_open") continue;
		const level = Number(token.tag.slice(1));
		const text = headingText(tokens[i + 1]);
		items.push(
			`<li class="lvl-${level}"><a href="#${token.attrGet("id")}">${escapeHtml(text)}</a></li>`,
		);
	}
	if (items.length < 2) return "";
	return `<ul class="doc-toc-list">\n\t\t\t\t${items.join("\n\t\t\t\t")}\n\t\t\t</ul>`;
}

// The front matter is `key: value` lines between two `---` lines.
function readPage(file) {
	const text = fs.readFileSync(file, "utf8");
	const match = text.match(/^---\n([\s\S]*?)\n---\n/);
	if (!match) throw new Error(`${file}: no front matter`);
	const data = {};
	for (const line of match[1].split("\n")) {
		const [, key, value] = line.match(/^(\w+):\s*(.*)$/) ?? [];
		if (!key) throw new Error(`${file}: bad front matter line: ${line}`);
		data[key] = value;
	}
	for (const key of ["title", "summary"]) {
		if (!data[key]) throw new Error(`${file}: no ${key}`);
	}
	return { ...data, body: text.slice(match[0].length) };
}

function readNav() {
	const groups = JSON.parse(fs.readFileSync(path.join(DOCS, "nav.json"), "utf8"));
	const listed = new Set();
	const nav = groups.map((group) => ({
		title: group.title,
		pages: group.pages.map((slug) => {
			if (listed.has(slug)) throw new Error(`nav.json lists ${slug} twice`);
			listed.add(slug);
			const page = readPage(path.join(DOCS, `${slug}.md`));
			return { ...page, slug, group: group.title, url: `/docs/${slug}/` };
		}),
	}));
	for (const file of fs.readdirSync(DOCS)) {
		const slug = file.replace(/\.md$/, "");
		if (file.endsWith(".md") && slug !== "index" && !listed.has(slug)) {
			throw new Error(`nav.json does not list ${file}`);
		}
	}
	return nav;
}

function write(outputDir, url, html) {
	const file = path.join(outputDir, url, url.endsWith("/") ? "index.html" : "");
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, html);
}

function copyAssets(outputDir) {
	const source = path.join(ROOT, "assets");
	const target = path.join(outputDir, "assets");
	fs.cpSync(source, target, { recursive: true });
	const assets = {};
	for (const name of FINGERPRINTED) {
		const bytes = fs.readFileSync(path.join(source, name));
		const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 8);
		const ext = path.extname(name);
		const hashed = `${name.slice(0, -ext.length)}.${hash}${ext}`;
		fs.renameSync(path.join(target, name), path.join(target, hashed));
		assets[name] = `/assets/${hashed}`;
	}
	return assets;
}

function walk(dir) {
	return fs
		.readdirSync(dir, { withFileTypes: true })
		.flatMap((entry) => {
			const full = path.join(dir, entry.name);
			return entry.isDirectory() ? walk(full) : [full];
		})
		.sort();
}

function writeHeaders(outputDir, assets) {
	const hashed = new Set(Object.values(assets));
	const rules = walk(path.join(outputDir, "assets")).map((file) => {
		const url = `/${path.relative(outputDir, file).split(path.sep).join("/")}`;
		const immutable = hashed.has(url) || url.endsWith(".woff2");
		const cache = immutable
			? "public, max-age=31536000, immutable"
			: "public, max-age=0, must-revalidate";
		return `${url}\n  Cache-Control: ${cache}`;
	});
	fs.writeFileSync(
		path.join(outputDir, "_headers"),
		`${SECURITY_HEADERS}\n${rules.join("\n")}\n`,
	);
}

function writeSitemap(outputDir, urls) {
	const lines = urls.map((url) => `\t<url><loc>${SITE}${url}</loc></url>`);
	fs.writeFileSync(
		path.join(outputDir, "sitemap.xml"),
		[
			'<?xml version="1.0" encoding="UTF-8"?>',
			'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
			...lines,
			"</urlset>",
			"",
		].join("\n"),
	);
}

export function build(outputDir = process.env.WYST_OUTPUT_DIR || path.join(ROOT, "dist")) {
	fs.rmSync(outputDir, { recursive: true, force: true });
	fs.mkdirSync(outputDir, { recursive: true });
	fs.copyFileSync(path.join(ROOT, "robots.txt"), path.join(outputDir, "robots.txt"));
	const assets = copyAssets(outputDir);
	const md = markdown();
	const nav = readNav();
	const pages = nav.flatMap((group) => group.pages);

	write(outputDir, "/", homePage({ assets, body: homeBody(highlight) }));

	const index = readPage(path.join(DOCS, "index.md"));
	write(
		outputDir,
		"/docs/",
		docIndexPage({
			assets,
			nav,
			title: index.title,
			summary: index.summary,
			introHtml: md.render(index.body),
		}),
	);

	pages.forEach((page, i) => {
		const tokens = md.parse(page.body, {});
		write(
			outputDir,
			page.url,
			docPage({
				assets,
				nav,
				page,
				previous: pages[i - 1],
				next: pages[i + 1],
				articleHtml: md.renderer.render(tokens, md.options, {}),
				tocHtml: toc(tokens),
			}),
		);
	});

	write(outputDir, "/404.html", notFoundPage({ assets }));
	writeSitemap(outputDir, ["/", "/docs/", ...pages.map((page) => page.url)]);
	writeHeaders(outputDir, assets);
	return { outputDir, pages };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const { outputDir, pages } = build();
	console.log(`built ${pages.length + 2} pages in ${path.relative(process.cwd(), outputDir) || "."}`);
}
