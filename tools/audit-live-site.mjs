import { createHash } from "node:crypto";
import {
	compareText,
	expectedReleaseFilePaths,
	releaseSha256For,
} from "./build-manifest.mjs";

const configuredOrigin = process.env.WYST_LIVE_ORIGIN;
const origin = new URL(configuredOrigin || "https://wyst.dev/");
const expectedCommit = process.env.WYST_EXPECTED_COMMIT?.trim().toLowerCase();
const expectedTreeSha256 = process.env.WYST_EXPECTED_TREE_SHA256?.trim();
const expectedReleaseSha256 = process.env.WYST_EXPECTED_RELEASE_SHA256?.trim();
const expectedManifestSha256 = process.env.WYST_EXPECTED_MANIFEST_SHA256?.trim();
const versionId = process.env.WYST_VERSION_ID?.trim();
const policyOnly = process.env.WYST_POLICY_ONLY === "1";
const contentOnly = process.env.WYST_CONTENT_ONLY === "1";

if (
	origin.protocol !== "https:" ||
	origin.pathname !== "/" ||
	origin.search ||
	origin.hash ||
	origin.username ||
	origin.password
) {
	throw new Error("WYST_LIVE_ORIGIN must be an HTTPS origin without a path");
}
if (expectedCommit && !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(expectedCommit)) {
	throw new Error("WYST_EXPECTED_COMMIT must be a full hexadecimal commit SHA");
}
for (const [name, value] of [
	["WYST_EXPECTED_TREE_SHA256", expectedTreeSha256],
	["WYST_EXPECTED_RELEASE_SHA256", expectedReleaseSha256],
	["WYST_EXPECTED_MANIFEST_SHA256", expectedManifestSha256],
]) {
	if (value && !/^[0-9a-f]{64}$/.test(value)) {
		throw new Error(`${name} must be a lowercase SHA-256 digest`);
	}
}
const expectedIdentity = [
	expectedCommit,
	expectedTreeSha256,
	expectedReleaseSha256,
	expectedManifestSha256,
];
const verifiesExpectedIdentity = expectedIdentity.every(Boolean);
if (
	expectedIdentity.some(Boolean) &&
	!verifiesExpectedIdentity
) {
	throw new Error(
		"expected deployment identity requires commit, public tree, release, and manifest SHA-256 values",
	);
}
if (versionId && !/^[\w.-]+$/.test(versionId)) {
	throw new Error("WYST_VERSION_ID contains invalid characters");
}
if (policyOnly && expectedIdentity.some(Boolean)) {
	throw new Error("WYST_POLICY_ONLY cannot be combined with expected build identity");
}
if (policyOnly && contentOnly) {
	throw new Error("WYST_POLICY_ONLY and WYST_CONTENT_ONLY are mutually exclusive");
}

function positiveInteger(name, fallback) {
	const raw = process.env[name];
	if (raw === undefined || raw === "") return fallback;
	const value = Number(raw);
	if (!Number.isSafeInteger(value) || value < 1) {
		throw new Error(`${name} must be a positive integer`);
	}
	return value;
}

const attempts = positiveInteger("WYST_AUDIT_ATTEMPTS", 3);
const retryMs = positiveInteger("WYST_AUDIT_RETRY_MS", 1000);
const requestHeaders = {
	accept: "*/*",
	"cache-control": "no-cache",
	"user-agent":
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/138 Safari/537.36 wyst-live-audit/2.0",
	...(versionId
		? { "Cloudflare-Workers-Version-Overrides": `wyst="${versionId}"` }
		: {}),
};

const injectedScriptPattern =
	/static\.cloudflareinsights\.com|cloudflareinsights|data-cf-beacon|\/cdn-cgi\/(?:challenge-platform|scripts)\//i;
const exactHeaders = new Map([
	["cross-origin-opener-policy", "same-origin"],
	[
		"referrer-policy",
		"strict-origin-when-cross-origin",
	],
	["strict-transport-security", "max-age=31536000"],
	["x-content-type-options", "nosniff"],
	["x-frame-options", "DENY"],
	["x-xss-protection", "0"],
]);
const expectedCsp = new Map([
	["default-src", ["'none'"]],
	["base-uri", ["'none'"]],
	["connect-src", ["'none'"]],
	["font-src", ["'self'"]],
	["form-action", ["'none'"]],
	["frame-ancestors", ["'none'"]],
	["img-src", ["'self'", "data:"]],
	["script-src", ["'self'"]],
	["style-src", ["'self'"]],
	["upgrade-insecure-requests", []],
]);
const expectedPermissions = [
	"accelerometer=()",
	"camera=()",
	"geolocation=()",
	"gyroscope=()",
	"microphone=()",
	"payment=()",
	"usb=()",
].sort();
const immutableCacheControl = "public, max-age=31536000, immutable";
const revalidatedCacheControl =
	"public, max-age=86400, stale-while-revalidate=604800";
const stableFaviconCacheControl = "public, max-age=0, must-revalidate";
const stableFavicons = new Set([
	"/assets/apple-touch-icon.png",
	"/assets/favicon-48.png",
	"/assets/favicon.svg",
]);
const immutableExtensions = new Set([
	".css",
	".js",
	".woff2",
	".woff",
	".ttf",
	".otf",
]);
const revalidatedExtensions = new Set([
	".avif",
	".webp",
	".png",
	".jpg",
	".jpeg",
	".gif",
	".svg",
	".ico",
]);

function sha256(bytes) {
	return createHash("sha256").update(bytes).digest("hex");
}

function sleep(milliseconds) {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchPublic(urlOrPath, options = {}) {
	const url =
		typeof urlOrPath === "string" ? new URL(urlOrPath, origin) : urlOrPath;
	return fetch(url, {
		...options,
		headers: { ...requestHeaders, ...options.headers },
		redirect: options.redirect ?? "manual",
		signal: options.signal ?? AbortSignal.timeout(15_000),
	});
}

function parseCsp(value) {
	const policy = new Map();
	for (const rawDirective of value.split(";")) {
		const parts = rawDirective.trim().split(/\s+/).filter(Boolean);
		if (!parts.length) continue;
		const name = parts.shift().toLowerCase();
		if (policy.has(name)) throw new Error(`duplicate CSP directive ${name}`);
		policy.set(name, parts);
	}
	return policy;
}

function compareMap(actual, expected) {
	if (actual.size !== expected.size) return false;
	for (const [name, values] of expected) {
		if (JSON.stringify(actual.get(name)) !== JSON.stringify(values)) return false;
	}
	return true;
}

function auditSecurityHeaders(pathname, headers, failures) {
	for (const [name, expected] of exactHeaders) {
		const actual = headers.get(name)?.trim() ?? "";
		if (actual !== expected) {
			failures.push(
				`${pathname} ${name} is ${JSON.stringify(actual)}; expected ${JSON.stringify(expected)}`,
			);
		}
	}

	const rawCsp = headers.get("content-security-policy") ?? "";
	try {
		const actualCsp = parseCsp(rawCsp);
		if (!compareMap(actualCsp, expectedCsp)) {
			failures.push(`${pathname} content-security-policy is not the exact required policy`);
		}
	} catch (error) {
		failures.push(`${pathname} content-security-policy is invalid: ${error.message}`);
	}

	const permissions = (headers.get("permissions-policy") ?? "")
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean)
		.sort();
	if (JSON.stringify(permissions) !== JSON.stringify(expectedPermissions)) {
		failures.push(`${pathname} permissions-policy is not the exact required policy`);
	}
}

function inspectHtml(pathname, bytes, failures) {
	if (injectedScriptPattern.test(bytes.toString("utf8"))) {
		failures.push(`${pathname} contains Cloudflare-injected client JavaScript`);
	}
}

function canonicalRequestPath(publicUrl) {
	return publicUrl.endsWith(".html") ? publicUrl.slice(0, -".html".length) : publicUrl;
}

function expectedCacheControl(publicUrl) {
	if (stableFavicons.has(publicUrl)) return stableFaviconCacheControl;
	const finalSegment = publicUrl.slice(publicUrl.lastIndexOf("/") + 1);
	const dot = finalSegment.lastIndexOf(".");
	const extension = dot === -1 ? "" : finalSegment.slice(dot).toLowerCase();
	if (immutableExtensions.has(extension)) return immutableCacheControl;
	if (revalidatedExtensions.has(extension)) return revalidatedCacheControl;
	return undefined;
}

function manifestFailure(manifest) {
	if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
		return "build manifest must be an object";
	}
	if (manifest.schema !== 2) return "build manifest schema must be 2";
	if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(manifest.siteCommit ?? "")) {
		return "build manifest siteCommit must be a full hexadecimal commit SHA";
	}
	if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(manifest.wystSourceCommit ?? "")) {
		return "build manifest wystSourceCommit must be a full hexadecimal commit SHA";
	}
	if (!/^[0-9a-f]{64}$/.test(manifest.wystSnapshotSha256 ?? "")) {
		return "build manifest wystSnapshotSha256 must be a lowercase SHA-256 digest";
	}
	if (!/^[0-9a-f]{64}$/.test(manifest.treeSha256 ?? "")) {
		return "build manifest treeSha256 must be a lowercase SHA-256 digest";
	}
	if (!/^[0-9a-f]{64}$/.test(manifest.releaseSha256 ?? "")) {
		return "build manifest releaseSha256 must be a lowercase SHA-256 digest";
	}
	if (
		!manifest.releaseFiles ||
		typeof manifest.releaseFiles !== "object" ||
		Array.isArray(manifest.releaseFiles) ||
		JSON.stringify(Object.keys(manifest.releaseFiles)) !==
			JSON.stringify(expectedReleaseFilePaths())
	) {
		return "build manifest releaseFiles must contain exactly _headers and wrangler.jsonc";
	}
	for (const [relativePath, entry] of Object.entries(manifest.releaseFiles)) {
		if (
			!entry ||
			typeof entry !== "object" ||
			Array.isArray(entry) ||
			Object.keys(entry).sort().join(",") !== "sha256,size" ||
			!/^[0-9a-f]{64}$/.test(entry.sha256 ?? "") ||
			!Number.isSafeInteger(entry.size) ||
			entry.size < 0
		) {
			return `build manifest contains invalid release metadata for ${relativePath}`;
		}
	}
	if (
		!manifest.files ||
		typeof manifest.files !== "object" ||
		Array.isArray(manifest.files) ||
		!Object.keys(manifest.files).length
	) {
		return "build manifest files must be a non-empty object";
	}

	for (const [publicUrl, entry] of Object.entries(manifest.files)) {
		let parsed;
		try {
			parsed = new URL(publicUrl, origin);
		} catch {
			return `build manifest contains malformed URL ${JSON.stringify(publicUrl)}`;
		}
		if (
			!publicUrl.startsWith("/") ||
			publicUrl.startsWith("//") ||
			parsed.origin !== origin.origin ||
			parsed.pathname !== publicUrl ||
			parsed.search ||
			parsed.hash ||
			publicUrl === "/.well-known/build.json" ||
			publicUrl === "/_headers"
		) {
			return `build manifest contains non-canonical URL ${JSON.stringify(publicUrl)}`;
		}
		if (
			!entry ||
			typeof entry !== "object" ||
			Array.isArray(entry) ||
			Object.keys(entry).sort().join(",") !== "sha256,size" ||
			!/^[0-9a-f]{64}$/.test(entry.sha256 ?? "") ||
			!Number.isSafeInteger(entry.size) ||
			entry.size < 0
		) {
			return `build manifest contains invalid metadata for ${publicUrl}`;
		}
	}

	const treeInput = Object.entries(manifest.files)
		.sort(([left], [right]) => compareText(left, right))
		.map(([publicUrl, entry]) => `${publicUrl}\0${entry.sha256}\0${entry.size}\n`)
		.join("");
	if (sha256(Buffer.from(treeInput)) !== manifest.treeSha256) {
		return "build manifest treeSha256 does not match its file entries";
	}
	if (
		releaseSha256For({
			treeSha256: manifest.treeSha256,
			releaseFiles: manifest.releaseFiles,
		}) !== manifest.releaseSha256
	) {
		return "build manifest releaseSha256 does not match its release inputs";
	}
	return undefined;
}

async function auditRedirects(failures) {
	const probePath = "/__wyst-audit-redirect-probe?identity=preserved";
	const insecure = new URL(probePath, origin);
	insecure.protocol = "http:";
	const response = await fetchPublic(insecure);
	if (![301, 308].includes(response.status)) {
		failures.push(
			`HTTP origin returned ${response.status} instead of a permanent redirect`,
		);
	} else {
		const location = response.headers.get("location");
		const target = location ? new URL(location, insecure) : null;
		const expected = new URL(probePath, origin);
		if (!target || target.href !== expected.href) {
			failures.push(`HTTP redirect has an invalid Location: ${location || "(missing)"}`);
		}
	}

	if (!configuredOrigin && origin.hostname === "wyst.dev") {
		const www = new URL(probePath, origin);
		www.hostname = "www.wyst.dev";
		const wwwResponse = await fetchPublic(www);
		if (![301, 308].includes(wwwResponse.status)) {
			failures.push(
				`www origin returned ${wwwResponse.status} instead of a permanent redirect`,
			);
		} else {
			const location = wwwResponse.headers.get("location");
			const target = location ? new URL(location, www) : null;
			const expected = new URL(probePath, origin);
			if (!target || target.href !== expected.href) {
				failures.push(`www redirect has an invalid Location: ${location || "(missing)"}`);
			}
		}
	}
}

async function fetchHtml(pathname, expectedStatus, failures, { auditPolicy = true } = {}) {
	const response = await fetchPublic(pathname);
	const bytes = Buffer.from(await response.arrayBuffer());
	if (response.status !== expectedStatus) {
		failures.push(`${pathname} returned ${response.status}; expected ${expectedStatus}`);
	}
	if (auditPolicy) {
		auditSecurityHeaders(pathname, response.headers, failures);
		inspectHtml(pathname, bytes, failures);
	}
	return { response, bytes };
}

async function auditNotFound(expected404, failures, { auditPolicy = true } = {}) {
	const pathname = "/__wyst-audit-missing-page";
	const missing = await fetchHtml(pathname, 404, failures, { auditPolicy });
	if (expected404 && sha256(missing.bytes) !== expected404.sha256) {
		failures.push(`${pathname} did not serve the deployed custom 404 body`);
	}
	if (expected404 && missing.bytes.length !== expected404.size) {
		failures.push(
			`${pathname} custom 404 has ${missing.bytes.length} bytes; expected ${expected404.size}`,
		);
	}
	return missing;
}

async function auditPolicyOnly(failures) {
	await Promise.all([
		fetchHtml("/", 200, failures),
		fetchHtml("/docs/", 200, failures),
	]);
	const notFoundPage = await fetchHtml("/404", 200, failures);
	await auditNotFound(
		{ sha256: sha256(notFoundPage.bytes), size: notFoundPage.bytes.length },
		failures,
	);
}

async function auditManifest(failures, { auditPolicy = true } = {}) {
	const response = await fetchPublic("/.well-known/build.json");
	if (response.status !== 200) {
		failures.push(`/.well-known/build.json returned ${response.status}`);
		return false;
	}

	const manifestBytes = Buffer.from(await response.arrayBuffer());
	const manifestSha256 = sha256(manifestBytes);
	let expectedIdentityMatches = true;
	let intendedCommitObserved = true;
	if (
		expectedManifestSha256 &&
		manifestSha256 !== expectedManifestSha256
	) {
		expectedIdentityMatches = false;
		failures.push(
			`deployed build manifest SHA-256 is ${manifestSha256}; expected ${expectedManifestSha256}`,
		);
	}

	let manifest;
	try {
		manifest = JSON.parse(manifestBytes.toString("utf8"));
	} catch (error) {
		failures.push(`/.well-known/build.json is invalid JSON: ${error.message}`);
		return false;
	}
	const invalid = manifestFailure(manifest);
	if (invalid) {
		failures.push(invalid);
		return false;
	}
	if (expectedCommit && manifest.siteCommit.toLowerCase() !== expectedCommit) {
		expectedIdentityMatches = false;
		intendedCommitObserved = false;
		failures.push(
			`deployed site commit is ${manifest.siteCommit}; expected ${expectedCommit}`,
		);
	}
	if (expectedTreeSha256 && manifest.treeSha256 !== expectedTreeSha256) {
		expectedIdentityMatches = false;
		failures.push(
			`deployed public tree is ${manifest.treeSha256}; expected ${expectedTreeSha256}`,
		);
	}
	if (expectedReleaseSha256 && manifest.releaseSha256 !== expectedReleaseSha256) {
		expectedIdentityMatches = false;
		failures.push(
			`deployed release identity is ${manifest.releaseSha256}; expected ${expectedReleaseSha256}`,
		);
	}
	if (verifiesExpectedIdentity && !expectedIdentityMatches) {
		// A valid manifest for another commit means the ordinary hostname has not
		// converged yet. Do not crawl that older tree. If the intended commit is
		// already visible but another identity field differs, return immediately so
		// the release driver can treat it as corruption and roll back.
		return intendedCommitObserved;
	}

	for (const [publicUrl, entry] of Object.entries(manifest.files)) {
		if (publicUrl === "/404.html") continue;
		const requestPath = canonicalRequestPath(publicUrl);
		const asset = await fetchPublic(requestPath);
		const bytes = Buffer.from(await asset.arrayBuffer());
		if (asset.status !== 200) {
			failures.push(`${requestPath} returned ${asset.status}; expected 200`);
			continue;
		}
		const expectedCaching = expectedCacheControl(publicUrl);
		if (
			expectedCaching &&
			(asset.headers.get("cache-control") ?? "").trim() !== expectedCaching
		) {
			failures.push(
				`${publicUrl} cache-control is ${JSON.stringify(asset.headers.get("cache-control") ?? "")}; expected ${JSON.stringify(expectedCaching)}`,
			);
		}
		if (bytes.length !== entry.size) {
			failures.push(
				`${publicUrl} has ${bytes.length} bytes; expected ${entry.size}`,
			);
		}
		const digest = sha256(bytes);
		if (digest !== entry.sha256) {
			failures.push(`${publicUrl} SHA-256 is ${digest}; expected ${entry.sha256}`);
		}
		if (
			auditPolicy &&
			(asset.headers.get("content-type") ?? "").includes("text/html")
		) {
			auditSecurityHeaders(requestPath, asset.headers, failures);
			inspectHtml(requestPath, bytes, failures);
		}
	}

	const expected404 = manifest.files["/404.html"];
	if (!expected404) failures.push("build manifest is missing /404.html");
	await auditNotFound(expected404, failures, { auditPolicy });
	return false;
}

async function auditOnce() {
	const failures = [];
	let manifestIdentityCorruptionObserved = false;
	if (contentOnly) {
		manifestIdentityCorruptionObserved = await auditManifest(failures, {
			auditPolicy: false,
		});
	} else {
		await auditRedirects(failures);
		if (policyOnly) await auditPolicyOnly(failures);
		else manifestIdentityCorruptionObserved = await auditManifest(failures);
	}
	if (failures.length) {
		const error = new Error(failures.join("\n"));
		// A manifest that names the intended commit but carries another build identity
		// is corruption, so restore the known-good version immediately. Individual
		// assets can lag a correct manifest while Workers Assets converges globally;
		// those mismatches retain the bounded retry window before rollback.
		if (
			(contentOnly || versionId) &&
			verifiesExpectedIdentity &&
			manifestIdentityCorruptionObserved
		) {
			error.retryable = false;
		}
		throw error;
	}
}

let lastError;
let completedAttempts = 0;
for (let attempt = 1; attempt <= attempts; attempt++) {
	completedAttempts = attempt;
	try {
		await auditOnce();
		const qualifier = policyOnly
			? "policy-only "
			: contentOnly
				? "content-only "
				: "";
		const version = versionId ? ` using version ${versionId}` : "";
		console.log(`${qualifier}live-site audit passed for ${origin.origin}${version}`);
		lastError = undefined;
		break;
	} catch (error) {
		lastError = error;
		if (error.retryable === false) break;
		if (attempt < attempts) await sleep(retryMs);
	}
}

if (lastError) {
	throw new Error(
		`live-site audit failed after ${completedAttempts} attempt(s):\n${lastError.message}`,
	);
}
