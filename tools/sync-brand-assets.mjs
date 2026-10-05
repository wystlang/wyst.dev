import {
	copyFile,
	mkdir,
	mkdtemp,
	readFile,
	rename,
	rm,
	stat,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetsDir = path.join(root, "assets");

const candidates = [
	process.env.WYST_BRAND_DIR,
	path.resolve(root, "..", "brand"),
].filter(Boolean);

async function isBrandRoot(dir) {
	try {
		const info = await stat(path.join(dir, "README.md"));
		const webIcons = await stat(path.join(dir, "web-icons"));
		return info.isFile() && webIcons.isDirectory();
	} catch {
		return false;
	}
}

async function resolveBrandRoot() {
	for (const candidate of candidates) {
		const dir = path.resolve(candidate);
		if (await isBrandRoot(dir)) {
			return dir;
		}
	}

	throw new Error(
		`Could not find wystlang/brand. Set WYST_BRAND_DIR or clone it next to this repo as ../brand`,
	);
}

// These implementation assets belong to the site rather than the brand repository.
// Carry them through the atomic directory replacement so a brand refresh cannot
// silently remove site behavior.
const siteOwnedFiles = ["docs.js", "home.js", "docs.css", "wyst.css"];

const brandRoot = await resolveBrandRoot();
const manifest = JSON.parse(
	await readFile(path.join(brandRoot, "assets-manifest.json"), "utf8"),
);
if (manifest.schema !== 1 || !Array.isArray(manifest.websiteExports)) {
	throw new Error("Brand assets manifest must use schema 1 with websiteExports");
}

function safeRelative(value, label) {
	if (
		typeof value !== "string" ||
		!value ||
		path.isAbsolute(value) ||
		value.includes("\\") ||
		value.split("/").includes("..") ||
		path.posix.normalize(value) !== value
	) {
		throw new Error(`${label} must be a normalized relative path: ${value}`);
	}
	return value;
}

const destinations = new Set();
const files = [];
for (const asset of manifest.websiteExports) {
	const from = safeRelative(asset.source, "Brand export source");
	const to = safeRelative(asset.destination, "Brand export destination");
	if (destinations.has(to) || siteOwnedFiles.includes(to)) {
		throw new Error(`Duplicate or site-owned brand export destination: ${to}`);
	}
	destinations.add(to);
	const sourceBytes = await readFile(path.join(brandRoot, from));
	const actualHash = createHash("sha256").update(sourceBytes).digest("hex");
	if (!/^[0-9a-f]{64}$/.test(asset.sha256) || actualHash !== asset.sha256) {
		throw new Error(`Brand export hash mismatch: ${from}`);
	}
	files.push([from, to]);
}

const stagingDir = await mkdtemp(path.join(root, ".assets-sync-"));

try {
	for (const file of siteOwnedFiles) {
		await copyFile(path.join(assetsDir, file), path.join(stagingDir, file));
	}
	for (const [from, to] of files) {
		const destination = path.join(stagingDir, to);
		await mkdir(path.dirname(destination), { recursive: true });
		await copyFile(path.join(brandRoot, from), destination);
	}
	await rm(assetsDir, { recursive: true, force: true });
	await rename(stagingDir, assetsDir);
} catch (error) {
	await rm(stagingDir, { recursive: true, force: true });
	throw error;
}

console.log(`Synced ${files.length} brand assets from ${brandRoot}`);
