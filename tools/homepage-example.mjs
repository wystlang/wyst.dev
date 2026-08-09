import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const HOMEPAGE_INDEX_PATH = path.join(ROOT, "index.html");

function fixturePath(relativePath) {
	return path.join(ROOT, "tests", "fixtures", "wyst", ...relativePath.split("/"));
}

export const HOMEPAGE_EXAMPLES = Object.freeze({
	uart: Object.freeze({
		artifactPath: path.join(
			ROOT,
			"vendor",
			"wyst-homepage-semantic-tokens.json",
		),
		outputCodeId: "uart-output",
		outputSourcePath:
			"wync/tests/fixtures/qemu/virt/uart-hello/expected.txt",
		outputPath: fixturePath(
			"wync/tests/fixtures/qemu/virt/uart-hello/expected.txt",
		),
		regionEnd: "<!-- homepage-semantic-example:end -->",
		regionStart: "<!-- homepage-semantic-example:start -->",
		scrollHintId: "uart-scroll-hint",
		sourceAriaLabel: "Wyst UART source",
		sourceCodeId: "uart-source",
		sourcePath: "wync/tests/fixtures/qemu/virt/uart-hello/main.wyst",
	}),
	overflow: Object.freeze({
		artifactPath: path.join(
			ROOT,
			"vendor",
			"wyst-homepage-overflow-semantic-tokens.json",
		),
		outputCodeId: "overflow-output",
		outputSourcePath:
			"wync/tests/fixtures/qemu/virt/overflow-guard/expected.txt",
		outputPath: fixturePath(
			"wync/tests/fixtures/qemu/virt/overflow-guard/expected.txt",
		),
		regionEnd: "<!-- homepage-overflow-semantic-example:end -->",
		regionStart: "<!-- homepage-overflow-semantic-example:start -->",
		scrollHintId: "overflow-scroll-hint",
		sourceAriaLabel: "Wyst overflow source",
		sourceCodeId: "overflow-source",
		sourceLineRange: Object.freeze([48, 60]),
		sourcePath: "wync/tests/fixtures/qemu/virt/overflow-guard/main.wyst",
	}),
	effects: Object.freeze({
		artifactPath: path.join(
			ROOT,
			"vendor",
			"wyst-homepage-effects-semantic-tokens.json",
		),
		outputCodeId: "effects-output",
		outputSourcePath:
			"wync/tests/fixtures/diagnostics/core/effect-denial/expected.stderr",
		outputPath: fixturePath(
			"wync/tests/fixtures/diagnostics/core/effect-denial/expected.stderr",
		),
		regionEnd: "<!-- homepage-effects-semantic-example:end -->",
		regionStart: "<!-- homepage-effects-semantic-example:start -->",
		scrollHintId: "effects-scroll-hint",
		sourceAriaLabel: "Wyst denied-effects source",
		sourceCodeId: "effects-source",
		sourceLineRange: Object.freeze([7, 12]),
		sourcePath:
			"wync/tests/fixtures/diagnostics/core/effect-denial/src/keyboard_isr.wyst",
	}),
});

export const HOMEPAGE_SOURCE_PATH = HOMEPAGE_EXAMPLES.uart.sourcePath;
export const HOMEPAGE_ARTIFACT_PATH = HOMEPAGE_EXAMPLES.uart.artifactPath;
export const HOMEPAGE_OUTPUT_PATH = HOMEPAGE_EXAMPLES.uart.outputPath;
export const HOMEPAGE_REGION_START = HOMEPAGE_EXAMPLES.uart.regionStart;
export const HOMEPAGE_REGION_END = HOMEPAGE_EXAMPLES.uart.regionEnd;

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
	const semanticTokens = decodeSemanticData(source, legend, data);

	return {
		data: encodeSemanticData(semanticTokens),
		document: {
			sha256: sha256(source),
			text: source,
		},
		generator: TOKEN_GENERATOR,
		legend: {
			tokenModifiers: [...legend.tokenModifiers],
			tokenTypes: [...legend.tokenTypes],
		},
		schema: 2,
		source: {
			gitCommit: sourceCommit?.toLowerCase() ?? null,
			path: sourcePath,
			sha256: sha256(source),
		},
	};
}

export async function captureHomepageSemanticArtifact({
	sourceCommit = null,
	sourcePath = HOMEPAGE_SOURCE_PATH,
	wystRoot,
}) {
	const absoluteSourcePath = path.join(wystRoot, ...sourcePath.split("/"));
	const source = await readFile(absoluteSourcePath, "utf8");
	const capture = runWyncLsp({ source, sourcePath: absoluteSourcePath, wystRoot });
	return createHomepageSemanticArtifact({
		...capture,
		source,
		sourceCommit,
		sourcePath,
	});
}

function validateArtifact(artifact, expectedSourcePath) {
	if (!artifact || typeof artifact !== "object" || artifact.schema !== 2) {
		throw new Error("unsupported homepage semantic-token artifact");
	}
	if (artifact.generator !== TOKEN_GENERATOR) {
		throw new Error("homepage semantic-token artifact has an unexpected generator");
	}
	if (
		typeof artifact.source?.path !== "string" ||
		!artifact.source.path.endsWith(".wyst") ||
		artifact.source.path.includes("..") ||
		(expectedSourcePath && artifact.source.path !== expectedSourcePath)
	) {
		throw new Error("homepage semantic-token artifact names the wrong source fixture");
	}
	assertFullCommit(artifact.source?.gitCommit);
	if (!/^[0-9a-f]{64}$/.test(artifact.source?.sha256 ?? "")) {
		throw new Error("homepage semantic-token artifact has an invalid source hash");
	}
	if (
		typeof artifact.document?.text !== "string" ||
		artifact.document.sha256 !== sha256(artifact.document.text) ||
		artifact.document.sha256 !== artifact.source.sha256
	) {
		throw new Error("homepage semantic-token artifact has invalid document metadata");
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
	decodeSemanticData(artifact.document.text, artifact.legend, artifact.data);
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
			if (close === -1) throw new Error("homepage source contains an unterminated block comment");
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
		artifact.document.text,
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

function sourceRangeOffsets(source, sourceLineRange) {
	if (sourceLineRange === undefined) return { end: source.length, start: 0 };
	if (
		!Array.isArray(sourceLineRange) ||
		sourceLineRange.length !== 2 ||
		sourceLineRange.some((line) => !Number.isSafeInteger(line) || line < 1) ||
		sourceLineRange[0] > sourceLineRange[1]
	) {
		throw new Error("homepage source line range must be two ordered positive integers");
	}
	const starts = lineStarts(source);
	const lineCount = source.endsWith("\n") ? starts.length - 1 : starts.length;
	const [startLine, endLine] = sourceLineRange;
	if (endLine > lineCount) {
		throw new Error("homepage source line range exceeds its source fixture");
	}
	return {
		end: endLine < starts.length ? starts[endLine] : source.length,
		start: starts[startLine - 1],
	};
}

export function homepageExampleSource(inputArtifact, sourceLineRange) {
	const artifact = validateArtifact(inputArtifact);
	const { end, start } = sourceRangeOffsets(
		artifact.document.text,
		sourceLineRange,
	);
	return artifact.document.text.slice(start, end);
}

export function renderHomepageSemanticMarkup(inputArtifact, sourceLineRange) {
	const artifact = validateArtifact(inputArtifact);
	const source = artifact.document.text;
	const range = sourceRangeOffsets(source, sourceLineRange);
	const spans = [...commentSpans(source), ...semanticSpans(artifact)]
		.sort((left, right) => left.start - right.start || left.end - right.end)
		.filter((span) => {
			const overlaps = span.end > range.start && span.start < range.end;
			if (
				overlaps &&
				(span.start < range.start || span.end > range.end)
			) {
				throw new Error("homepage source line range splits a highlight span");
			}
			return overlaps;
		});
	let offset = range.start;
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
	return output + escapeHtml(source.slice(offset, range.end));
}

export function generatedHomepageRegion(
	markup,
	example = HOMEPAGE_EXAMPLES.uart,
) {
	return `<pre aria-label="${example.sourceAriaLabel}" aria-describedby="${example.scrollHintId}" tabindex="0"><code id="${example.sourceCodeId}">${markup}</code></pre>`;
}

function replaceGeneratedRegion(indexHtml, region, example) {
	const start = indexHtml.indexOf(example.regionStart);
	const end = indexHtml.indexOf(example.regionEnd);
	if (start === -1 || end === -1 || start >= end) {
		throw new Error(
			`index.html has no ordered homepage ${example.sourceCodeId} semantic-example region`,
		);
	}
	if (
		indexHtml.indexOf(example.regionStart, start + 1) !== -1 ||
		indexHtml.indexOf(example.regionEnd, end + 1) !== -1
	) {
		throw new Error(
			`index.html has more than one homepage ${example.sourceCodeId} semantic-example region`,
		);
	}
	const startEnd = start + example.regionStart.length;
	const indentation = indexHtml.slice(indexHtml.lastIndexOf("\n", start) + 1, start);
	return (
		indexHtml.slice(0, startEnd) +
		`\n${indentation}${region}\n${indentation}` +
		indexHtml.slice(end)
	);
}

export function updateHomepageIndex(indexHtml, artifactOrArtifacts) {
	const artifacts = artifactOrArtifacts?.schema
		? { uart: artifactOrArtifacts }
		: artifactOrArtifacts;
	let updated = indexHtml;
	for (const [id, artifact] of Object.entries(artifacts ?? {})) {
		const example = HOMEPAGE_EXAMPLES[id];
		if (!example) throw new Error(`unknown homepage example '${id}'`);
		validateArtifact(artifact, example.sourcePath);
		updated = replaceGeneratedRegion(
			updated,
			generatedHomepageRegion(
				renderHomepageSemanticMarkup(artifact, example.sourceLineRange),
				example,
			),
			example,
		);
	}
	return updated;
}

function replaceHomepageOutput(indexHtml, output, example) {
	const open = `<code id="${example.outputCodeId}">`;
	const close = "</code></pre>";
	const start = indexHtml.indexOf(open);
	if (start === -1 || indexHtml.indexOf(open, start + 1) !== -1) {
		throw new Error(
			`index.html must contain one ${example.outputCodeId} output block`,
		);
	}
	const contentStart = start + open.length;
	const end = indexHtml.indexOf(close, contentStart);
	if (end === -1) {
		throw new Error(`index.html has an unterminated ${example.outputCodeId} block`);
	}
	const terminalOutput = output.replace(/\r\n/g, "\n").replace(/\n$/, "");
	return (
		indexHtml.slice(0, contentStart) +
		escapeHtml(terminalOutput) +
		indexHtml.slice(end)
	);
}

export function updateHomepageOutputs(indexHtml, outputs) {
	let updated = indexHtml;
	for (const [id, output] of Object.entries(outputs ?? {})) {
		const example = HOMEPAGE_EXAMPLES[id];
		if (!example) throw new Error(`unknown homepage example '${id}'`);
		updated = replaceHomepageOutput(updated, output, example);
	}
	return updated;
}

export function updateHomepageTerminalOutput(indexHtml, output) {
	return replaceHomepageOutput(indexHtml, output, HOMEPAGE_EXAMPLES.uart);
}

export async function readHomepageSemanticArtifact(
	artifactPath = HOMEPAGE_ARTIFACT_PATH,
	sourcePath = HOMEPAGE_SOURCE_PATH,
) {
	return validateArtifact(
		JSON.parse(await readFile(artifactPath, "utf8")),
		sourcePath,
	);
}

export async function readHomepageSemanticArtifacts() {
	return Object.fromEntries(
		await Promise.all(
			Object.entries(HOMEPAGE_EXAMPLES).map(async ([id, example]) => [
				id,
				await readHomepageSemanticArtifact(
					example.artifactPath,
					example.sourcePath,
				),
			]),
		),
	);
}

export async function verifyHomepageExample({
	indexPath = HOMEPAGE_INDEX_PATH,
} = {}) {
	const [artifacts, indexHtml, outputEntries] = await Promise.all([
		readHomepageSemanticArtifacts(),
		readFile(indexPath, "utf8"),
		Promise.all(
			Object.entries(HOMEPAGE_EXAMPLES).map(async ([id, example]) => [
				id,
				await readFile(example.outputPath, "utf8"),
			]),
		),
	]);
	const expected = updateHomepageOutputs(
		updateHomepageIndex(indexHtml, artifacts),
		Object.fromEntries(outputEntries),
	);
	if (expected !== indexHtml) {
		throw new Error(
			"homepage examples differ from their compiler artifacts; run npm run sync:wyst",
		);
	}
	return artifacts;
}

export async function writeHomepageExample({
	artifact,
	id = "uart",
	artifactPath,
	indexPath = HOMEPAGE_INDEX_PATH,
}) {
	const example = HOMEPAGE_EXAMPLES[id];
	if (!example) throw new Error(`unknown homepage example '${id}'`);
	validateArtifact(artifact, example.sourcePath);
	const indexHtml = await readFile(indexPath, "utf8");
	await Promise.all([
		writeFile(
			artifactPath ?? example.artifactPath,
			`${JSON.stringify(artifact, null, 2)}\n`,
		),
		writeFile(indexPath, updateHomepageIndex(indexHtml, { [id]: artifact })),
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
	console.log("homepage examples match their captured wync artifacts");
}
