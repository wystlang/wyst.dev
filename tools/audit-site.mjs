import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultPublicRoot = path.join(root, ".worker-assets");
const siteOrigin = new URL("https://wyst.dev");

async function walk(dir) {
	const files = [];
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) files.push(...(await walk(fullPath)));
		else files.push(fullPath);
	}
	return files;
}

function parseArgs(argv) {
	let publicRoot = defaultPublicRoot;
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === "--public-root" && argv[i + 1]) {
			publicRoot = path.resolve(argv[++i]);
			continue;
		}
		throw new Error(`unknown argument: ${argv[i]}`);
	}
	return { publicRoot };
}

function decodeHtml(value) {
	return value.replace(
		/&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi,
		(entity) => {
			const named = {
				"&amp;": "&",
				"&quot;": '"',
				"&apos;": "'",
				"&lt;": "<",
				"&gt;": ">",
			};
			const lower = entity.toLowerCase();
			if (named[lower]) return named[lower];
			const hex = lower.startsWith("&#x");
			const value = Number.parseInt(entity.slice(hex ? 3 : 2, -1), hex ? 16 : 10);
			return Number.isFinite(value) ? String.fromCodePoint(value) : entity;
		},
	);
}

function lineNumberAt(source, index) {
	let line = 1;
	for (let i = 0; i < index; i++) {
		if (source.charCodeAt(i) === 10) line++;
	}
	return line;
}

function attributesFromTag(tag) {
	const attributes = new Map();
	for (const match of tag.matchAll(
		/\b([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g,
	)) {
		attributes.set(
			match[1].toLowerCase(),
			decodeHtml(match[2] ?? match[3] ?? match[4] ?? ""),
		);
	}
	return attributes;
}

function cssReferences(css, offset = 0) {
	const refs = [];
	for (const match of css.matchAll(
		/url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s"')][^)]*?))\s*\)/gi,
	)) {
		refs.push({
			kind: "CSS url",
			value: (match[1] ?? match[2] ?? match[3] ?? "").trim(),
			index: offset + match.index,
		});
	}
	for (const match of css.matchAll(/@import\s+(?:"([^"]*)"|'([^']*)')/gi)) {
		refs.push({
			kind: "CSS import",
			value: match[1] ?? match[2] ?? "",
			index: offset + match.index,
		});
	}
	return refs;
}

function htmlReferences(html) {
	const refs = [];
	for (const match of html.matchAll(/<[^>]+>/g)) {
		const tag = match[0];
		const attributes = attributesFromTag(tag);
		for (const name of [
			"href",
			"src",
			"poster",
			"action",
			"formaction",
			"data",
			"cite",
			"manifest",
			"usemap",
		]) {
			if (!attributes.has(name)) continue;
			refs.push({
				kind: name,
				value: attributes.get(name),
				index: match.index,
			});
		}

		if (attributes.has("srcset")) {
			for (const candidate of attributes.get("srcset").split(",")) {
				const value = candidate.trim().split(/\s+/, 1)[0];
				if (value) refs.push({ kind: "srcset", value, index: match.index });
			}
		}

		if (attributes.has("style")) {
			refs.push(...cssReferences(attributes.get("style"), match.index));
		}

		if (/^<meta\b/i.test(tag) && attributes.has("content")) {
			const property = (
				attributes.get("property") ?? attributes.get("name") ?? ""
			).toLowerCase();
			if (
				property === "og:url" ||
				property === "og:image" ||
				property === "twitter:image"
			) {
				refs.push({
					kind: `meta ${property}`,
					value: attributes.get("content"),
					index: match.index,
				});
			}
		}
	}
	return refs;
}

function markupReferences(markup) {
	const refs = [];
	for (const match of markup.matchAll(/<[^>]+>/g)) {
		const attributes = attributesFromTag(match[0]);
		for (const name of ["href", "xlink:href", "src"]) {
			if (attributes.has(name)) {
				refs.push({
					kind: name,
					value: attributes.get(name),
					index: match.index,
				});
			}
		}
	}
	return refs;
}

function sitemapReferences(xml) {
	return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((match) => ({
		kind: "sitemap loc",
		value: decodeHtml(match[1]),
		index: match.index,
	}));
}

function robotsReferences(source) {
	return [...source.matchAll(/^\s*Sitemap:\s*(\S+)\s*$/gim)].map((match) => ({
		kind: "robots sitemap",
		value: match[1],
		index: match.index,
	}));
}

function headersReferences(source) {
	return [...source.matchAll(/^\/(?!.*[*:])\S*$/gm)].map((match) => ({
		kind: "headers target",
		value: match[0],
		index: match.index,
	}));
}

function idsFromMarkup(markup) {
	const ids = new Set();
	for (const match of markup.matchAll(/<[^>]+>/g)) {
		const attributes = attributesFromTag(match[0]);
		if (attributes.has("id")) ids.add(attributes.get("id"));
		if (/^<a\b/i.test(match[0]) && attributes.has("name")) {
			ids.add(attributes.get("name"));
		}
	}
	return ids;
}

function routeFor(file, publicRoot) {
	const relative = path.relative(publicRoot, file).split(path.sep).join("/");
	if (relative === "index.html") return "/";
	if (relative.endsWith("/index.html")) {
		return `/${relative.slice(0, -"index.html".length)}`;
	}
	return `/${relative}`;
}

function isMarkup(file) {
	return file.endsWith(".html") || file.endsWith(".svg") || file.endsWith(".xml");
}

function publicPath(file, publicRoot) {
	return `/${path.relative(publicRoot, file).split(path.sep).join("/")}`;
}

function resolveReference(rawValue, baseUrl) {
	const value = rawValue.trim();
	if (!value) return { type: "internal", url: new URL(baseUrl) };
	if (/^(?:mailto|tel|data|blob):/i.test(value)) return { type: "ignored" };
	if (/^javascript:/i.test(value)) {
		return { type: "invalid", reason: "javascript URL is not allowed" };
	}

	let url;
	try {
		url = new URL(value, baseUrl);
	} catch {
		return { type: "invalid", reason: "malformed URL" };
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		return { type: "ignored" };
	}
	if (url.hostname !== siteOrigin.hostname) return { type: "external", url };
	if (url.origin !== siteOrigin.origin) {
		return {
			type: "invalid",
			reason: `same-site URL must use ${siteOrigin.origin}`,
		};
	}
	return { type: "internal", url };
}

function targetForUrl(url, filesByPath, publicRoot) {
	let pathname;
	try {
		pathname = decodeURIComponent(url.pathname);
	} catch {
		return { error: "malformed percent-encoding in path" };
	}
	if (pathname.includes("\0")) return { error: "NUL byte in path" };

	const relative = pathname.replace(/^\/+/, "");
	const candidates = [];
	if (!relative) {
		candidates.push("/index.html");
	} else if (pathname.endsWith("/")) {
		candidates.push(`/${relative}index.html`);
	} else {
		candidates.push(`/${relative}`, `/${relative}/index.html`);
		if (!path.posix.extname(relative)) candidates.push(`/${relative}.html`);
	}

	for (const candidate of candidates) {
		if (filesByPath.has(candidate)) return { file: filesByPath.get(candidate) };
	}
	return {
		error: `missing local target ${url.pathname}`,
		expected: candidates.map((candidate) => path.join(publicRoot, candidate)),
	};
}

function fragmentCandidates(hash) {
	const raw = hash.slice(1);
	const candidates = new Set([raw]);
	try {
		candidates.add(decodeURIComponent(raw));
	} catch {
		return { error: "malformed percent-encoding in fragment" };
	}
	return { candidates };
}

async function referencesForFile(file, source) {
	if (file.endsWith(".html")) return htmlReferences(source);
	if (file.endsWith(".css")) return cssReferences(source);
	if (file.endsWith(".svg")) return markupReferences(source);
	if (path.basename(file) === "sitemap.xml") return sitemapReferences(source);
	if (path.basename(file) === "robots.txt") return robotsReferences(source);
	if (path.basename(file) === "_headers") return headersReferences(source);
	return [];
}

async function auditPublicReferences(publicRoot) {
	const files = await walk(publicRoot);
	const filesByPath = new Map(
		files.map((file) => [publicPath(file, publicRoot), file]),
	);
	const sourceByFile = new Map();
	const refsByFile = new Map();
	const idsByFile = new Map();
	const failures = [];
	let internalCount = 0;
	let externalCount = 0;

	for (const file of files) {
		if (!/\.(?:html|css|svg|xml|txt)$/.test(file) && path.basename(file) !== "_headers") {
			continue;
		}
		const source = await readFile(file, "utf8");
		sourceByFile.set(file, source);
		refsByFile.set(file, await referencesForFile(file, source));
		if (isMarkup(file)) idsByFile.set(file, idsFromMarkup(source));
	}

	for (const [file, refs] of refsByFile) {
		const source = sourceByFile.get(file);
		const baseUrl = new URL(routeFor(file, publicRoot), siteOrigin);
		for (const ref of refs) {
			const label = `${publicPath(file, publicRoot)}:${lineNumberAt(source, ref.index)}`;
			const resolved = resolveReference(ref.value, baseUrl);
			if (resolved.type === "ignored") continue;
			if (resolved.type === "external") {
				externalCount++;
				continue;
			}
			if (resolved.type === "invalid") {
				failures.push(`${label}: ${ref.kind} \`${ref.value}\`: ${resolved.reason}`);
				continue;
			}

			internalCount++;
			const target = targetForUrl(resolved.url, filesByPath, publicRoot);
			if (target.error) {
				failures.push(`${label}: ${ref.kind} \`${ref.value}\`: ${target.error}`);
				continue;
			}

			if (resolved.url.hash && resolved.url.hash !== "#") {
				const fragments = fragmentCandidates(resolved.url.hash);
				if (fragments.error) {
					failures.push(`${label}: ${ref.kind} \`${ref.value}\`: ${fragments.error}`);
					continue;
				}
				const targetIds = idsByFile.get(target.file);
				if (
					!targetIds ||
					![...fragments.candidates].some((fragment) => targetIds.has(fragment))
				) {
					failures.push(
						`${label}: ${ref.kind} \`${ref.value}\`: missing fragment ${resolved.url.hash} in ${routeFor(target.file, publicRoot)}`,
					);
				}
			}
		}
	}

	if (failures.length) {
		throw new Error(`invalid public references:\n${failures.sort().join("\n")}`);
	}
	return { files, filesByPath, refsByFile, internalCount, externalCount };
}

async function auditCssReferences() {
	const sourceFiles = [
		path.join(root, "index.html"),
		path.join(root, "404.html"),
		...(await walk(path.join(root, "docs"))).filter((file) => file.endsWith(".html")),
		...(await walk(path.join(root, "build"))).filter((file) => file.endsWith(".mjs")),
		...(await walk(path.join(root, "assets"))).filter((file) => file.endsWith(".js")),
	];
	const source = (
		await Promise.all(sourceFiles.map((file) => readFile(file, "utf8")))
	).join("\n");
	const usedClasses = new Set();
	for (const match of source.matchAll(/\bclass\s*=\s*["']([^"']*)["']/g)) {
		for (const className of match[1].split(/\s+/)) {
			if (className && !className.includes("$")) usedClasses.add(className);
		}
	}
	for (const match of source.matchAll(
		/classList\.(?:add|remove|toggle|contains)\(\s*["']([^"']+)["']/g,
	)) {
		usedClasses.add(match[1]);
	}
	const failures = [];

	for (const filename of ["wyst.css", "docs.css"]) {
		const css = (await readFile(path.join(root, "assets", filename), "utf8"))
			.replace(/\/\*[\s\S]*?\*\//g, "");
		const classes = new Set();
		for (const rule of css.matchAll(/([^{}]+)\{/g)) {
			const selector = rule[1].trim();
			if (selector.startsWith("@")) continue;
			for (const match of selector.matchAll(/\.([_a-zA-Z][\w-]*)/g)) {
				classes.add(match[1]);
			}
		}
		const unused = [...classes].filter((className) => !usedClasses.has(className));
		if (unused.length) failures.push(`${filename}: ${unused.sort().join(", ")}`);
	}

	if (failures.length) {
		throw new Error(`unreferenced CSS classes:\n${failures.join("\n")}`);
	}
}

async function auditRouteReachability(publicRoot, publicAudit) {
	const htmlFiles = publicAudit.files.filter(
		(file) => file.endsWith(".html") && path.basename(file) !== "404.html",
	);
	const htmlSet = new Set(htmlFiles);
	const start = publicAudit.filesByPath.get("/index.html");
	if (!start) throw new Error("public artifact is missing /index.html");
	const seen = new Set([start]);
	const queue = [start];

	while (queue.length) {
		const file = queue.shift();
		const baseUrl = new URL(routeFor(file, publicRoot), siteOrigin);
		for (const ref of publicAudit.refsByFile.get(file) ?? []) {
			if (ref.kind !== "href") continue;
			const resolved = resolveReference(ref.value, baseUrl);
			if (resolved.type !== "internal") continue;
			const target = targetForUrl(resolved.url, publicAudit.filesByPath, publicRoot);
			if (!target.file || !htmlSet.has(target.file) || seen.has(target.file)) continue;
			seen.add(target.file);
			queue.push(target.file);
		}
	}

	const unreachable = htmlFiles
		.filter((file) => !seen.has(file))
		.map((file) => routeFor(file, publicRoot));
	if (unreachable.length) {
		throw new Error(`unreachable public routes: ${unreachable.sort().join(", ")}`);
	}
	return htmlFiles.length;
}

async function auditSitemapCoverage(publicRoot, publicAudit) {
	const sitemapFile = publicAudit.filesByPath.get("/sitemap.xml");
	if (!sitemapFile) throw new Error("public artifact is missing /sitemap.xml");
	const source = await readFile(sitemapFile, "utf8");
	const listed = new Set(
		sitemapReferences(source)
			.map((ref) => resolveReference(ref.value, siteOrigin))
			.filter((resolved) => resolved.type === "internal")
			.map((resolved) => resolved.url.pathname),
	);
	const expected = new Set(
		publicAudit.files
			.filter(
				(file) =>
					file.endsWith(".html") && path.basename(file) !== "404.html",
			)
			.map((file) => routeFor(file, publicRoot)),
	);
	const missing = [...expected].filter((route) => !listed.has(route));
	const extra = [...listed].filter((route) => !expected.has(route));
	if (missing.length || extra.length) {
		throw new Error(
			[
				missing.length ? `sitemap missing routes: ${missing.sort().join(", ")}` : "",
				extra.length ? `sitemap has non-route entries: ${extra.sort().join(", ")}` : "",
			]
				.filter(Boolean)
				.join("\n"),
		);
	}
	return listed.size;
}

const { publicRoot } = parseArgs(process.argv.slice(2));
if (publicRoot === defaultPublicRoot) await auditCssReferences();
const publicAudit = await auditPublicReferences(publicRoot);
const routeCount = await auditRouteReachability(publicRoot, publicAudit);
const sitemapCount = await auditSitemapCoverage(publicRoot, publicAudit);
console.log(
	`site audit passed: ${routeCount} routes reachable and ${sitemapCount} sitemap entries complete; ${publicAudit.internalCount} local references and fragments valid; ${publicAudit.externalCount} external references skipped`,
);
