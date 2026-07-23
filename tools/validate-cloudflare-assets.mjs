import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Cloudflare Workers Free limits, retrieved from the platform limits page on
// 2026-07-13. The total-size and path rules below are deliberately stricter
// project policies so an accidental binary dump cannot become a release.
export const DEFAULT_LIMITS = Object.freeze({
	maxFiles: 20_000,
	maxFileSize: 25 * 1024 * 1024,
	maxTotalSize: 25 * 1024 * 1024,
	maxHeaderRules: 100,
	maxHeaderLineCharacters: 2_000,
});

const REQUIRED_FILES = [
	".well-known/build.json",
	"404.html",
	"_headers",
	"index.html",
	"robots.txt",
	"sitemap.xml",
];

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

function formatBytes(bytes) {
	return `${bytes.toLocaleString("en-US")} bytes`;
}

function validateSegment(segment, relativePath) {
	assert(
		segment === ".well-known" || /^[A-Za-z0-9_][A-Za-z0-9._-]*$/.test(segment),
		`unsafe or URL-ambiguous asset path: ${relativePath}`,
	);
	assert(
		!segment.startsWith(".") || segment === ".well-known",
		`unexpected hidden asset path: ${relativePath}`,
	);
	assert(
		segment.normalize("NFC") === segment,
		`asset path is not Unicode-normalized: ${relativePath}`,
	);
}

async function walkAssets(directory, publicRoot, files) {
	const entries = await readdir(directory, { withFileTypes: true });
	entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
	for (const entry of entries) {
		const fullPath = path.join(directory, entry.name);
		const relativePath = path.relative(publicRoot, fullPath).split(path.sep).join("/");
		for (const segment of relativePath.split("/")) {
			validateSegment(segment, relativePath);
		}
		const metadata = await lstat(fullPath);
		assert(!metadata.isSymbolicLink(), `symbolic links are not deployable: ${relativePath}`);
		if (metadata.isDirectory()) {
			await walkAssets(fullPath, publicRoot, files);
		} else {
			assert(metadata.isFile(), `non-regular asset is not deployable: ${relativePath}`);
			files.push({ fullPath, relativePath, size: metadata.size });
		}
	}
}

function decodeHtml(value) {
	return value.replace(
		/&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi,
		(entity) => {
			const named = new Map([
				["&amp;", "&"],
				["&quot;", '"'],
				["&apos;", "'"],
				["&lt;", "<"],
				["&gt;", ">"],
			]);
			const lower = entity.toLowerCase();
			if (named.has(lower)) return named.get(lower);
			const hex = lower.startsWith("&#x");
			const codePoint = Number.parseInt(
				entity.slice(hex ? 3 : 2, -1),
				hex ? 16 : 10,
			);
			return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
		},
	);
}

function attributesFromTag(tag) {
	const attributes = new Map();
	for (const match of tag.matchAll(
		/\s([:\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g,
	)) {
		attributes.set(
			match[1].toLowerCase(),
			decodeHtml(match[2] ?? match[3] ?? match[4] ?? ""),
		);
	}
	return attributes;
}

export function validateHtml(source, relativePath) {
	assert(/^\s*<!doctype html>/i.test(source), `${relativePath} is missing an HTML doctype`);
	const ids = new Set();
	const duplicateIds = new Set();
	let htmlElements = 0;
	let htmlHasLanguage = false;
	let mainElements = 0;
	let h1Elements = 0;
	const imagesWithoutAlt = [];
	for (const match of source.matchAll(/<([a-z][\w:-]*)\b[^>]*>/gi)) {
		const name = match[1].toLowerCase();
		const attributes = attributesFromTag(match[0]);
		if (attributes.has("id")) {
			const id = attributes.get("id");
			assert(id.length > 0, `${relativePath} contains an empty id attribute`);
			if (ids.has(id)) duplicateIds.add(id);
			ids.add(id);
		}
		if (name === "html") {
			htmlElements++;
			htmlHasLanguage ||= Boolean(attributes.get("lang")?.trim());
		}
		if (name === "main") mainElements++;
		if (name === "h1") h1Elements++;
		if (name === "img" && !attributes.has("alt")) {
			imagesWithoutAlt.push(match.index);
		}
	}
	assert(
		duplicateIds.size === 0,
		`${relativePath} contains duplicate IDs: ${[...duplicateIds].sort().join(", ")}`,
	);
	assert(htmlElements === 1, `${relativePath} must contain exactly one html element`);
	assert(htmlHasLanguage, `${relativePath} html element requires a lang attribute`);
	assert(mainElements === 1, `${relativePath} must contain exactly one main element`);
	assert(h1Elements === 1, `${relativePath} must contain exactly one h1 element`);
	assert(
		imagesWithoutAlt.length === 0,
		`${relativePath} contains image elements without alt attributes`,
	);
	const titles = [...source.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/gi)];
	assert(titles.length === 1, `${relativePath} must contain exactly one title element`);
	const titleSource = titles[0][1];
	assert(
		!titleSource.includes("<"),
		`${relativePath} title must not contain raw markup`,
	);
	assert(
		decodeHtml(titleSource).trim().length > 0,
		`${relativePath} title must not be empty`,
	);
}

function validateHeaderTarget(target, lineNumber) {
	assert(!/[\x00-\x20\\]/.test(target), `_headers:${lineNumber} has an unsafe target`);
	assert((target.match(/\*/g) ?? []).length <= 1, `_headers:${lineNumber} has more than one splat`);
	if (target.startsWith("https://")) {
		const parsed = new URL(target);
		assert(!parsed.port, `_headers:${lineNumber} absolute target must not specify a port`);
		assert(!parsed.search && !parsed.hash, `_headers:${lineNumber} target must not contain query or fragment data`);
		return;
	}
	assert(target.startsWith("/") && !target.startsWith("//"), `_headers:${lineNumber} target must start with / or https://`);
	assert(!target.split("/").includes(".."), `_headers:${lineNumber} target must not traverse directories`);
}

export function validateHeaders(source, limits = DEFAULT_LIMITS) {
	assert(!source.includes("\0"), "_headers contains a NUL byte");
	assert(!source.includes("\r"), "_headers must use LF line endings");
	const lines = source.split("\n");
	let rules = 0;
	let currentRuleHasHeaders = false;
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index];
		const lineNumber = index + 1;
		assert(
			[...line].length <= limits.maxHeaderLineCharacters,
			`_headers:${lineNumber} exceeds ${limits.maxHeaderLineCharacters} characters`,
		);
		if (!line.trim() || line.trimStart().startsWith("#")) continue;
		if (!/^\s/.test(line)) {
			assert(
				rules === 0 || currentRuleHasHeaders,
				`_headers:${lineNumber} starts a rule before the previous rule defines a header`,
			);
			validateHeaderTarget(line, lineNumber);
			rules++;
			currentRuleHasHeaders = false;
			continue;
		}
		assert(rules > 0, `_headers:${lineNumber} defines a header before any target`);
		const header = line.trim();
		const detach = /^!\s+([!#$%&'*+.^_`|~0-9A-Za-z-]+)$/.test(header);
		const attach = /^([!#$%&'*+.^_`|~0-9A-Za-z-]+):[\t ]*[^\x00-\x08\x0a-\x1f\x7f]*$/.test(header);
		assert(detach || attach, `_headers:${lineNumber} has invalid header syntax`);
		currentRuleHasHeaders = true;
	}
	assert(rules > 0, "_headers contains no header rules");
	assert(currentRuleHasHeaders, "the final _headers rule defines no headers");
	assert(
		rules <= limits.maxHeaderRules,
		`_headers contains ${rules} rules; Cloudflare allows ${limits.maxHeaderRules}`,
	);
	return rules;
}

export async function validateAssetInventory(publicRoot, limits = DEFAULT_LIMITS) {
	const rootMetadata = await lstat(publicRoot);
	assert(rootMetadata.isDirectory(), `asset root is not a directory: ${publicRoot}`);
	assert(!rootMetadata.isSymbolicLink(), `asset root must not be a symbolic link: ${publicRoot}`);
	const files = [];
	await walkAssets(publicRoot, publicRoot, files);
	assert(files.length > 0, "asset root is empty");
	assert(
		files.length <= limits.maxFiles,
		`artifact contains ${files.length} files; Cloudflare Free allows ${limits.maxFiles}`,
	);
	const paths = new Set(files.map((file) => file.relativePath));
	for (const required of REQUIRED_FILES) {
		assert(paths.has(required), `artifact is missing required file: ${required}`);
	}
	assert(!paths.has("_redirects"), "redirect policy must remain zone-owned; _redirects is not allowed");
	const caseFolded = new Map();
	let totalSize = 0;
	for (const file of files) {
		assert(
			file.size <= limits.maxFileSize,
			`${file.relativePath} is ${formatBytes(file.size)}; Cloudflare allows ${formatBytes(limits.maxFileSize)} per file`,
		);
		totalSize += file.size;
		const folded = file.relativePath.toLowerCase();
		assert(
			!caseFolded.has(folded),
			`case-insensitive asset path collision: ${caseFolded.get(folded)} and ${file.relativePath}`,
		);
		caseFolded.set(folded, file.relativePath);
		if (file.relativePath.endsWith(".html")) {
			validateHtml(await readFile(file.fullPath, "utf8"), file.relativePath);
		}
	}
	assert(
		totalSize <= limits.maxTotalSize,
		`artifact totals ${formatBytes(totalSize)}; project release budget is ${formatBytes(limits.maxTotalSize)}`,
	);
	const headerFile = files.find((file) => file.relativePath === "_headers");
	const headerBytes = await readFile(headerFile.fullPath);
	let headers;
	try {
		headers = new TextDecoder("utf-8", { fatal: true }).decode(headerBytes);
	} catch {
		throw new Error("_headers must be valid UTF-8");
	}
	const headerRules = validateHeaders(headers, limits);
	return { files, totalSize, headerRules };
}

function parseArgs(argv) {
	let publicRoot = path.join(root, "dist");
	for (let index = 0; index < argv.length; index++) {
		if (argv[index] === "--root" && argv[index + 1]) {
			publicRoot = path.resolve(argv[++index]);
		} else {
			throw new Error(`unknown argument: ${argv[index]}`);
		}
	}
	return { publicRoot };
}

export async function validateCloudflareAssets({ publicRoot }) {
	return validateAssetInventory(publicRoot);
}

const invokedAsScript =
	process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) {
	const result = await validateCloudflareAssets(parseArgs(process.argv.slice(2)));
	console.log(
		`Cloudflare asset validation passed: ${result.files.length} files, ${formatBytes(result.totalSize)}, ${result.headerRules} header rules`,
	);
}
