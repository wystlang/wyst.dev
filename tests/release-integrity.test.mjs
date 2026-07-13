import assert from "node:assert/strict";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
	currentProductionVersionFrom,
	isWorkerNotFoundOutput,
} from "../.github/scripts/release-state.mjs";
import { newestSuccessfulProductionDeployment } from "../.github/scripts/production-deployment.mjs";
import { verifyBuildIdentity } from "../tools/verify-build.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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
