import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
const SITE = "https://wyst.dev";

function resolveOutputDir() {
	return process.env.WYST_OUTPUT_DIR
		? path.resolve(process.env.WYST_OUTPUT_DIR)
		: path.join(ROOT, "dist");
}

async function walk(dir) {
	const files = [];
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) files.push(...(await walk(fullPath)));
		else files.push(fullPath);
	}
	return files;
}

function routeFor(file, outputDir) {
	const relative = path.relative(outputDir, file).split(path.sep).join("/");
	if (relative === "index.html") return "/";
	return `/${relative.slice(0, -"index.html".length)}`;
}

export async function generateSitemap({ outputDir = resolveOutputDir() } = {}) {
	const output = path.resolve(outputDir);
	const docsPages = (await walk(path.join(output, "docs"))).filter(
		(file) => path.basename(file) === "index.html",
	);
	const routes = ["/", ...docsPages.map((file) => routeFor(file, output))].sort(
		(a, b) => {
			if (a === "/") return -1;
			if (b === "/") return 1;
			return a.localeCompare(b);
		},
	);

	const urls = routes.map((route) => `\t<url><loc>${SITE}${route}</loc></url>`);
	const xml = [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
		...urls,
		"</urlset>",
		"",
	].join("\n");

	const destination = path.join(output, "sitemap.xml");
	await writeFile(destination, xml);
	console.log(`wrote ${path.relative(ROOT, destination)} (${routes.length} routes)`);
	return { destination, routes };
}

if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	await generateSitemap();
}
