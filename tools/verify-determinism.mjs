import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepareWorkerAssets } from "./prepare-worker-assets.mjs";
import { verifyBuild } from "./verify-build.mjs";

async function walk(dir, relativeDir = "") {
	const current = relativeDir ? path.join(dir, relativeDir) : dir;
	const entries = await readdir(current, { withFileTypes: true });
	entries.sort((a, b) => a.name.localeCompare(b.name));
	const files = [];
	for (const entry of entries) {
		const relative = relativeDir
			? path.join(relativeDir, entry.name)
			: entry.name;
		if (entry.isDirectory()) files.push(...(await walk(dir, relative)));
		else if (entry.isFile()) files.push(relative);
		else throw new Error(`build output contains unsupported entry: ${relative}`);
	}
	return files;
}

async function snapshot(dir) {
	const result = {};
	for (const relative of await walk(dir)) {
		const contents = await readFile(path.join(dir, relative));
		const key = relative.split(path.sep).join("/");
		result[key] = {
			sha256: createHash("sha256").update(contents).digest("hex"),
			size: contents.byteLength,
		};
	}
	return result;
}

function differencesBetween(first, second) {
	const differences = [];
	for (const file of new Set([...Object.keys(first), ...Object.keys(second)])) {
		if (!Object.hasOwn(first, file)) differences.push(`${file}: only in build 2`);
		else if (!Object.hasOwn(second, file)) {
			differences.push(`${file}: only in build 1`);
		} else if (
			first[file].sha256 !== second[file].sha256 ||
			first[file].size !== second[file].size
		) {
			differences.push(`${file}: bytes differ`);
		}
		if (differences.length === 20) break;
	}
	return differences;
}

export async function verifyDeterminism() {
	const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "wyst-site-build-"));
	const firstDir = path.join(temporaryRoot, "first");
	const secondDir = path.join(temporaryRoot, "second");
	try {
		await prepareWorkerAssets({ outputDir: firstDir });
		await verifyBuild({ outputDir: firstDir });
		await prepareWorkerAssets({ outputDir: secondDir });
		await verifyBuild({ outputDir: secondDir });

		const first = await snapshot(firstDir);
		const second = await snapshot(secondDir);
		const differences = differencesBetween(first, second);
		if (differences.length) {
			throw new Error(
				`clean builds are not byte-identical:\n${differences.join("\n")}`,
			);
		}
		console.log(`verified deterministic output (${Object.keys(first).length} files)`);
		return first;
	} finally {
		await rm(temporaryRoot, { recursive: true, force: true });
	}
}

if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	await verifyDeterminism();
}
