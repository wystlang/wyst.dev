import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const auditScript = fileURLToPath(
	new URL("../tools/audit-site.mjs", import.meta.url),
);

function runAudit(publicRoot) {
	const args = [auditScript];
	if (publicRoot) args.push("--public-root", publicRoot);
	return spawnSync(process.execPath, args, { encoding: "utf8" });
}

async function makeFixture(t, { homeLink = "./guide/#topic" } = {}) {
	const publicRoot = await mkdtemp(path.join(os.tmpdir(), "wyst-site-audit-"));
	t.after(() => rm(publicRoot, { recursive: true, force: true }));
	await mkdir(path.join(publicRoot, "guide"), { recursive: true });
	await mkdir(path.join(publicRoot, "assets"), { recursive: true });
	await Promise.all([
		writeFile(
			path.join(publicRoot, "index.html"),
			`<!doctype html><html><head>
				<link rel="stylesheet" href="/assets/site.css">
				<meta property="og:image" content="https://wyst.dev/assets/icon.svg">
			</head><body id="top">
				<a href="${homeLink}">Guide</a>
				<a href="https://invalid.example.test/no-network">External</a>
				<img src="assets/icon.svg#mark" alt="">
			</body></html>`,
		),
		writeFile(
			path.join(publicRoot, "guide", "index.html"),
			'<main><h1 id="topic">Topic</h1><a href="../#top">Home</a></main>',
		),
		writeFile(
			path.join(publicRoot, "assets", "site.css"),
			'body { background-image: url("./pixel.png"); }',
		),
		writeFile(path.join(publicRoot, "assets", "pixel.png"), "pixel"),
		writeFile(
			path.join(publicRoot, "assets", "icon.svg"),
			'<svg id="mark" xmlns="http://www.w3.org/2000/svg"></svg>',
		),
		writeFile(
			path.join(publicRoot, "sitemap.xml"),
			'<urlset><url><loc>https://wyst.dev/</loc></url><url><loc>https://wyst.dev/guide/</loc></url></urlset>',
		),
		writeFile(
			path.join(publicRoot, "robots.txt"),
			"User-agent: *\nAllow: /\nSitemap: https://wyst.dev/sitemap.xml\n",
		),
		writeFile(
			path.join(publicRoot, "_headers"),
			"/*\n  X-Content-Type-Options: nosniff\n/assets/site.css\n  Cache-Control: max-age=60\n",
		),
	]);
	return publicRoot;
}

test("public CSS, routes, local references, and fragments pass the site audit", () => {
	const result = runAudit();
	assert.equal(result.status, 0, result.stderr || result.stdout);
	assert.match(result.stdout, /site audit passed/);
	assert.match(result.stdout, /local references and fragments valid/);
});

test("audit resolves relative assets and skips external URLs without fetching them", async (t) => {
	const publicRoot = await makeFixture(t);
	const result = runAudit(publicRoot);
	assert.equal(result.status, 0, result.stderr || result.stdout);
	assert.match(result.stdout, /2 routes reachable/);
	assert.match(result.stdout, /1 external references skipped/);
});

test("audit rejects missing relative targets", async (t) => {
	const publicRoot = await makeFixture(t, { homeLink: "./missing/" });
	const result = runAudit(publicRoot);
	assert.notEqual(result.status, 0);
	assert.match(result.stderr, /invalid public references/);
	assert.match(result.stderr, /missing local target \/missing\//);
});

test("audit rejects missing fragments in existing documents", async (t) => {
	const publicRoot = await makeFixture(t, { homeLink: "./guide/#absent" });
	const result = runAudit(publicRoot);
	assert.notEqual(result.status, 0);
	assert.match(result.stderr, /missing fragment #absent in \/guide\//);
});

test("audit rejects an incomplete sitemap", async (t) => {
	const publicRoot = await makeFixture(t);
	await writeFile(
		path.join(publicRoot, "sitemap.xml"),
		'<urlset><url><loc>https://wyst.dev/</loc></url></urlset>',
	);
	const result = runAudit(publicRoot);
	assert.notEqual(result.status, 0);
	assert.match(result.stderr, /sitemap missing routes: \/guide\//);
});
