import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	collectBuildFiles,
	collectReleaseFiles,
	compareText,
	expectedReleaseFilePaths,
	releaseSha256For,
	resolveOutputDir,
	resolveSiteCommit,
	treeSha256ForFiles,
} from "./build-manifest.mjs";
import { verifyWystSnapshot } from "./wyst-snapshot.mjs";

function commitIsValid(value) {
	return /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(value);
}

function metadataIsValid(entry) {
	return (
		entry &&
		typeof entry === "object" &&
		!Array.isArray(entry) &&
		Object.keys(entry).sort(compareText).join(",") === "sha256,size" &&
		Number.isSafeInteger(entry.size) &&
		entry.size >= 0 &&
		/^[0-9a-f]{64}$/.test(entry.sha256)
	);
}

function assertManifestShape(manifest) {
	if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
		throw new Error("build manifest must be a JSON object");
	}
	if (manifest.schema !== 2) {
		throw new Error(`unsupported build manifest schema: ${manifest.schema}`);
	}
	if (!commitIsValid(manifest.siteCommit)) {
		throw new Error("build manifest siteCommit is not a full Git object ID");
	}
	if (!commitIsValid(manifest.wystSourceCommit)) {
		throw new Error(
			"build manifest wystSourceCommit is not a full Git object ID",
		);
	}
	if (!/^[0-9a-f]{64}$/.test(manifest.wystSnapshotSha256)) {
		throw new Error("build manifest wystSnapshotSha256 is not a SHA-256 digest");
	}
	if (!/^[0-9a-f]{64}$/.test(manifest.treeSha256)) {
		throw new Error("build manifest treeSha256 is not a SHA-256 digest");
	}
	if (!/^[0-9a-f]{64}$/.test(manifest.releaseSha256)) {
		throw new Error("build manifest releaseSha256 is not a SHA-256 digest");
	}
	if (
		!manifest.releaseFiles ||
		typeof manifest.releaseFiles !== "object" ||
		Array.isArray(manifest.releaseFiles)
	) {
		throw new Error("build manifest releaseFiles must be a path-keyed object");
	}
	const releasePaths = Object.keys(manifest.releaseFiles);
	const expectedReleasePaths = expectedReleaseFilePaths();
	if (JSON.stringify(releasePaths) !== JSON.stringify(expectedReleasePaths)) {
		throw new Error(
			`build manifest releaseFiles must contain exactly ${expectedReleasePaths.join(", ")}`,
		);
	}
	for (const [relativePath, entry] of Object.entries(manifest.releaseFiles)) {
		if (!metadataIsValid(entry)) {
			throw new Error(`invalid release metadata in build manifest for ${relativePath}`);
		}
	}
	if (
		!manifest.files ||
		typeof manifest.files !== "object" ||
		Array.isArray(manifest.files)
	) {
		throw new Error("build manifest files must be a URL-keyed object");
	}

	const urls = Object.keys(manifest.files);
	const sortedUrls = [...urls].sort(compareText);
	if (urls.some((url, index) => url !== sortedUrls[index])) {
		throw new Error("build manifest file URLs are not sorted");
	}
	for (const [url, entry] of Object.entries(manifest.files)) {
		if (!url.startsWith("/") || url.includes("?") || url.includes("#")) {
			throw new Error(`invalid public URL in build manifest: ${url}`);
		}
		if (!metadataIsValid(entry)) {
			throw new Error(`invalid file metadata in build manifest for ${url}`);
		}
	}
}

function describeFileMismatch(expected, actual) {
	const differences = [];
	for (const url of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
		if (!Object.hasOwn(expected, url)) {
			differences.push(`${url}: absent from manifest`);
			continue;
		}
		if (!Object.hasOwn(actual, url)) {
			differences.push(`${url}: missing from output`);
			continue;
		}
		if (
			expected[url].sha256 !== actual[url].sha256 ||
			expected[url].size !== actual[url].size
		) {
			differences.push(`${url}: content or size differs from manifest`);
		}
		if (differences.length === 10) break;
	}
	return differences.join("\n");
}

export async function verifyBuildIdentity({
	outputDir = resolveOutputDir(),
	quiet = false,
} = {}) {
	const output = path.resolve(outputDir);
	const manifestPath = path.join(output, ".well-known", "build.json");
	const source = await readFile(manifestPath, "utf8");
	let manifest;
	try {
		manifest = JSON.parse(source);
	} catch (error) {
		throw new Error(`could not parse ${manifestPath}: ${error.message}`);
	}
	assertManifestShape(manifest);

	const expectedSiteCommit = resolveSiteCommit();
	if (manifest.siteCommit !== expectedSiteCommit) {
		throw new Error(
			`siteCommit mismatch: manifest has ${manifest.siteCommit}, expected ${expectedSiteCommit}`,
		);
	}
	const expectedSnapshot = await verifyWystSnapshot();
	const expectedWystCommit = expectedSnapshot.sourceCommit;
	if (manifest.wystSourceCommit !== expectedWystCommit) {
		throw new Error(
			`wystSourceCommit mismatch: manifest has ${manifest.wystSourceCommit}, expected ${expectedWystCommit}`,
		);
	}
	if (manifest.wystSnapshotSha256 !== expectedSnapshot.snapshotSha256) {
		throw new Error(
			`wystSnapshotSha256 mismatch: manifest has ${manifest.wystSnapshotSha256}, expected ${expectedSnapshot.snapshotSha256}`,
		);
	}

	const actualFiles = await collectBuildFiles(output);
	const fileMismatch = describeFileMismatch(manifest.files, actualFiles);
	if (fileMismatch) {
		throw new Error(`build output does not match its manifest:\n${fileMismatch}`);
	}
	const expectedTree = treeSha256ForFiles(actualFiles);
	if (manifest.treeSha256 !== expectedTree) {
		throw new Error(
			`treeSha256 mismatch: manifest has ${manifest.treeSha256}, expected ${expectedTree}`,
		);
	}

	const actualReleaseFiles = await collectReleaseFiles(output);
	const releaseMismatch = describeFileMismatch(
		manifest.releaseFiles,
		actualReleaseFiles,
	);
	if (releaseMismatch) {
		throw new Error(
			`release inputs do not match their manifest:\n${releaseMismatch}`,
		);
	}
	const expectedRelease = releaseSha256For({
		treeSha256: expectedTree,
		releaseFiles: actualReleaseFiles,
	});
	if (manifest.releaseSha256 !== expectedRelease) {
		throw new Error(
			`releaseSha256 mismatch: manifest has ${manifest.releaseSha256}, expected ${expectedRelease}`,
		);
	}

	const manifestSha256 = createHash("sha256").update(source).digest("hex");
	if (!quiet) {
		console.log(
			`verified ${Object.keys(actualFiles).length} public files (release ${manifest.releaseSha256})`,
		);
	}
	return {
		manifest,
		manifestSha256,
		releaseSha256: manifest.releaseSha256,
		treeSha256: manifest.treeSha256,
	};
}

export async function verifyBuild(options = {}) {
	return (await verifyBuildIdentity(options)).manifest;
}

function parseArgs(argv) {
	let outputDir = resolveOutputDir();
	for (let index = 0; index < argv.length; index++) {
		if (argv[index] === "--output-dir" && argv[index + 1]) {
			outputDir = path.resolve(argv[++index]);
			continue;
		}
		throw new Error(`unknown argument: ${argv[index]}`);
	}
	return { outputDir };
}

if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	await verifyBuild(parseArgs(process.argv.slice(2)));
}
