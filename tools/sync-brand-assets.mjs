import {
	copyFile,
	mkdir,
	mkdtemp,
	rename,
	rm,
	stat,
} from "node:fs/promises";
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

const files = [
	["brand/wordmark-accent.svg", "wordmark-accent.svg"],
	["web-icons/apple-touch-icon.png", "apple-touch-icon.png"],
	["web-icons/favicon-48.png", "favicon-48.png"],
	["web-icons/favicon.svg", "favicon.svg"],
	["marketing/social-card.png", "social-card.png"],
	["typography/commit-mono-v143.woff2", "commit-mono-v143.woff2"],
	["typography/CommitMono-OFL.txt", "licenses/CommitMono-OFL.txt"],
	["design-system/wyst.dev/wyst.css", "wyst.css"],
	["design-system/wyst.dev/docs.css", "docs.css"],
];

// These runtime assets belong to the site rather than the brand repository.
// Carry them through the atomic directory replacement so a brand refresh cannot
// silently remove site behavior.
const siteOwnedFiles = ["docs.js"];

const brandRoot = await resolveBrandRoot();
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
