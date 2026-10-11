// Builds the site into a temporary directory and checks the output: each
// link inside the site goes to a page, and each fragment to a heading.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { build } from "../build/build.mjs";

let outputDir;
let pages;

function htmlFiles(dir) {
	return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) return htmlFiles(full);
		return entry.name.endsWith(".html") ? [full] : [];
	});
}

function fileFor(urlPath) {
	const file = path.join(outputDir, urlPath);
	return urlPath.endsWith("/") ? path.join(file, "index.html") : file;
}

function ids(file) {
	return new Set([...fs.readFileSync(file, "utf8").matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
}

before(() => {
	outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "wyst-site-"));
	({ pages } = build(outputDir));
});

after(() => fs.rmSync(outputDir, { recursive: true, force: true }));

test("each link inside the site goes to a page and a heading", () => {
	const broken = [];
	for (const file of htmlFiles(outputDir)) {
		const page = `/${path.relative(outputDir, file)}`;
		const html = fs.readFileSync(file, "utf8");
		for (const [, href] of html.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
			if (/^(?:https?:|mailto:)/.test(href)) continue;
			const [target, fragment] = href.split("#");
			const targetFile = target ? fileFor(target) : file;
			if (!target.startsWith("/") && target) {
				broken.push(`${page}: relative link ${href}`);
			} else if (!fs.existsSync(targetFile)) {
				broken.push(`${page}: no page for ${href}`);
			} else if (fragment && !ids(targetFile).has(fragment)) {
				broken.push(`${page}: no heading for ${href}`);
			}
		}
	}
	assert.deepEqual(broken, []);
});

test("the sitemap lists each page", () => {
	const sitemap = fs.readFileSync(path.join(outputDir, "sitemap.xml"), "utf8");
	for (const url of ["/", "/docs/", ...pages.map((page) => page.url)]) {
		assert.ok(sitemap.includes(`<loc>https://wyst.dev${url}</loc>`), url);
	}
});

test("each documentation page has a summary and code that the build highlights", () => {
	for (const page of pages) {
		const html = fs.readFileSync(fileFor(page.url), "utf8");
		assert.ok(html.includes('<p class="doc-lede">'), `${page.url} has no summary`);
		for (const [, lang] of html.matchAll(/<pre class="wyst-code language-(\w+)">/g)) {
			assert.ok(["wyst", "layout", "sh", "text", "json"].includes(lang), `${page.url}: ${lang}`);
		}
	}
});

test("the headers file sets the Content Security Policy", () => {
	const headers = fs.readFileSync(path.join(outputDir, "_headers"), "utf8");
	assert.match(headers, /^\/\*\n {2}Content-Security-Policy: default-src 'none';/);
	assert.match(headers, /\/assets\/wyst\.[0-9a-f]{8}\.css\n {2}Cache-Control: public, max-age=31536000, immutable/);
});
