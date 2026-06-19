import { copyFile, mkdir, stat } from "node:fs/promises";
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
	["web-icons/apple-touch-icon.png", "apple-touch-icon.png"],
	["web-icons/favicon-48.png", "favicon-48.png"],
	["web-icons/favicon.svg", "favicon.svg"],
	["marketing/social-card.png", "social-card.png"],
	["typography/jetbrains-mono-700-latin.woff2", "jetbrains-mono-700-latin.woff2"],
	["design-system/wyst.dev/wyst.css", "wyst.css"],
	["design-system/wyst.dev/docs.css", "docs.css"],

	["artwork/winston/mark/winston-mark-40.avif", "winston-mark-40.avif"],
	["artwork/winston/mark/winston-mark-40.png", "winston-mark-40.png"],
	["artwork/winston/mark/winston-mark-40.webp", "winston-mark-40.webp"],
	["artwork/winston/mark/winston-mark-80.avif", "winston-mark-80.avif"],
	["artwork/winston/mark/winston-mark-80.png", "winston-mark-80.png"],
	["artwork/winston/mark/winston-mark-80.webp", "winston-mark-80.webp"],
	["artwork/winston/mark/winston-mark-120.avif", "winston-mark-120.avif"],
	["artwork/winston/mark/winston-mark-120.png", "winston-mark-120.png"],
	["artwork/winston/mark/winston-mark-120.webp", "winston-mark-120.webp"],

	["artwork/winston/wave/winston-wave-280.avif", "winston-wave-280.avif"],
	["artwork/winston/wave/winston-wave-280.png", "winston-wave-280.png"],
	["artwork/winston/wave/winston-wave-280.webp", "winston-wave-280.webp"],
	["artwork/winston/wave/winston-wave-560.avif", "winston-wave-560.avif"],
	["artwork/winston/wave/winston-wave-560.png", "winston-wave-560.png"],
	["artwork/winston/wave/winston-wave-560.webp", "winston-wave-560.webp"],
	["artwork/winston/wave/winston-wave-840.avif", "winston-wave-840.avif"],
	["artwork/winston/wave/winston-wave-840.png", "winston-wave-840.png"],
	["artwork/winston/wave/winston-wave-840.webp", "winston-wave-840.webp"],

	["artwork/winston/shrug/winston-shrug-240.avif", "winston-shrug-240.avif"],
	["artwork/winston/shrug/winston-shrug-240.png", "winston-shrug-240.png"],
	["artwork/winston/shrug/winston-shrug-240.webp", "winston-shrug-240.webp"],
	["artwork/winston/shrug/winston-shrug-480.avif", "winston-shrug-480.avif"],
	["artwork/winston/shrug/winston-shrug-480.png", "winston-shrug-480.png"],
	["artwork/winston/shrug/winston-shrug-480.webp", "winston-shrug-480.webp"],
	["artwork/winston/shrug/winston-shrug-720.avif", "winston-shrug-720.avif"],
	["artwork/winston/shrug/winston-shrug-720.png", "winston-shrug-720.png"],
	["artwork/winston/shrug/winston-shrug-720.webp", "winston-shrug-720.webp"],

	["artwork/winston/confused/winston-confused-240.avif", "winston-confused-240.avif"],
	["artwork/winston/confused/winston-confused-240.png", "winston-confused-240.png"],
	["artwork/winston/confused/winston-confused-240.webp", "winston-confused-240.webp"],
	["artwork/winston/confused/winston-confused-480.avif", "winston-confused-480.avif"],
	["artwork/winston/confused/winston-confused-480.png", "winston-confused-480.png"],
	["artwork/winston/confused/winston-confused-480.webp", "winston-confused-480.webp"],
	["artwork/winston/confused/winston-confused-720.avif", "winston-confused-720.avif"],
	["artwork/winston/confused/winston-confused-720.png", "winston-confused-720.png"],
	["artwork/winston/confused/winston-confused-720.webp", "winston-confused-720.webp"],
];

const brandRoot = await resolveBrandRoot();
await mkdir(assetsDir, { recursive: true });

for (const [from, to] of files) {
	await copyFile(path.join(brandRoot, from), path.join(assetsDir, to));
}

console.log(`Synced ${files.length} brand assets from ${brandRoot}`);
