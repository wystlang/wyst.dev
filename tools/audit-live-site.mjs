const origin = new URL(process.env.WYST_LIVE_ORIGIN || "https://wyst.dev/");

if (origin.protocol !== "https:") {
	throw new Error("WYST_LIVE_ORIGIN must be an HTTPS origin");
}

const requestHeaders = {
	accept: "text/html,application/xhtml+xml",
	"user-agent":
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/138 Safari/537.36 wyst-live-audit/1.0",
};

const failures = [];
const insecure = new URL(origin);
insecure.protocol = "http:";
const redirect = await fetch(insecure, {
	headers: requestHeaders,
	redirect: "manual",
});

if (![301, 302, 307, 308].includes(redirect.status)) {
	failures.push(`HTTP origin returned ${redirect.status} instead of a redirect`);
} else {
	const location = redirect.headers.get("location");
	const target = location ? new URL(location, insecure) : null;
	if (!target || target.protocol !== "https:" || target.host !== origin.host) {
		failures.push(`HTTP redirect has an invalid Location: ${location || "(missing)"}`);
	}
}

const requiredHeaders = new Map([
	[
		"content-security-policy",
		["default-src 'none'", "frame-ancestors 'none'", "script-src 'self'"],
	],
	["cross-origin-opener-policy", ["same-origin"]],
	["permissions-policy", ["camera=()", "microphone=()"]],
	["referrer-policy", ["strict-origin-when-cross-origin"]],
	["strict-transport-security", ["max-age="]],
	["x-content-type-options", ["nosniff"]],
	["x-frame-options", ["DENY"]],
]);
const injectedScriptPattern =
	/static\.cloudflareinsights\.com|cloudflareinsights|data-cf-beacon|\/cdn-cgi\/challenge-platform/i;

for (const pathname of ["/", "/docs/"]) {
	const url = new URL(pathname, origin);
	const response = await fetch(url, {
		headers: requestHeaders,
		redirect: "follow",
	});
	if (response.status !== 200) {
		failures.push(`${pathname} returned ${response.status}`);
		continue;
	}
	for (const [name, expectedParts] of requiredHeaders) {
		const value = response.headers.get(name) || "";
		for (const part of expectedParts) {
			if (!value.includes(part)) {
				failures.push(`${pathname} ${name} is missing ${JSON.stringify(part)}`);
			}
		}
	}
	const html = await response.text();
	if (injectedScriptPattern.test(html)) {
		failures.push(`${pathname} contains Cloudflare-injected client JavaScript`);
	}
}

if (failures.length) {
	throw new Error(`live-site audit failed:\n${failures.join("\n")}`);
}

console.log(`live-site audit passed for ${origin.origin}`);
