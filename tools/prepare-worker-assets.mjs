import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, ".worker-assets");

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const entries = ["index.html", "assets", "docs", "roadmap"];

for (const entry of entries) {
	await cp(path.join(root, entry), path.join(outDir, entry), {
		recursive: true,
		force: true,
	});
}

console.log(`Prepared ${entries.join(", ")} in ${path.relative(root, outDir)}`);
