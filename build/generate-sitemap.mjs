import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
const SITE = "https://wyst.dev";

async function walk(dir) {
	const files = [];
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) files.push(...(await walk(fullPath)));
		else files.push(fullPath);
	}
	return files;
}

function routeFor(file) {
	const relative = path.relative(ROOT, file).split(path.sep).join("/");
	if (relative === "index.html") return "/";
	return `/${relative.slice(0, -"index.html".length)}`;
}

const docsPages = (await walk(path.join(ROOT, "docs"))).filter(
	(file) => path.basename(file) === "index.html",
);
const routes = ["/", ...docsPages.map(routeFor)].sort((a, b) => {
	if (a === "/") return -1;
	if (b === "/") return 1;
	return a.localeCompare(b);
});

const urls = routes.map((route) => `\t<url><loc>${SITE}${route}</loc></url>`);
const xml = [
	'<?xml version="1.0" encoding="UTF-8"?>',
	'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
	...urls,
	"</urlset>",
	"",
].join("\n");

const destination = path.join(ROOT, "sitemap.xml");
await writeFile(destination, xml);
console.log(`wrote sitemap.xml (${routes.length} routes)`);
