import path from "node:path";
import { fileURLToPath } from "node:url";

const API_VERSION = "2022-11-28";

function compareText(left, right) {
	return left < right ? -1 : left > right ? 1 : 0;
}

function createdOnMilliseconds(deployment) {
	const raw = deployment?.created_at;
	const milliseconds = Date.parse(raw);
	if (typeof raw !== "string" || !Number.isFinite(milliseconds)) {
		throw new Error("GitHub deployment is missing a valid created_at timestamp");
	}
	return milliseconds;
}

function repositoryParts(repository) {
	const match = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(repository ?? "");
	if (!match) throw new Error("GITHUB_REPOSITORY must contain owner/name");
	return { owner: match[1], repository: match[2] };
}

function deploymentWasSuccessful(statuses) {
	if (!Array.isArray(statuses)) {
		throw new Error("GitHub deployment statuses response must be an array");
	}
	const successIndex = statuses.findIndex((status) => status?.state === "success");
	if (successIndex === -1) return false;
	// GitHub returns deployment statuses newest-first. A deployment that was
	// superseded may have an `inactive` status newer than its successful status;
	// any other newer state means it is not a completed successful deployment.
	return statuses
		.slice(0, successIndex)
		.every((status) => status?.state === "inactive");
}

async function githubJson({ apiUrl, fetchImpl, pathname, token }) {
	const base = new URL(apiUrl);
	if (base.protocol !== "https:" || base.username || base.password) {
		throw new Error("GITHUB_API_URL must be an HTTPS URL without credentials");
	}
	const url = new URL(
		pathname.replace(/^\/+/, ""),
		`${base.href.replace(/\/$/, "")}/`,
	);
	if (url.origin !== base.origin) {
		throw new Error("refusing to request a GitHub API URL on another origin");
	}
	const response = await fetchImpl(url, {
		headers: {
			Accept: "application/vnd.github+json",
			Authorization: `Bearer ${token}`,
			"X-GitHub-Api-Version": API_VERSION,
			"User-Agent": "wyst-production-monitor/1.0",
		},
		redirect: "error",
		signal: AbortSignal.timeout(15_000),
	});
	if (!response.ok) {
		throw new Error(`GitHub API ${url.pathname} returned ${response.status}`);
	}
	return response.json();
}

export async function newestSuccessfulProductionDeployment({
	apiUrl = "https://api.github.com",
	fetchImpl = fetch,
	repository,
	token,
} = {}) {
	if (!token) throw new Error("GITHUB_TOKEN is required to resolve production");
	const parts = repositoryParts(repository);
	const prefix = `/repos/${encodeURIComponent(parts.owner)}/${encodeURIComponent(
		parts.repository,
	)}`;
	const deployments = await githubJson({
		apiUrl,
		fetchImpl,
		pathname: `${prefix}/deployments?environment=production&per_page=100`,
		token,
	});
	if (!Array.isArray(deployments)) {
		throw new Error("GitHub deployments response must be an array");
	}

	const ordered = deployments
		.filter(
			(deployment) =>
				deployment?.environment === "production" &&
				(deployment.ref === "main" || deployment.ref === "refs/heads/main"),
		)
		.map((deployment) => ({
			createdOn: createdOnMilliseconds(deployment),
			deployment,
		}))
		.sort((left, right) => {
			const timeDifference = right.createdOn - left.createdOn;
			if (timeDifference !== 0) return timeDifference;
			return compareText(String(right.deployment.id), String(left.deployment.id));
		});

	for (const { deployment } of ordered) {
		if (!Number.isSafeInteger(deployment.id) || deployment.id < 1) {
			throw new Error("GitHub deployment has an invalid numeric ID");
		}
		if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(deployment.sha ?? "")) {
			throw new Error(`GitHub deployment ${deployment.id} has an invalid commit SHA`);
		}
		const statuses = await githubJson({
			apiUrl,
			fetchImpl,
			pathname: `${prefix}/deployments/${deployment.id}/statuses?per_page=100`,
			token,
		});
		if (deploymentWasSuccessful(statuses)) {
			return { deploymentId: deployment.id, sha: deployment.sha.toLowerCase() };
		}
	}

	throw new Error(
		"could not find a successful production deployment from main in the latest 100 GitHub deployments",
	);
}

if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	const deployment = await newestSuccessfulProductionDeployment({
		apiUrl: process.env.GITHUB_API_URL,
		repository: process.env.GITHUB_REPOSITORY,
		token: process.env.GITHUB_TOKEN,
	});
	console.log(`sha=${deployment.sha}`);
	console.log(`deployment_id=${deployment.deploymentId}`);
}
