import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditEnvironmentFor } from "../../tools/export-build-identity.mjs";
import { verifyBuildIdentity } from "../../tools/verify-build.mjs";
import {
	assertWorkerSubdomainsDisabled,
	currentProductionVersionFrom,
	isWorkerNotFoundOutput,
	newestDeploymentFrom,
} from "./release-state.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const wrangler = path.join(root, "node_modules", ".bin", "wrangler");
const commit = process.env.GITHUB_SHA;
// These caps keep even a late post-promotion failure inside the 30-minute job
// budget with several minutes left for rollback and control-plane confirmation.
const QUERY_TIMEOUT_MS = 10_000;
const MUTATION_TIMEOUT_MS = 90_000;
const POLICY_AUDIT_TIMEOUT_MS = 90_000;
const CONTENT_AUDIT_TIMEOUT_MS = 180_000;
const BROWSER_AUDIT_TIMEOUT_MS = 240_000;
const cloudflareAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const cloudflareApiToken = process.env.CLOUDFLARE_API_TOKEN;

if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(commit || "")) {
	throw new Error("GITHUB_SHA must contain the full release commit object ID");
}
if (!/^[0-9a-f]{32}$/.test(cloudflareAccountId || "")) {
	throw new Error("CLOUDFLARE_ACCOUNT_ID must contain a 32-character account ID");
}
if (!cloudflareApiToken) {
	throw new Error("CLOUDFLARE_API_TOKEN is required for production releases");
}

function run(
	command,
	args,
	{
		capture = false,
		env = {},
		stripCloudflareCredentials = false,
		timeoutMs = MUTATION_TIMEOUT_MS,
	} = {},
) {
	const commandEnvironment = { ...process.env, ...env };
	if (stripCloudflareCredentials) {
		delete commandEnvironment.CLOUDFLARE_API_TOKEN;
		delete commandEnvironment.CLOUDFLARE_ACCOUNT_ID;
	}
	const result = spawnSync(command, args, {
		cwd: root,
		env: commandEnvironment,
		encoding: "utf8",
		stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
		timeout: timeoutMs,
	});
	if (result.error?.code === "ETIMEDOUT") {
		throw new Error(
			`${path.basename(command)} ${args.join(" ")} exceeded its ${timeoutMs}ms safety timeout`,
		);
	}
	if (result.error) throw result.error;
	if (result.status !== 0) {
		const detail = capture
			? `\n${result.stdout || ""}${result.stderr || ""}`
			: "";
		throw new Error(
			`${path.basename(command)} ${args.join(" ")} failed with exit ${result.status}${detail}`,
		);
	}
	return capture ? result.stdout : "";
}

function wranglerJson(args) {
	const stdout = run(wrangler, args, {
		capture: true,
		timeoutMs: QUERY_TIMEOUT_MS,
	});
	try {
		return JSON.parse(stdout);
	} catch (error) {
		throw new Error(
			`Wrangler returned invalid JSON for ${args.join(" ")}: ${error.message}`,
		);
	}
}

function deployVersions(specs, message) {
	run(wrangler, [
		"versions",
		"deploy",
		...specs,
		"--yes",
		"--message",
		message,
	]);
}

function liveAudit(env) {
	run(process.execPath, ["tools/audit-live-site.mjs"], {
		env,
		stripCloudflareCredentials: true,
		timeoutMs:
			env.WYST_POLICY_ONLY === "1"
				? POLICY_AUDIT_TIMEOUT_MS
				: CONTENT_AUDIT_TIMEOUT_MS,
	});
}

function browserAudit(versionId) {
	run(process.execPath, ["tools/audit-browser.mjs"], {
		env: {
			WYST_BROWSER_ORIGIN: "https://wyst.dev",
			WYST_VERSION_ID: versionId,
		},
		stripCloudflareCredentials: true,
		timeoutMs: BROWSER_AUDIT_TIMEOUT_MS,
	});
}

async function assertPrivateWorkerHostnames() {
	const response = await fetch(
		`https://api.cloudflare.com/client/v4/accounts/${cloudflareAccountId}/workers/scripts/wyst/subdomain`,
		{
			headers: {
				accept: "application/json",
				authorization: `Bearer ${cloudflareApiToken}`,
				"user-agent": "wyst-release/1.0",
			},
			redirect: "error",
			signal: AbortSignal.timeout(QUERY_TIMEOUT_MS),
		},
	);
	let payload;
	try {
		payload = await response.json();
	} catch {
		throw new Error(
			`Cloudflare Worker subdomain settings returned non-JSON status ${response.status}`,
		);
	}
	if (!response.ok || payload?.success !== true) {
		const codes = Array.isArray(payload?.errors)
			? payload.errors
					.map((error) => error?.code)
					.filter((code) => Number.isSafeInteger(code))
					.join(",")
			: "";
		throw new Error(
			`Cloudflare Worker subdomain settings request failed with status ${response.status}${codes ? ` (codes ${codes})` : ""}`,
		);
	}
	assertWorkerSubdomainsDisabled(payload.result);
}

function productionState() {
	const result = spawnSync(wrangler, ["deployments", "list", "--json"], {
		cwd: root,
		env: process.env,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
		timeout: QUERY_TIMEOUT_MS,
	});
	if (result.error?.code === "ETIMEDOUT") {
		throw new Error(
			`wrangler deployments list --json exceeded its ${QUERY_TIMEOUT_MS}ms safety timeout`,
		);
	}
	if (result.error) throw result.error;
	if (result.status !== 0) {
		const detail = `${result.stdout || ""}${result.stderr || ""}`;
		if (isWorkerNotFoundOutput(detail)) {
			return { deployment: null, workerExists: false };
		}
		throw new Error(
			`wrangler deployments list --json failed with exit ${result.status}\n${detail}`,
		);
	}
	let deployments;
	try {
		deployments = JSON.parse(result.stdout);
	} catch (error) {
		throw new Error(`Wrangler returned invalid deployment JSON: ${error.message}`);
	}
	return {
		deployment: newestDeploymentFrom(deployments),
		workerExists: true,
	};
}

function deploymentMatches(deployment, expectedVersions) {
	if (!deployment || !Array.isArray(deployment.versions)) return false;
	const actual = deployment.versions
		.map(({ percentage, version_id: versionId }) => ({ percentage, versionId }))
		.sort((left, right) =>
			left.versionId < right.versionId
				? -1
				: left.versionId > right.versionId
					? 1
					: 0,
		);
	const expected = Object.entries(expectedVersions)
		.map(([versionId, percentage]) => ({ percentage, versionId }))
		.sort((left, right) =>
			left.versionId < right.versionId
				? -1
				: left.versionId > right.versionId
					? 1
					: 0,
		);
	return JSON.stringify(actual) === JSON.stringify(expected);
}

async function assertCurrentDeployment(expectedVersions, label) {
	for (let attempt = 1; attempt <= 8; attempt++) {
		const state = productionState();
		if (state.workerExists && deploymentMatches(state.deployment, expectedVersions)) {
			return;
		}
		if (attempt < 8) {
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}
	}
	throw new Error(`Cloudflare control plane did not confirm ${label}`);
}

function versionCreatedOn(version) {
	const value = version?.metadata?.created_on;
	const milliseconds = Date.parse(value);
	if (typeof value !== "string" || !Number.isFinite(milliseconds)) {
		throw new Error("Cloudflare version is missing a valid created_on timestamp");
	}
	return milliseconds;
}

function listedVersions() {
	const versions = wranglerJson(["versions", "list", "--json"]);
	if (!Array.isArray(versions)) {
		throw new Error("Cloudflare versions response must be an array");
	}
	return versions;
}

async function uploadedVersion(excludedVersionIds) {
	for (let attempt = 1; attempt <= 5; attempt++) {
		const matches = listedVersions()
			.filter(
				(version) =>
					!excludedVersionIds.has(version.id) &&
					version.annotations?.["workers/tag"] === commit,
			)
			.map((version) => ({
				createdOn: versionCreatedOn(version),
				version,
			}))
			.sort((left, right) => {
				const timeDifference = left.createdOn - right.createdOn;
				if (timeDifference !== 0) return timeDifference;
				const leftId = String(left.version.id || "");
				const rightId = String(right.version.id || "");
				return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
			});
		const candidate = matches.at(-1)?.version;
		if (candidate) {
			return candidate.id;
		}
		if (attempt < 5) {
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}
	}
	throw new Error(`could not resolve the uploaded Cloudflare version tagged ${commit}`);
}

async function main() {
	console.log("Preflight: verify the downloaded build artifact and release inputs.");
	const identity = await verifyBuildIdentity();
	if (identity.manifest.siteCommit !== commit.toLowerCase()) {
		throw new Error(
			`downloaded artifact belongs to ${identity.manifest.siteCommit}, not ${commit}`,
		);
	}
	const expectedIdentity = auditEnvironmentFor(identity);

	const initialState = productionState();
	const { workerExists } = initialState;
	const oldVersion = currentProductionVersionFrom(
		initialState.deployment ? [initialState.deployment] : [],
	);
	if (oldVersion) {
		console.log("Preflight: verify current edge policy without requiring build identity.");
		liveAudit({ WYST_POLICY_ONLY: "1" });
		await assertPrivateWorkerHostnames();
		console.log(`Current production version: ${oldVersion}`);
	} else if (workerExists) {
		console.log(
			"The Worker exists without a current deployment; using the explicit bootstrap path.",
		);
	} else {
		console.log(
			"The Worker does not exist; using Wrangler deploy for the explicit creation path.",
		);
	}

	const preexistingVersionIds = workerExists
		? new Set(listedVersions().map((version) => version.id))
		: new Set();
	if (workerExists) {
		console.log(`Upload an undeployed version tagged ${commit}.`);
		run(wrangler, [
			"versions",
			"upload",
			"--tag",
			commit,
			"--message",
			`GitHub ${commit}`,
		]);
	} else {
		console.log(`Create and deploy the first version tagged ${commit}.`);
		run(wrangler, [
			"deploy",
			"--tag",
			commit,
			"--message",
			`Bootstrap GitHub ${commit}`,
		]);
	}
	const candidateVersion = await uploadedVersion(preexistingVersionIds);
	await assertPrivateWorkerHostnames();
	console.log(`Candidate version: ${candidateVersion}`);

	if (!oldVersion) {
		if (workerExists) {
			console.log(
				"Bootstrap the candidate at 100% traffic; there is no prior version to preserve.",
			);
			deployVersions([`${candidateVersion}@100%`], `Bootstrap GitHub ${commit}`);
		}
		await assertCurrentDeployment(
			{ [candidateVersion]: 100 },
			"the bootstrap candidate at 100%",
		);
		try {
			liveAudit({
				...expectedIdentity,
				WYST_AUDIT_ATTEMPTS: "8",
				WYST_AUDIT_RETRY_MS: "1000",
				WYST_VERSION_ID: candidateVersion,
			});
			browserAudit(candidateVersion);
			liveAudit({
				...expectedIdentity,
				WYST_AUDIT_ATTEMPTS: "8",
				WYST_AUDIT_RETRY_MS: "1000",
				WYST_CONTENT_ONLY: "1",
			});
		} catch (error) {
			console.error(
				"Bootstrap audit failed. No prior deployment exists to roll back to; production remains on the failed first version for diagnosis.",
			);
			throw error;
		}
		console.log(`Released ${commit} as first Cloudflare version ${candidateVersion}.`);
		return;
	}

	console.log("Stage the candidate at 0% traffic for override audits.");
	try {
		deployVersions(
			[`${oldVersion}@100%`, `${candidateVersion}@0%`],
			`Stage GitHub ${commit}`,
		);
		await assertCurrentDeployment(
			{ [oldVersion]: 100, [candidateVersion]: 0 },
			"the staged old/candidate traffic split",
		);
		liveAudit({
			...expectedIdentity,
			WYST_AUDIT_ATTEMPTS: "8",
			WYST_AUDIT_RETRY_MS: "1000",
			WYST_VERSION_ID: candidateVersion,
		});
		browserAudit(candidateVersion);
	} catch (error) {
		console.error("Candidate audit failed; restoring the prior version at 100%.");
		deployVersions([`${oldVersion}@100%`], `Reject GitHub ${commit}`);
		await assertCurrentDeployment(
			{ [oldVersion]: 100 },
			"the rejected release restoration",
		);
		throw error;
	}

	console.log("Promote the audited candidate to 100% traffic.");
	try {
		deployVersions([`${candidateVersion}@100%`], `Promote GitHub ${commit}`);
		await assertCurrentDeployment(
			{ [candidateVersion]: 100 },
			"the promoted candidate at 100%",
		);
		liveAudit({
			...expectedIdentity,
			WYST_AUDIT_ATTEMPTS: "8",
			WYST_AUDIT_RETRY_MS: "1000",
			WYST_CONTENT_ONLY: "1",
		});
	} catch (error) {
		console.error("Post-deployment content audit failed; rolling back production.");
		run(wrangler, [
			"rollback",
			oldVersion,
			"--yes",
			"--message",
			`Rollback GitHub ${commit}`,
		]);
		await assertCurrentDeployment(
			{ [oldVersion]: 100 },
			"the rolled-back prior version at 100%",
		);
		try {
			liveAudit({
				WYST_AUDIT_ATTEMPTS: "8",
				WYST_AUDIT_RETRY_MS: "1000",
				WYST_POLICY_ONLY: "1",
			});
		} catch (rollbackAuditError) {
			console.error("The rollback completed, but its policy-only audit also failed.");
			console.error(rollbackAuditError);
		}
		throw error;
	}

	console.log("Verify zone-owned policy after the content release is stable.");
	liveAudit({ WYST_POLICY_ONLY: "1" });

	console.log(`Released ${commit} as Cloudflare version ${candidateVersion}.`);
}

await main();
