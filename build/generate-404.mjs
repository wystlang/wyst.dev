// Generates the site's 404 page from the shared HTML shell so it inherits the
// same header, footer, and design system as every other page.
//
// The static host serves this page for unmatched paths. The output is generated
// directly into the deploy artifact and is never committed.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { errorPage } from "./template.mjs";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");

function resolveOutputDir() {
	return process.env.WYST_OUTPUT_DIR
		? path.resolve(process.env.WYST_OUTPUT_DIR)
		: path.join(ROOT, "dist");
}

const bodyHtml = `<p class="nf-lede">
				The address did not resolve to a generated page. Nothing is mapped
				here.
			</p>`;

export function generate404({ outputDir = resolveOutputDir() } = {}) {
	const html = errorPage({
		title: "Page not found · Wyst",
		description: "The page you requested could not be found on wyst.dev.",
		eyebrow: "404",
		h1: "Page not found",
		bodyHtml,
		actions: [
			{ href: "/", label: "home" },
			{ href: "/docs/", label: "reference" },
		],
	});

	const dest = path.join(path.resolve(outputDir), "404.html");
	fs.mkdirSync(path.dirname(dest), { recursive: true });
	fs.writeFileSync(dest, html);
	console.log(`wrote ${path.relative(ROOT, dest)}`);
	return dest;
}

if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	generate404();
}
