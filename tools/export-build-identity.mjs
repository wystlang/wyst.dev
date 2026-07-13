import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveOutputDir } from "./build-manifest.mjs";
import { verifyBuildIdentity } from "./verify-build.mjs";

export function auditEnvironmentFor(identity) {
	return {
		WYST_EXPECTED_COMMIT: identity.manifest.siteCommit,
		WYST_EXPECTED_TREE_SHA256: identity.treeSha256,
		WYST_EXPECTED_RELEASE_SHA256: identity.releaseSha256,
		WYST_EXPECTED_MANIFEST_SHA256: identity.manifestSha256,
	};
}

function parseArgs(argv) {
	let outputDir = resolveOutputDir();
	let githubEnv = false;
	for (let index = 0; index < argv.length; index++) {
		if (argv[index] === "--output-dir" && argv[index + 1]) {
			outputDir = path.resolve(argv[++index]);
			continue;
		}
		if (argv[index] === "--github-env") {
			githubEnv = true;
			continue;
		}
		throw new Error(`unknown argument: ${argv[index]}`);
	}
	return { githubEnv, outputDir };
}

if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	const { githubEnv, outputDir } = parseArgs(process.argv.slice(2));
	const identity = await verifyBuildIdentity({ outputDir, quiet: githubEnv });
	const auditEnvironment = auditEnvironmentFor(identity);
	if (githubEnv) {
		for (const [name, value] of Object.entries(auditEnvironment)) {
			console.log(`${name}=${value}`);
		}
	} else {
		console.log(JSON.stringify(auditEnvironment, null, 2));
	}
}
