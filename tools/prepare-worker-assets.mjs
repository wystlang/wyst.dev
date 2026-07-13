import {
	cp,
	mkdir,
	readFile,
	readdir,
	rename,
	rm,
	writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, ".worker-assets");

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const entries = [
	"index.html",
	"404.html",
	"robots.txt",
	"sitemap.xml",
	"assets",
	"docs",
];

for (const entry of entries) {
	await cp(path.join(root, entry), path.join(outDir, entry), {
		recursive: true,
		force: true,
	});
}

const assetsDir = path.join(outDir, "assets");

// Recursively list files under a directory, returning absolute paths.
async function walk(dir) {
	const found = [];
	for (const ent of await readdir(dir, { withFileTypes: true })) {
		const full = path.join(dir, ent.name);
		if (ent.isDirectory()) found.push(...(await walk(full)));
		else found.push(full);
	}
	return found;
}

function hash8(buf) {
	return createHash("sha256").update(buf).digest("hex").slice(0, 8);
}

// ---------------------------------------------------------------------------
// Fingerprint cache-sensitive assets in the deploy artifact so they can be served
// `immutable` (see the cache policy below). Source filenames stay stable —
// only the copies under .worker-assets/ are renamed and their references in the
// generated HTML rewritten. The hash is content-derived, so unchanged files keep
// the same name and the committed artifact stays free of spurious diffs.
const htmlFiles = (await walk(outDir)).filter((f) => f.endsWith(".html"));
const rewrites = []; // [fromRef, toRef]

for (const asset of ["wyst.css", "docs.css", "docs.js"]) {
	const src = path.join(assetsDir, asset);
	let buf;
	try {
		buf = await readFile(src);
	} catch {
		continue; // stylesheet not present; skip
	}
	const ext = path.extname(asset);
	const stem = asset.slice(0, -ext.length);
	const hashed = `${stem}.${hash8(buf)}${ext}`;
	await rename(src, path.join(assetsDir, hashed));
	// References appear as both "assets/foo.css" (root, relative) and
	// "/assets/foo.css" (docs, absolute); the shared substring covers both.
	rewrites.push([`assets/${asset}`, `assets/${hashed}`]);
}

for (const file of htmlFiles) {
	let html = await readFile(file, "utf-8");
	let changed = false;
	for (const [from, to] of rewrites) {
		if (html.includes(from)) {
			html = html.split(from).join(to);
			changed = true;
		}
	}
	if (changed) await writeFile(file, html);
}

// ---------------------------------------------------------------------------
// Cache policy. Cloudflare Workers Assets defaults to `max-age=0,
// must-revalidate`, which costs a revalidation round-trip per asset on every
// visit. Override it with a generated `_headers` file:
//   - fingerprinted CSS and fonts never change under their name -> immutable.
//   - images keep stable, un-fingerprinted names, so a deploy could change them;
//     `stale-while-revalidate` removes the blocking round-trip on repeat visits
//     while still bounding how long a stale copy can be served.
// HTML is intentionally omitted so it keeps the revalidated default and deploys
// go live immediately. Rules are explicit per-file (not globbed): Workers
// `_headers` only guarantees a single greedy splat, with no promise that a fixed
// extension suffix after `*` matches — exact paths are unambiguous.
const IMMUTABLE = "public, max-age=31536000, immutable";
const REVALIDATE = "public, max-age=86400, stale-while-revalidate=604800";
const MUST_REVALIDATE = "public, max-age=0, must-revalidate";
const FAVICON_URLS = new Set([
	"/assets/apple-touch-icon.png",
	"/assets/favicon-48.png",
	"/assets/favicon.svg",
]);
const POLICY = {
	".css": IMMUTABLE,
	".js": IMMUTABLE,
	".woff2": IMMUTABLE,
	".woff": IMMUTABLE,
	".ttf": IMMUTABLE,
	".otf": IMMUTABLE,
	".avif": REVALIDATE,
	".webp": REVALIDATE,
	".png": REVALIDATE,
	".jpg": REVALIDATE,
	".jpeg": REVALIDATE,
	".gif": REVALIDATE,
	".svg": REVALIDATE,
	".ico": REVALIDATE,
};

const rules = [];
for (const file of await walk(assetsDir)) {
	const url = "/" + path.relative(outDir, file).split(path.sep).join("/");
	const cc = FAVICON_URLS.has(url)
		? MUST_REVALIDATE
		: POLICY[path.extname(file).toLowerCase()];
	if (!cc) continue;
	rules.push({ url, cc });
}
rules.sort((a, b) => a.url.localeCompare(b.url)); // deterministic output

const SECURITY_HEADERS = `/*
  Content-Security-Policy: default-src 'none'; base-uri 'none'; connect-src 'none'; font-src 'self'; form-action 'none'; frame-ancestors 'none'; img-src 'self' data:; script-src 'self'; style-src 'self'; upgrade-insecure-requests
  Cross-Origin-Opener-Policy: same-origin
  Permissions-Policy: accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()
  Referrer-Policy: strict-origin-when-cross-origin
  Strict-Transport-Security: max-age=31536000
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  X-XSS-Protection: 0`;

const headers =
	"# Generated by tools/prepare-worker-assets.mjs — do not edit by hand.\n" +
	"# Security and cache policy for static assets served by Cloudflare Workers Assets.\n" +
	SECURITY_HEADERS +
	"\n" +
	rules.map((r) => `${r.url}\n  Cache-Control: ${r.cc}`).join("\n") +
	"\n";

await writeFile(path.join(outDir, "_headers"), headers);

console.log(`Prepared ${entries.join(", ")} in ${path.relative(root, outDir)}`);
if (rewrites.length) {
	console.log(
		`Fingerprinted ${rewrites.map(([f, t]) => `${f} -> ${t}`).join(", ")}`,
	);
}
console.log(`Wrote _headers (${rules.length} rules)`);
