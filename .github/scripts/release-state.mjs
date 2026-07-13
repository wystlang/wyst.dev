function createdOnMilliseconds(deployment) {
	const raw = deployment?.created_on;
	const milliseconds = Date.parse(raw);
	if (typeof raw !== "string" || !Number.isFinite(milliseconds)) {
		throw new Error("Cloudflare deployment is missing a valid created_on timestamp");
	}
	return milliseconds;
}

export function isWorkerNotFoundOutput(output) {
	return /\[code:\s*(?:10007|10090)\]/.test(String(output || ""));
}

export function assertWorkerSubdomainsDisabled(settings) {
	if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
		throw new Error("Cloudflare Worker subdomain settings are malformed");
	}
	if (settings.enabled !== false || settings.previews_enabled !== false) {
		throw new Error(
			"Cloudflare workers.dev and version preview URLs must both be disabled",
		);
	}
}

export function currentProductionVersionFrom(deployments) {
	if (!Array.isArray(deployments)) {
		throw new Error("Cloudflare deployments response must be an array");
	}
	const current = newestDeploymentFrom(deployments);
	if (!current) return null;
	const versions = current?.versions;
	if (
		!Array.isArray(versions) ||
		versions.length !== 1 ||
		versions[0].percentage !== 100 ||
		!versions[0].version_id
	) {
		throw new Error(
			"release requires exactly one current production version at 100% traffic; recover the Cloudflare deployment before retrying",
		);
	}
	return versions[0].version_id;
}

export function newestDeploymentFrom(deployments) {
	if (!Array.isArray(deployments)) {
		throw new Error("Cloudflare deployments response must be an array");
	}
	if (deployments.length === 0) return null;

	const sorted = deployments
		.map((deployment) => ({
			deployment,
			createdOn: createdOnMilliseconds(deployment),
		}))
		.sort((left, right) => {
			const timeDifference = left.createdOn - right.createdOn;
			if (timeDifference !== 0) return timeDifference;
			const leftId = String(left.deployment.id || "");
			const rightId = String(right.deployment.id || "");
			return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
		});
	return sorted.at(-1).deployment;
}
