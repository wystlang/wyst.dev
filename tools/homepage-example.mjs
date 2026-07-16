import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const HOMEPAGE_SOURCE_PATH =
	"wync/tests/fixtures/qemu/virt/uart-hello/main.wyst";
export const HOMEPAGE_ARTIFACT_PATH = path.join(
	ROOT,
	"vendor",
	"wyst-homepage-semantic-tokens.json",
);
export const HOMEPAGE_INDEX_PATH = path.join(ROOT, "index.html");
export const HOMEPAGE_REGION_START =
	"<!-- homepage-semantic-example:start -->";
export const HOMEPAGE_REGION_END = "<!-- homepage-semantic-example:end -->";

const EXCERPT_START_MARKER = "// homepage-example:start";
const EXCERPT_END_MARKER = "// homepage-example:end";
const TOKEN_GENERATOR = "wync-lsp-semanticTokens/full";
const LSP_HEADER_END = Buffer.from("\r\n\r\n");

function sha256(value) {
	return createHash("sha256").update(value).digest("hex");
}

function assertFullCommit(value) {
	if (value !== null && !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(value)) {
		throw new Error("homepage token source commit must be null or a full Git object ID");
	}
}

function lineStarts(source) {
	const starts = [0];
	for (let offset = source.indexOf("\n"); offset !== -1; offset = source.indexOf("\n", offset + 1)) {
		starts.push(offset + 1);
	}
	return starts;
}

function lineForOffset(starts, offset) {
	let low = 0;
	let high = starts.length;
	while (low + 1 < high) {
		const middle = Math.floor((low + high) / 2);
		if (starts[middle] <= offset) low = middle;
		else high = middle;
	}
	return low;
}

export function extractHomepageExcerpt(source) {
	const startMarker = source.indexOf(EXCERPT_START_MARKER);
	const endMarker = source.indexOf(EXCERPT_END_MARKER);
	if (startMarker === -1 || endMarker === -1 || startMarker >= endMarker) {
		throw new Error(
			`homepage source must contain ordered ${EXCERPT_START_MARKER} and ${EXCERPT_END_MARKER} markers`,
		);
	}
	if (source.indexOf(EXCERPT_START_MARKER, startMarker + 1) !== -1) {
		throw new Error(`homepage source contains more than one ${EXCERPT_START_MARKER}`);
	}
	if (source.indexOf(EXCERPT_END_MARKER, endMarker + 1) !== -1) {
		throw new Error(`homepage source contains more than one ${EXCERPT_END_MARKER}`);
	}

	const markerLineEnd = source.indexOf("\n", startMarker);
	if (markerLineEnd === -1) throw new Error("homepage start marker has no following source line");
	let start = markerLineEnd + 1;
	let end = source.lastIndexOf("\n", endMarker - 1) + 1;
	while (start < end && (source[start] === "\r" || source[start] === "\n")) start++;
	while (end > start && (source[end - 1] === "\r" || source[end - 1] === "\n")) end--;

	const starts = lineStarts(source);
	return {
		end,
		start,
		startLine: lineForOffset(starts, start),
		text: source.slice(start, end),
	};
}

function lspFrame(message) {
	const body = Buffer.from(JSON.stringify(message));
	return Buffer.concat([
		Buffer.from(`Content-Length: ${body.byteLength}\r\n\r\n`),
		body,
	]);
}

function parseLspFrames(output) {
	const messages = [];
	let offset = 0;
	while (offset < output.byteLength) {
		const headerEnd = output.indexOf(LSP_HEADER_END, offset);
		if (headerEnd === -1) {
			throw new Error("wync LSP output ended before a complete header");
		}
		const header = output.subarray(offset, headerEnd).toString("ascii");
		const lengthMatch = header.match(/(?:^|\r\n)Content-Length:\s*(\d+)(?:\r\n|$)/i);
		if (!lengthMatch) throw new Error("wync LSP response is missing Content-Length");
		const length = Number.parseInt(lengthMatch[1], 10);
		const bodyStart = headerEnd + LSP_HEADER_END.byteLength;
		const bodyEnd = bodyStart + length;
		if (!Number.isSafeInteger(length) || length < 0 || bodyEnd > output.byteLength) {
			throw new Error("wync LSP response has an invalid Content-Length");
		}
		messages.push(JSON.parse(output.subarray(bodyStart, bodyEnd).toString("utf8")));
		offset = bodyEnd;
	}
	return messages;
}

function runWyncLsp({ source, sourcePath, wystRoot }) {
	const uri = pathToFileURL(sourcePath).href;
	const requests = [
		{
			jsonrpc: "2.0",
			id: 1,
			method: "initialize",
			params: {
				capabilities: {},
				processId: null,
				rootUri: pathToFileURL(wystRoot).href,
			},
		},
		{ jsonrpc: "2.0", method: "initialized", params: {} },
		{
			jsonrpc: "2.0",
			method: "textDocument/didOpen",
			params: {
				textDocument: {
					languageId: "wyst",
					text: source,
					uri,
					version: 1,
				},
			},
		},
		{
			jsonrpc: "2.0",
			id: 2,
			method: "textDocument/semanticTokens/full",
			params: { textDocument: { uri } },
		},
		{ jsonrpc: "2.0", id: 3, method: "shutdown", params: null },
		{ jsonrpc: "2.0", method: "exit", params: null },
	];
	const input = Buffer.concat(requests.map(lspFrame));

	const testBinary =
		process.env.NODE_ENV === "test" ? process.env.WYST_TEST_WYNC_BIN : undefined;
	const command = testBinary || "cargo";
	const args = testBinary
		? ["lsp"]
		: [
				"run",
				"--quiet",
				"--locked",
				"--manifest-path",
				path.join(wystRoot, "wync", "Cargo.toml"),
				"--",
				"lsp",
			];
	const result = spawnSync(command, args, {
		cwd: wystRoot,
		input,
		maxBuffer: 16 * 1024 * 1024,
	});
	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error(
			`wync lsp failed with status ${result.status}:\n${result.stderr?.toString("utf8") || result.stdout?.toString("utf8") || "no output"}`,
		);
	}

	const messages = parseLspFrames(result.stdout);
	const initialize = messages.find((message) => message.id === 1);
	const semanticTokens = messages.find((message) => message.id === 2);
	for (const [label, message] of [
		["initialize", initialize],
		["semantic token", semanticTokens],
	]) {
		if (!message) throw new Error(`wync LSP did not return the ${label} response`);
		if (message.error) {
			throw new Error(`wync LSP ${label} request failed: ${JSON.stringify(message.error)}`);
		}
	}

	const legend = initialize.result?.capabilities?.semanticTokensProvider?.legend;
	const data = semanticTokens.result?.data;
	if (!legend || !Array.isArray(legend.tokenTypes) || !Array.isArray(legend.tokenModifiers)) {
		throw new Error("wync LSP initialize response has no semantic-token legend");
	}
	if (!Array.isArray(data)) throw new Error("wync LSP semantic-token response has no data array");
	return { data, legend };
}

function decodeSemanticData(source, legend, data) {
	if (data.length % 5 !== 0) {
		throw new Error("semantic-token data length must be divisible by five");
	}
	const starts = lineStarts(source);
	const tokens = [];
	let line = 0;
	let character = 0;
	for (let index = 0; index < data.length; index += 5) {
		const [deltaLine, deltaStart, length, typeIndex, modifierBits] = data.slice(
			index,
			index + 5,
		);
		for (const value of [deltaLine, deltaStart, length, typeIndex, modifierBits]) {
			if (!Number.isSafeInteger(value) || value < 0) {
				throw new Error("semantic-token data contains a non-negative-integer violation");
			}
		}
		line += deltaLine;
		character = deltaLine === 0 ? character + deltaStart : deltaStart;
		if (line >= starts.length || typeIndex >= legend.tokenTypes.length || length === 0) {
			throw new Error("semantic-token data points outside its source or legend");
		}
		const start = starts[line] + character;
		const end = start + length;
		const lineEnd = source.indexOf("\n", starts[line]);
		if (end > (lineEnd === -1 ? source.length : lineEnd)) {
			throw new Error("semantic token crosses a source line");
		}
		tokens.push({ character, end, length, line, modifierBits, start, typeIndex });
	}
	return tokens;
}

function encodeSemanticData(tokens) {
	const data = [];
	let previousLine = 0;
	let previousCharacter = 0;
	for (const [index, token] of tokens.entries()) {
		const deltaLine = index === 0 ? token.line : token.line - previousLine;
		const deltaStart =
			index === 0 || deltaLine > 0
				? token.character
				: token.character - previousCharacter;
		if (deltaLine < 0 || deltaStart < 0) {
			throw new Error("semantic tokens are not ordered by source position");
		}
		data.push(
			deltaLine,
			deltaStart,
			token.length,
			token.typeIndex,
			token.modifierBits,
		);
		previousLine = token.line;
		previousCharacter = token.character;
	}
	return data;
}

export function createHomepageSemanticArtifact({
	data,
	legend,
	source,
	sourceCommit = null,
	sourcePath = HOMEPAGE_SOURCE_PATH,
}) {
	assertFullCommit(sourceCommit);
	const excerpt = extractHomepageExcerpt(source);
	const semanticTokens = decodeSemanticData(source, legend, data);
	const excerptTokens = [];
	for (const token of semanticTokens) {
		if (token.end <= excerpt.start || token.start >= excerpt.end) continue;
		if (token.start < excerpt.start || token.end > excerpt.end) {
			throw new Error("semantic token crosses a homepage excerpt marker");
		}
		excerptTokens.push({
			...token,
			character: token.character,
			line: token.line - excerpt.startLine,
		});
	}

	return {
		data: encodeSemanticData(excerptTokens),
		excerpt: {
			endMarker: EXCERPT_END_MARKER,
			sha256: sha256(excerpt.text),
			startMarker: EXCERPT_START_MARKER,
			text: excerpt.text,
		},
		generator: TOKEN_GENERATOR,
		legend: {
			tokenModifiers: [...legend.tokenModifiers],
			tokenTypes: [...legend.tokenTypes],
		},
		schema: 1,
		source: {
			gitCommit: sourceCommit?.toLowerCase() ?? null,
			path: sourcePath,
			sha256: sha256(source),
		},
	};
}

export async function captureHomepageSemanticArtifact({
	sourceCommit = null,
	wystRoot,
}) {
	const sourcePath = path.join(wystRoot, ...HOMEPAGE_SOURCE_PATH.split("/"));
	const source = await readFile(sourcePath, "utf8");
	const capture = runWyncLsp({ source, sourcePath, wystRoot });
	return createHomepageSemanticArtifact({
		...capture,
		source,
		sourceCommit,
	});
}

function validateArtifact(artifact) {
	if (!artifact || typeof artifact !== "object" || artifact.schema !== 1) {
		throw new Error("unsupported homepage semantic-token artifact");
	}
	if (artifact.generator !== TOKEN_GENERATOR) {
		throw new Error("homepage semantic-token artifact has an unexpected generator");
	}
	if (artifact.source?.path !== HOMEPAGE_SOURCE_PATH) {
		throw new Error("homepage semantic-token artifact names the wrong source fixture");
	}
	assertFullCommit(artifact.source?.gitCommit);
	if (!/^[0-9a-f]{64}$/.test(artifact.source?.sha256 ?? "")) {
		throw new Error("homepage semantic-token artifact has an invalid source hash");
	}
	if (
		artifact.excerpt?.startMarker !== EXCERPT_START_MARKER ||
		artifact.excerpt?.endMarker !== EXCERPT_END_MARKER ||
		typeof artifact.excerpt?.text !== "string" ||
		artifact.excerpt.sha256 !== sha256(artifact.excerpt.text)
	) {
		throw new Error("homepage semantic-token artifact has invalid excerpt metadata");
	}
	for (const [name, values] of [
		["token type", artifact.legend?.tokenTypes],
		["token modifier", artifact.legend?.tokenModifiers],
	]) {
		if (
			!Array.isArray(values) ||
			values.some((value) => typeof value !== "string" || !/^[A-Za-z][A-Za-z0-9]*$/.test(value))
		) {
			throw new Error(`homepage semantic-token legend has an invalid ${name}`);
		}
	}
	if (!Array.isArray(artifact.data)) {
		throw new Error("homepage semantic-token artifact has no data array");
	}
	decodeSemanticData(artifact.excerpt.text, artifact.legend, artifact.data);
	return artifact;
}

function escapeHtml(value) {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}

// LSP semantic tokens intentionally omit trivia. Comments get one presentation
// class here; language-bearing categories still come only from the wync stream.
function commentSpans(source) {
	const spans = [];
	for (let offset = 0; offset < source.length; ) {
		if (source.startsWith("//", offset)) {
			const end = source.indexOf("\n", offset);
			spans.push({
				className: "source-comment",
				end: end === -1 ? source.length : end,
				start: offset,
			});
			offset = end === -1 ? source.length : end;
			continue;
		}
		if (source.startsWith("/*", offset)) {
			const close = source.indexOf("*/", offset + 2);
			if (close === -1) throw new Error("homepage excerpt contains an unterminated block comment");
			const end = close + 2;
			let lineStart = offset;
			let continuation = false;
			while (lineStart < end) {
				const newline = source.indexOf("\n", lineStart);
				const lineEnd = newline === -1 || newline >= end ? end : newline;
				if (lineEnd > lineStart) {
					spans.push({
						className: continuation
							? "source-comment block-comment-line"
							: "source-comment",
						end: lineEnd,
						start: lineStart,
					});
				}
				if (lineEnd === end) break;
				lineStart = lineEnd + 1;
				continuation = true;
			}
			offset = end;
			continue;
		}
		if (source[offset] === "'" || source[offset] === '"') {
			const quote = source[offset++];
			const triple = quote === '"' && source.startsWith('""', offset);
			if (triple) offset += 2;
			while (offset < source.length) {
				if (source[offset] === "\\") {
					offset += 2;
					continue;
				}
				if (triple ? source.startsWith('"""', offset) : source[offset] === quote) {
					offset += triple ? 3 : 1;
					break;
				}
				offset++;
			}
			continue;
		}
		offset++;
	}
	return spans;
}

function semanticSpans(artifact) {
	return decodeSemanticData(
		artifact.excerpt.text,
		artifact.legend,
		artifact.data,
	).map((token) => {
		const modifiers = artifact.legend.tokenModifiers.filter(
			(_modifier, index) => (token.modifierBits & 2 ** index) !== 0,
		);
		const knownModifierBits = 2 ** artifact.legend.tokenModifiers.length - 1;
		if ((token.modifierBits & ~knownModifierBits) !== 0) {
			throw new Error("semantic token uses a modifier absent from its legend");
		}
		return {
			end: token.end,
			modifiers,
			start: token.start,
			type: artifact.legend.tokenTypes[token.typeIndex],
		};
	});
}

export function renderHomepageSemanticMarkup(inputArtifact) {
	const artifact = validateArtifact(inputArtifact);
	const source = artifact.excerpt.text;
	const spans = [...commentSpans(source), ...semanticSpans(artifact)].sort(
		(left, right) => left.start - right.start || left.end - right.end,
	);
	let offset = 0;
	let output = "";
	for (const span of spans) {
		if (span.start < offset) throw new Error("homepage highlight spans overlap");
		output += escapeHtml(source.slice(offset, span.start));
		const contents = escapeHtml(source.slice(span.start, span.end));
		if (span.type) {
			const modifiers = span.modifiers.length
				? ` data-token-modifiers="${span.modifiers.join(" ")}"`
				: "";
			output += `<span data-token="${span.type}"${modifiers}>${contents}</span>`;
		} else {
			output += `<span class="${span.className}">${contents}</span>`;
		}
		offset = span.end;
	}
	return output + escapeHtml(source.slice(offset));
}

export function generatedHomepageRegion(markup) {
	return `<pre aria-label="Wyst UART source" aria-describedby="uart-scroll-hint" tabindex="0"><code id="uart-source">${markup}</code></pre>`;
}

function replaceGeneratedRegion(indexHtml, region) {
	const start = indexHtml.indexOf(HOMEPAGE_REGION_START);
	const end = indexHtml.indexOf(HOMEPAGE_REGION_END);
	if (start === -1 || end === -1 || start >= end) {
		throw new Error("index.html has no ordered homepage semantic-example region");
	}
	if (
		indexHtml.indexOf(HOMEPAGE_REGION_START, start + 1) !== -1 ||
		indexHtml.indexOf(HOMEPAGE_REGION_END, end + 1) !== -1
	) {
		throw new Error("index.html has more than one homepage semantic-example region");
	}
	const startEnd = start + HOMEPAGE_REGION_START.length;
	const indentation = indexHtml.slice(indexHtml.lastIndexOf("\n", start) + 1, start);
	return (
		indexHtml.slice(0, startEnd) +
		`\n${indentation}${region}\n${indentation}` +
		indexHtml.slice(end)
	);
}

export function updateHomepageIndex(indexHtml, artifact) {
	return replaceGeneratedRegion(
		indexHtml,
		generatedHomepageRegion(renderHomepageSemanticMarkup(artifact)),
	);
}

export async function readHomepageSemanticArtifact(
	artifactPath = HOMEPAGE_ARTIFACT_PATH,
) {
	return validateArtifact(JSON.parse(await readFile(artifactPath, "utf8")));
}

export async function verifyHomepageExample({
	artifactPath = HOMEPAGE_ARTIFACT_PATH,
	indexPath = HOMEPAGE_INDEX_PATH,
} = {}) {
	const [artifact, indexHtml] = await Promise.all([
		readHomepageSemanticArtifact(artifactPath),
		readFile(indexPath, "utf8"),
	]);
	const expected = updateHomepageIndex(indexHtml, artifact);
	if (expected !== indexHtml) {
		throw new Error(
			"homepage source markup differs from the compiler semantic-token artifact; run npm run sync:wyst",
		);
	}
	return artifact;
}

export async function writeHomepageExample({
	artifact,
	artifactPath = HOMEPAGE_ARTIFACT_PATH,
	indexPath = HOMEPAGE_INDEX_PATH,
}) {
	validateArtifact(artifact);
	const indexHtml = await readFile(indexPath, "utf8");
	await Promise.all([
		writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`),
		writeFile(indexPath, updateHomepageIndex(indexHtml, artifact)),
	]);
}

if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	if (process.argv.length !== 3 || process.argv[2] !== "--check") {
		throw new Error("usage: node tools/homepage-example.mjs --check");
	}
	await verifyHomepageExample();
	console.log("homepage semantic highlighting matches the captured wync token stream");
}
