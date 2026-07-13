import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
	assertWorkerSubdomainsDisabled,
	currentProductionVersionFrom,
	isWorkerNotFoundOutput,
	ordinaryOriginContentAuditEnvironment,
} from "../.github/scripts/release-state.mjs";
import { newestSuccessfulProductionDeployment } from "../.github/scripts/production-deployment.mjs";
import { verifyBuildIdentity } from "../tools/verify-build.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const liveAuditScript = path.join(root, "tools", "audit-live-site.mjs");

async function mockedLiveAudit(t, environment) {
	const temporaryRoot = await mkdtemp(path.join(tmpdir(), "wyst-live-audit-test-"));
	t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
	const preload = path.join(temporaryRoot, "mock-fetch.mjs");
	await writeFile(
		preload,
		`import { readFileSync } from "node:fs";
const manifest = readFileSync(process.env.WYST_TEST_MANIFEST);
globalThis.fetch = async (input) => {
	const url = new URL(input);
	process.stderr.write(\`WYST_TEST_FETCH \${url.pathname}\\n\`);
	if (url.pathname === "/.well-known/build.json") {
		return new Response(manifest, {
			headers: { "content-type": "application/json" },
			status: 200,
		});
	}
	return new Response("corrupt", { status: 503 });
};
`,
	);
	const child = spawn(process.execPath, [liveAuditScript], {
		env: {
			...process.env,
			NODE_OPTIONS: `--import=${pathToFileURL(preload).href}`,
			WYST_CONTENT_ONLY: "1",
			WYST_LIVE_ORIGIN: "https://audit.test",
			WYST_TEST_MANIFEST: path.join(root, "dist", ".well-known", "build.json"),
			...environment,
		},
	});
	let stdout = "";
	let stderr = "";
	child.stdout.setEncoding("utf8");
	child.stderr.setEncoding("utf8");
	child.stdout.on("data", (chunk) => {
		stdout += chunk;
	});
	child.stderr.on("data", (chunk) => {
		stderr += chunk;
	});
	const [status] = await once(child, "close");
	return { status, stderr, stdout };
}

function differentHex(value) {
	return `${value.startsWith("0") ? "1" : "0"}${value.slice(1)}`;
}

function deployment(id, createdOn, versionId, percentage = 100) {
	return {
		id,
		created_on: createdOn,
		versions: [{ percentage, version_id: versionId }],
	};
}

test("release selects the newest deployment by created_on, not API order", () => {
	const deployments = [
		deployment("new", "2026-07-13T12:00:00Z", "version-new"),
		deployment("old", "2026-07-11T12:00:00Z", "version-old"),
		deployment("middle", "2026-07-12T12:00:00Z", "version-middle"),
	];
	assert.equal(currentProductionVersionFrom(deployments), "version-new");
});

test("release exposes an explicit first-deployment state", () => {
	assert.equal(currentProductionVersionFrom([]), null);
	assert.equal(
		isWorkerNotFoundOutput("This Worker does not exist. [code: 10007]"),
		true,
	);
	assert.equal(isWorkerNotFoundOutput("authentication failed"), false);
});

test("release requires both workers.dev and version previews to be disabled", () => {
	assert.doesNotThrow(() =>
		assertWorkerSubdomainsDisabled({ enabled: false, previews_enabled: false }),
	);
	assert.throws(
		() =>
			assertWorkerSubdomainsDisabled({ enabled: true, previews_enabled: false }),
		/workers\.dev and version preview URLs must both be disabled/,
	);
	assert.throws(
		() =>
			assertWorkerSubdomainsDisabled({ enabled: false, previews_enabled: true }),
		/workers\.dev and version preview URLs must both be disabled/,
	);
	assert.throws(
		() => assertWorkerSubdomainsDisabled(null),
		/settings are malformed/,
	);
});

test("ordinary-origin verification allows bounded deployment convergence", () => {
	const identity = {
		WYST_EXPECTED_COMMIT: "a".repeat(40),
		WYST_EXPECTED_MANIFEST_SHA256: "b".repeat(64),
		WYST_EXPECTED_RELEASE_SHA256: "c".repeat(64),
		WYST_EXPECTED_TREE_SHA256: "d".repeat(64),
	};
	const environment = ordinaryOriginContentAuditEnvironment(identity);
	assert.deepEqual(environment, {
		...identity,
		WYST_AUDIT_ATTEMPTS: "46",
		WYST_AUDIT_RETRY_MS: "2000",
		WYST_CONTENT_ONLY: "1",
	});
	const retryDelayWindow =
		(Number(environment.WYST_AUDIT_ATTEMPTS) - 1) *
		Number(environment.WYST_AUDIT_RETRY_MS);
	assert.equal(retryDelayWindow, 90_000);
	assert.throws(
		() => ordinaryOriginContentAuditEnvironment(null),
		/expected build identity/,
	);
});

test("ordinary-origin retries only until the exact promoted identity is visible", async (t) => {
	const manifestBytes = await readFile(
		path.join(root, "dist", ".well-known", "build.json"),
	);
	const manifest = JSON.parse(manifestBytes);
	const manifestSha256 = createHash("sha256").update(manifestBytes).digest("hex");
	const exactIdentity = {
		WYST_EXPECTED_COMMIT: manifest.siteCommit,
		WYST_EXPECTED_MANIFEST_SHA256: manifestSha256,
		WYST_EXPECTED_RELEASE_SHA256: manifest.releaseSha256,
		WYST_EXPECTED_TREE_SHA256: manifest.treeSha256,
	};

	const stale = await mockedLiveAudit(t, {
		WYST_AUDIT_ATTEMPTS: "3",
		WYST_AUDIT_RETRY_MS: "1",
		WYST_EXPECTED_COMMIT: differentHex(exactIdentity.WYST_EXPECTED_COMMIT),
		WYST_EXPECTED_MANIFEST_SHA256: differentHex(
			exactIdentity.WYST_EXPECTED_MANIFEST_SHA256,
		),
		WYST_EXPECTED_RELEASE_SHA256: differentHex(
			exactIdentity.WYST_EXPECTED_RELEASE_SHA256,
		),
		WYST_EXPECTED_TREE_SHA256: differentHex(
			exactIdentity.WYST_EXPECTED_TREE_SHA256,
		),
	});
	assert.notEqual(stale.status, 0);
	assert.match(stale.stderr, /live-site audit failed after 3 attempt\(s\)/);
	assert.deepEqual(
		stale.stderr.match(/WYST_TEST_FETCH \S+/g),
		Array(3).fill("WYST_TEST_FETCH /.well-known/build.json"),
	);

	const corruptManifest = await mockedLiveAudit(t, {
		...exactIdentity,
		WYST_AUDIT_ATTEMPTS: "46",
		WYST_AUDIT_RETRY_MS: "1",
		WYST_EXPECTED_MANIFEST_SHA256: differentHex(
			exactIdentity.WYST_EXPECTED_MANIFEST_SHA256,
		),
	});
	assert.notEqual(corruptManifest.status, 0);
	assert.match(
		corruptManifest.stderr,
		/live-site audit failed after 1 attempt\(s\)/,
	);
	assert.deepEqual(corruptManifest.stderr.match(/WYST_TEST_FETCH \S+/g), [
		"WYST_TEST_FETCH /.well-known/build.json",
	]);

	const corruptAsset = await mockedLiveAudit(t, {
		...exactIdentity,
		WYST_AUDIT_ATTEMPTS: "46",
		WYST_AUDIT_RETRY_MS: "1",
	});
	assert.notEqual(corruptAsset.status, 0);
	assert.match(
		corruptAsset.stderr,
		/live-site audit failed after 1 attempt\(s\)/,
	);
	assert.equal(
		corruptAsset.stderr.match(/WYST_TEST_FETCH \/\.well-known\/build\.json/g)
			?.length,
		1,
	);
	assert.match(
		corruptAsset.stderr,
		/WYST_TEST_FETCH \/(?!\.well-known\/build\.json)/,
	);
});

test("release rejects malformed deployment history and unsafe current splits", () => {
	assert.throws(
		() =>
			currentProductionVersionFrom([
				deployment("bad", "not-a-date", "version-bad"),
				deployment("good", "2026-07-13T12:00:00Z", "version-good"),
			]),
		/created_on/,
	);
	assert.throws(
		() =>
			currentProductionVersionFrom([
				deployment("old", "2026-07-12T12:00:00Z", "version-old"),
				deployment("new", "2026-07-13T12:00:00Z", "version-new", 50),
			]),
		/exactly one current production version at 100%/,
	);
});

test("monitor resolves the newest successful production deployment from main", async () => {
	const commits = {
		failed: "1".repeat(40),
		successful: "2".repeat(40),
		feature: "3".repeat(40),
	};
	const deployments = [
		{
			id: 103,
			created_at: "2026-07-13T15:00:00Z",
			environment: "production",
			ref: "feature",
			sha: commits.feature,
		},
		{
			id: 102,
			created_at: "2026-07-13T14:00:00Z",
			environment: "production",
			ref: "main",
			sha: commits.failed,
		},
		{
			id: 101,
			created_at: "2026-07-13T13:00:00Z",
			environment: "production",
			ref: "main",
			sha: commits.successful,
		},
	];
	const requested = [];
	const fetchImpl = async (url, options) => {
		requested.push(url.href);
		assert.equal(options.headers.Authorization, "Bearer test-token");
		let body;
		if (url.pathname.endsWith("/deployments")) body = deployments;
		else if (url.pathname.endsWith("/deployments/102/statuses")) {
			body = [
				{ state: "failure" },
				{ state: "success" },
			];
		} else if (url.pathname.endsWith("/deployments/101/statuses")) {
			body = [
				{ state: "inactive" },
				{ state: "success" },
			];
		} else {
			throw new Error(`unexpected GitHub API request: ${url}`);
		}
		return new Response(JSON.stringify(body), {
			headers: { "content-type": "application/json" },
			status: 200,
		});
	};

	const production = await newestSuccessfulProductionDeployment({
		apiUrl: "https://api.github.test/api/v3",
		fetchImpl,
		repository: "wystlang/wyst.dev",
		token: "test-token",
	});
	assert.deepEqual(production, {
		deploymentId: 101,
		sha: commits.successful,
	});
	assert.deepEqual(requested, [
		"https://api.github.test/api/v3/repos/wystlang/wyst.dev/deployments?environment=production&per_page=100",
		"https://api.github.test/api/v3/repos/wystlang/wyst.dev/deployments/102/statuses?per_page=100",
		"https://api.github.test/api/v3/repos/wystlang/wyst.dev/deployments/101/statuses?per_page=100",
	]);
});

test("build verification detects changes to non-public _headers", async (t) => {
	const temporaryRoot = await mkdtemp(path.join(tmpdir(), "wyst-release-test-"));
	t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
	const outputDir = path.join(temporaryRoot, "dist");
	await cp(path.join(root, "dist"), outputDir, { recursive: true });
	await writeFile(path.join(outputDir, "_headers"), "tampered\n");
	await assert.rejects(
		verifyBuildIdentity({ outputDir, quiet: true }),
		/release inputs do not match their manifest/,
	);
});
