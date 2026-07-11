import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function walk(dir) {
	const files = [];
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) files.push(...(await walk(fullPath)));
		else files.push(fullPath);
	}
	return files;
}

async function auditCssReferences() {
	const sourceFiles = [
		path.join(root, "index.html"),
		path.join(root, "404.html"),
		...(await walk(path.join(root, "docs"))).filter((file) => file.endsWith(".html")),
		...(await walk(path.join(root, "build"))).filter((file) => file.endsWith(".mjs")),
	];
	const source = (
		await Promise.all(sourceFiles.map((file) => readFile(file, "utf8")))
	).join("\n");
	const failures = [];

	for (const filename of ["wyst.css", "docs.css"]) {
		const css = await readFile(path.join(root, "assets", filename), "utf8");
		const classes = new Set(
			[...css.matchAll(/\.([_a-zA-Z][\w-]*)/g)].map((match) => match[1]),
		);
		const unused = [...classes].filter((className) => !source.includes(className));
		if (unused.length) failures.push(`${filename}: ${unused.sort().join(", ")}`);
	}

	if (failures.length) {
		throw new Error(`unreferenced CSS classes:\n${failures.join("\n")}`);
	}
}

function routeFor(file, publicRoot) {
	const relative = path.relative(publicRoot, file).split(path.sep).join("/");
	if (relative === "index.html") return "/";
	if (relative.endsWith("/index.html")) return `/${relative.slice(0, -"index.html".length)}`;
	return `/${relative}`;
}

async function auditRouteReachability() {
	const publicRoot = path.join(root, ".worker-assets");
	const htmlFiles = (await walk(publicRoot)).filter(
		(file) => file.endsWith(".html") && path.basename(file) !== "404.html",
	);
	const routes = new Map(
		htmlFiles.map((file) => [routeFor(file, publicRoot), file]),
	);
	const seen = new Set(["/"]);
	const queue = ["/"];

	while (queue.length) {
		const route = queue.shift();
		const html = await readFile(routes.get(route), "utf8");
		for (const match of html.matchAll(/href="([^"]+)"/g)) {
			const href = match[1];
			if (!href.startsWith("/") || href.startsWith("//")) continue;
			const target = href.split(/[?#]/, 1)[0] || "/";
			if (routes.has(target) && !seen.has(target)) {
				seen.add(target);
				queue.push(target);
			}
		}
	}

	const unreachable = [...routes.keys()].filter((route) => !seen.has(route));
	if (unreachable.length) {
		throw new Error(`unreachable public routes: ${unreachable.sort().join(", ")}`);
	}
	return routes.size;
}

await auditCssReferences();
const routeCount = await auditRouteReachability();
console.log(`site audit passed: CSS references valid; ${routeCount} routes reachable`);
