import { lookup } from "node:dns/promises";
import { readFile, readdir, stat } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const siteOrigin = new URL(process.env.WYST_SITE_ORIGIN ?? "https://wyst.dev");
const timeoutMs = integerSetting("WYST_EXTERNAL_LINK_TIMEOUT_MS", 10_000, 1);
const retries = integerSetting("WYST_EXTERNAL_LINK_RETRIES", 2, 0);
const retryDelayMs = integerSetting(
	"WYST_EXTERNAL_LINK_RETRY_DELAY_MS",
	1_000,
	0,
);
const concurrency = integerSetting("WYST_EXTERNAL_LINK_CONCURRENCY", 4, 1);
const userAgent =
	process.env.WYST_EXTERNAL_LINK_USER_AGENT ??
	"wyst.dev-external-link-audit/1.0 (+https://wyst.dev/)";
const privateTestOrigin =
	process.env.NODE_TEST_CONTEXT && process.env.WYST_EXTERNAL_LINK_TEST_ORIGIN
		? new URL(process.env.WYST_EXTERNAL_LINK_TEST_ORIGIN).origin
		: null;
const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const maxRedirects = 5;

function integerSetting(name, fallback, minimum) {
	const raw = process.env[name];
	if (raw === undefined) return fallback;
	const value = Number(raw);
	if (!Number.isSafeInteger(value) || value < minimum) {
		throw new Error(`${name} must be an integer greater than or equal to ${minimum}`);
	}
	return value;
}

function parseArgs(argv) {
	const roots = [];
	for (let index = 0; index < argv.length; index++) {
		if (argv[index] === "--root" && argv[index + 1]) {
			roots.push(path.resolve(argv[++index]));
			continue;
		}
		throw new Error(`unknown argument: ${argv[index]}`);
	}
	return {
		roots:
			roots.length > 0
				? roots
				: [path.join(projectRoot, "index.html"), path.join(projectRoot, "dist")],
	};
}

async function htmlFiles(input) {
	const metadata = await stat(input);
	if (metadata.isFile()) return input.endsWith(".html") ? [input] : [];
	if (!metadata.isDirectory()) return [];

	const files = [];
	for (const entry of await readdir(input, { withFileTypes: true })) {
		const fullPath = path.join(input, entry.name);
		if (entry.isDirectory()) files.push(...(await htmlFiles(fullPath)));
		else if (entry.isFile() && entry.name.endsWith(".html")) files.push(fullPath);
	}
	return files;
}

function decodeHtml(value) {
	return value.replace(
		/&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi,
		(entity) => {
			const named = {
				"&amp;": "&",
				"&quot;": '"',
				"&apos;": "'",
				"&lt;": "<",
				"&gt;": ">",
			};
			const lower = entity.toLowerCase();
			if (named[lower]) return named[lower];
			const hex = lower.startsWith("&#x");
			const codePoint = Number.parseInt(
				entity.slice(hex ? 3 : 2, -1),
				hex ? 16 : 10,
			);
			return Number.isFinite(codePoint)
				? String.fromCodePoint(codePoint)
				: entity;
		},
	);
}

function attributesFromTag(tag) {
	const attributes = new Map();
	for (const match of tag.matchAll(
		/\b([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g,
	)) {
		attributes.set(
			match[1].toLowerCase(),
			decodeHtml(match[2] ?? match[3] ?? match[4] ?? ""),
		);
	}
	return attributes;
}

function lineNumberAt(source, offset) {
	let line = 1;
	for (let index = 0; index < offset; index++) {
		if (source.charCodeAt(index) === 10) line++;
	}
	return line;
}

function networkReferences(html) {
	const references = [];
	for (const match of html.matchAll(/<[^>]+>/g)) {
		const attributes = attributesFromTag(match[0]);
		for (const name of [
			"href",
			"src",
			"poster",
			"action",
			"formaction",
			"data",
			"cite",
		]) {
			if (attributes.has(name)) {
				references.push({ value: attributes.get(name), offset: match.index });
			}
		}
		if (attributes.has("srcset")) {
			for (const candidate of attributes.get("srcset").split(",")) {
				const value = candidate.trim().split(/\s+/, 1)[0];
				if (value) references.push({ value, offset: match.index });
			}
		}
	}
	return references;
}

function externalUrl(rawValue) {
	const value = rawValue.trim();
	if (!value) return null;
	let url;
	try {
		url = new URL(value, siteOrigin);
	} catch {
		return null;
	}
	if (!/^https?:$/.test(url.protocol) || url.origin === siteOrigin.origin) {
		return null;
	}
	url.hash = "";
	return url;
}

function sleep(milliseconds) {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function retryAfterMilliseconds(value) {
	if (!value) return null;
	const seconds = Number(value);
	if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
	const date = Date.parse(value);
	if (!Number.isFinite(date)) return null;
	return Math.max(0, date - Date.now());
}

function ipv4Number(address) {
	const parts = address.split(".");
	if (
		parts.length !== 4 ||
		parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)
	) {
		return null;
	}
	return parts.reduce((value, part) => (value << 8n) | BigInt(part), 0n);
}

function inPrefix(value, base, bits, width) {
	const shift = BigInt(width - bits);
	return value >> shift === base >> shift;
}

function isPublicIpv4(address) {
	const value = ipv4Number(address);
	if (value === null) return false;
	const blocked = [
		["0.0.0.0", 8],
		["10.0.0.0", 8],
		["100.64.0.0", 10],
		["127.0.0.0", 8],
		["169.254.0.0", 16],
		["172.16.0.0", 12],
		["192.0.0.0", 24],
		["192.0.2.0", 24],
		["192.88.99.0", 24],
		["192.168.0.0", 16],
		["198.18.0.0", 15],
		["198.51.100.0", 24],
		["203.0.113.0", 24],
		["224.0.0.0", 4],
		["240.0.0.0", 4],
	];
	return !blocked.some(([base, bits]) =>
		inPrefix(value, ipv4Number(base), bits, 32),
	);
}

function ipv6Number(address) {
	let source = address.replace(/^\[|\]$/g, "").split("%", 1)[0].toLowerCase();
	if (source.includes(".")) {
		const lastColon = source.lastIndexOf(":");
		const ipv4 = ipv4Number(source.slice(lastColon + 1));
		if (ipv4 === null) return null;
		source = `${source.slice(0, lastColon)}:${(ipv4 >> 16n).toString(16)}:${(
			ipv4 & 0xffffn
		).toString(16)}`;
	}
	if ((source.match(/::/g) ?? []).length > 1) return null;
	const [leftSource, rightSource] = source.split("::");
	const left = leftSource ? leftSource.split(":") : [];
	const right = rightSource ? rightSource.split(":") : [];
	const omitted = 8 - left.length - right.length;
	if (omitted < 0 || (!source.includes("::") && omitted !== 0)) return null;
	const words = [...left, ...Array(omitted).fill("0"), ...right];
	if (
		words.length !== 8 ||
		words.some((word) => !/^[0-9a-f]{1,4}$/.test(word))
	) {
		return null;
	}
	return words.reduce((value, word) => (value << 16n) | BigInt(`0x${word}`), 0n);
}

function isPublicIpv6(address) {
	const value = ipv6Number(address);
	if (value === null) return false;
	const mappedBase = ipv6Number("::ffff:0:0");
	if (inPrefix(value, mappedBase, 96, 128)) {
		const ipv4 = [24n, 16n, 8n, 0n]
			.map((shift) => Number((value >> shift) & 0xffn))
			.join(".");
		return isPublicIpv4(ipv4);
	}
	const blocked = [
		["::", 96],
		["64:ff9b::", 96],
		["64:ff9b:1::", 48],
		["100::", 64],
		["2001::", 32],
		["2001:2::", 48],
		["2001:10::", 28],
		["2001:20::", 28],
		["2001:db8::", 32],
		["2002::", 16],
		["fc00::", 7],
		["fe80::", 10],
		["ff00::", 8],
	];
	return !blocked.some(([base, bits]) =>
		inPrefix(value, ipv6Number(base), bits, 128),
	);
}

function isPublicAddress(address, family = isIP(address)) {
	if (family === 4) return isPublicIpv4(address);
	if (family === 6) return isPublicIpv6(address);
	return false;
}

async function lookupWithTimeout(hostname) {
	let timer;
	try {
		return await Promise.race([
			lookup(hostname, { all: true, verbatim: true }),
			new Promise((_, reject) => {
				timer = setTimeout(
					() => reject(new Error(`DNS lookup timed out for ${hostname}`)),
					timeoutMs,
				);
			}),
		]);
	} finally {
		clearTimeout(timer);
	}
}

async function destinationAddresses(url) {
	const allowPrivateTestDestination = privateTestOrigin === url.origin;
	if (!/^https?:$/.test(url.protocol)) {
		throw new Error(`blocked non-HTTP redirect destination ${url.href}`);
	}
	if (url.username || url.password) {
		throw new Error(`blocked URL containing credentials ${url.href}`);
	}
	const expectedPort = url.protocol === "https:" ? "443" : "80";
	if (url.port && url.port !== expectedPort && !allowPrivateTestDestination) {
		throw new Error(`blocked nonstandard port in ${url.href}`);
	}

	const hostname = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
	if (
		/^(?:localhost|.*\.localhost)$/i.test(hostname) &&
		!allowPrivateTestDestination
	) {
		throw new Error(`blocked localhost destination ${url.href}`);
	}
	const literalFamily = isIP(hostname);
	const addresses = literalFamily
		? [{ address: hostname, family: literalFamily }]
		: await lookupWithTimeout(hostname);
	if (!addresses.length) throw new Error(`DNS returned no addresses for ${hostname}`);
	for (const address of addresses) {
		if (
			!allowPrivateTestDestination &&
			!isPublicAddress(address.address, address.family)
		) {
			throw new Error(
				`blocked non-public address ${address.address} for ${hostname}`,
			);
		}
	}
	return addresses.sort((left, right) => left.family - right.family);
}

function requestAddress(url, method, destination) {
	const transport = url.protocol === "https:" ? httpsRequest : httpRequest;
	return new Promise((resolve, reject) => {
		const request = transport(
			url,
			{
				method,
				family: destination.family,
				autoSelectFamily: false,
				headers: {
					Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
					...(method === "GET" ? { Range: "bytes=0-0" } : {}),
					"User-Agent": userAgent,
				},
				lookup(_hostname, _options, callback) {
					callback(null, destination.address, destination.family);
				},
			},
			(response) => {
				const result = {
					status: response.statusCode ?? 0,
					location: response.headers.location,
					retryAfter: response.headers["retry-after"],
				};
				response.destroy();
				resolve(result);
			},
		);
		request.setTimeout(timeoutMs, () => {
			request.destroy(new Error(`request timed out for ${url.href}`));
		});
		request.once("error", reject);
		request.end();
	});
}

async function request(url, method) {
	let current = new URL(url);
	const visited = new Set();
	for (let redirect = 0; redirect <= maxRedirects; redirect++) {
		if (visited.has(current.href)) {
			throw new Error(`redirect loop at ${current.href}`);
		}
		visited.add(current.href);
		const addresses = await destinationAddresses(current);
		let result;
		let lastError;
		for (const destination of addresses) {
			try {
				result = await requestAddress(current, method, destination);
				break;
			} catch (error) {
				lastError = error;
			}
		}
		if (!result) throw lastError ?? new Error(`could not reach ${current.href}`);
		if (!redirectStatuses.has(result.status) || !result.location) {
			return { ...result, finalUrl: current.href };
		}
		if (redirect === maxRedirects) {
			throw new Error(`too many redirects from ${url}`);
		}
		current = new URL(result.location, current);
	}
	throw new Error(`too many redirects from ${url}`);
}

async function probe(url) {
	let lastResult;
	let lastError;
	for (let attempt = 0; attempt <= retries; attempt++) {
		try {
			let result = await request(url, "HEAD");
			// Some otherwise healthy servers do not implement HEAD, or apply bot
			// policy to it differently. Confirm ordinary errors with a bounded GET.
			if (
				result.status >= 400 &&
				result.status !== 429 &&
				result.status < 500
			) {
				result = await request(url, "GET");
			}
			lastResult = result;
			lastError = undefined;
			if (result.status >= 200 && result.status < 400) {
				return { outcome: "ok", ...result };
			}
			if (![408, 425, 429].includes(result.status) && result.status < 500) {
				break;
			}
		} catch (error) {
			lastError = error;
			lastResult = undefined;
		}

		if (attempt < retries) {
			const requestedDelay = retryAfterMilliseconds(lastResult?.retryAfter);
			const delay = Math.min(
				30_000,
				requestedDelay ?? retryDelayMs * 2 ** attempt,
			);
			await sleep(delay);
		}
	}

	if (lastResult && [401, 403, 406, 429, 451].includes(lastResult.status)) {
		return { outcome: "inconclusive", ...lastResult };
	}
	if (lastResult && [404, 410].includes(lastResult.status)) {
		return { outcome: "broken", ...lastResult };
	}
	if (lastResult) return { outcome: "unreachable", ...lastResult };
	return {
		outcome: "unreachable",
		error:
			lastError instanceof Error ? lastError.message : String(lastError ?? "unknown error"),
	};
}

function displayPath(file) {
	const relative = path.relative(projectRoot, file);
	return relative.startsWith("..") ? file : relative;
}

async function collectLinks(roots) {
	const files = [...new Set((await Promise.all(roots.map(htmlFiles))).flat())].sort();
	if (files.length === 0) throw new Error("no HTML files found to audit");

	const links = new Map();
	let referenceCount = 0;
	for (const file of files) {
		const html = await readFile(file, "utf8");
		for (const reference of networkReferences(html)) {
			const url = externalUrl(reference.value);
			if (!url) continue;
			referenceCount++;
			const key = url.href;
			if (!links.has(key)) links.set(key, []);
			links
				.get(key)
				.push(`${displayPath(file)}:${lineNumberAt(html, reference.offset)}`);
		}
	}
	return { files, links, referenceCount };
}

async function checkWithConcurrency(entries) {
	const results = new Array(entries.length);
	let nextIndex = 0;
	async function worker() {
		while (true) {
			const index = nextIndex++;
			if (index >= entries.length) return;
			const [url] = entries[index];
			results[index] = await probe(url);
		}
	}
	await Promise.all(
		Array.from({ length: Math.min(concurrency, entries.length) }, worker),
	);
	return results;
}

const { roots } = parseArgs(process.argv.slice(2));
const audit = await collectLinks(roots);
const entries = [...audit.links.entries()].sort(([left], [right]) =>
	left.localeCompare(right),
);
const results = await checkWithConcurrency(entries);
const failures = [];
let inconclusive = 0;

for (let index = 0; index < entries.length; index++) {
	const [url, sources] = entries[index];
	const result = results[index];
	const sourceLabel = sources.join(", ");
	if (result.outcome === "ok") continue;
	if (result.outcome === "inconclusive") {
		inconclusive++;
		console.warn(
			`inconclusive external link (${result.status}): ${url} [${sourceLabel}]`,
		);
		continue;
	}
	const detail = result.status
		? `HTTP ${result.status}${result.finalUrl && result.finalUrl !== url ? ` at ${result.finalUrl}` : ""}`
		: result.error;
	failures.push(`${url}: ${detail} [${sourceLabel}]`);
}

if (failures.length > 0) {
	throw new Error(`external-link audit failed:\n${failures.join("\n")}`);
}

console.log(
	`external-link audit passed: ${entries.length} unique URL(s) across ${audit.referenceCount} reference(s) in ${audit.files.length} HTML file(s); ${inconclusive} inconclusive`,
);
