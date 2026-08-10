import { readFileSync } from "node:fs";

const SYNTAX_WORD_CATALOG = new URL(
	"../vendor/wyst-design/syntax-words.tsv",
	import.meta.url,
);
const ATTRIBUTE_CATALOG = new URL(
	"../vendor/wyst-design/attribute-catalog.tsv",
	import.meta.url,
);
const ACTIVE_STATES = new Set(["implemented", "implemented-normative"]);

function parseSyntaxWords(text) {
	return text
		.split("\n")
		.filter((line) => line !== "" && !line.startsWith("//"))
		.map((line) => {
			const fields = line.split("\t");
			if (fields.length !== 5) {
				throw new Error(`invalid Wyst syntax-word catalog row: ${line}`);
			}
			const [spelling, classification, owner, legalPositions, state] = fields;
			if (!spelling || !classification || !owner || !legalPositions || !state) {
				throw new Error(`invalid Wyst syntax-word catalog row: ${line}`);
			}
			return {
				classification,
				legalPositions: legalPositions.split("|"),
				owner: owner.split("|"),
				spelling,
				state,
			};
		});
}

function parseAttributes(text) {
	return text
		.split("\n")
		.filter((line) => line !== "" && !line.startsWith("//"))
		.map((line) => {
			const [spelling, state] = line.split("\t");
			if (!spelling || !state) {
				throw new Error(`invalid Wyst attribute catalog row: ${line}`);
			}
			return { spelling, state };
		});
}

export const wystSyntaxWords = Object.freeze(
	parseSyntaxWords(readFileSync(SYNTAX_WORD_CATALOG, "utf8")).map(Object.freeze),
);
export const wystAttributes = Object.freeze(
	parseAttributes(readFileSync(ATTRIBUTE_CATALOG, "utf8")).map(Object.freeze),
);
export const activeWystSyntaxWords = Object.freeze(
	wystSyntaxWords.filter((word) => ACTIVE_STATES.has(word.state)),
);
export const activeWystAttributes = Object.freeze(
	wystAttributes.filter((attribute) => ACTIVE_STATES.has(attribute.state)),
);

function escapeRegex(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function alternatives(values, label) {
	const unique = [...new Set(values)].sort(
		(left, right) => right.length - left.length || left.localeCompare(right),
	);
	if (unique.length === 0) {
		throw new Error(`Wyst ${label} catalog produced no active spellings`);
	}
	return unique.map(escapeRegex).join("|");
}

export const compilerOperationSpellings = Object.freeze(
	activeWystSyntaxWords
		.filter(
			(word) =>
				word.classification === "unshadowable" && word.spelling.startsWith("#"),
		)
		.map((word) => word.spelling),
);
export const compilerAttributeSpellings = Object.freeze(
	activeWystAttributes.map((attribute) => attribute.spelling),
);

const attributeNames = alternatives(
	compilerAttributeSpellings,
	"compiler-attribute",
);

// Prism consumes these safe lexical projections. The semantic homepage uses
// the delimiter-aware scanner in wyst-highlight-policy.mjs.
function matchCompilerAttributeGroup(source, startIndex = 0) {
	const start = source.indexOf("#[", startIndex);
	if (start < 0) {
		return null;
	}

	let index = start + 2;
	while (index < source.length) {
		if (source.startsWith("/*", index)) {
			const end = source.indexOf("*/", index + 2);
			if (end < 0) {
				return null;
			}
			index = end + 2;
			continue;
		}
		if (source.startsWith('"""', index)) {
			const end = source.indexOf('"""', index + 3);
			if (end < 0) {
				return null;
			}
			index = end + 3;
			continue;
		}
		if (source[index] === '"') {
			index += 1;
			while (index < source.length) {
				if (source[index] === "\\") {
					index += 2;
					continue;
				}
				if (source[index] === '"') {
					index += 1;
					break;
				}
				if (source[index] === "\n") {
					return null;
				}
				index += 1;
			}
			continue;
		}
		if (source[index] === "'") {
			index += 1;
			while (index < source.length) {
				if (source[index] === "\\") {
					index += 2;
					continue;
				}
				if (source[index] === "'") {
					index += 1;
					break;
				}
				if (source[index] === "\n") {
					return null;
				}
				index += 1;
			}
			continue;
		}
		if (source[index] === "]") {
			return { index: start, 0: source.slice(start, index + 1) };
		}
		index += 1;
	}

	return null;
}

export const compilerAttributePatterns = Object.freeze({
	group: { exec: (source) => matchCompilerAttributeGroup(source) },
	name: new RegExp(`\\b(?:${attributeNames})\\b`),
	punctuation: new RegExp(
		`^#\\[|,(?=\\s*(?:${attributeNames})\\b)|\\]$`,
	),
});
