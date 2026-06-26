// Generates the site's 404 page from the shared HTML shell so it inherits the
// same header, footer, and design system as every other page.
//
// Workers Static Assets is configured with `not_found_handling: "404-page"`
// (see wrangler.jsonc), which serves the nearest 404.html for any unmatched
// path. Without this file that setting silently falls back to a blank,
// null-body 404 response. The output is committed at the repo root alongside
// index.html and copied into the deploy artifact by
// tools/prepare-worker-assets.mjs.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { errorPage } from "./template.mjs";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");

const bodyHtml = `<p class="nf-lede">
				The address did not resolve to a generated page. Nothing is mapped
				here.
			</p>`;

const html = errorPage({
	title: "Page not found · Wyst",
	description: "The page you requested could not be found on wyst.dev.",
	eyebrow: "Error 404 · Data abort",
	fault: { code: "translation fault", text: "no page mapped at this address" },
	h1: "Page not found",
	bodyHtml,
	actions: [
		{ href: "/", label: "Back home", variant: "primary", arrow: true },
		{ href: "/docs/", label: "Docs", variant: "secondary" },
	],
});

const dest = path.join(ROOT, "404.html");
fs.writeFileSync(dest, html);
console.log(`wrote ${path.relative(ROOT, dest)}`);
