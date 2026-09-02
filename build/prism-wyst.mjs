import {
	activeWystSyntaxWords,
	compilerAttributePatterns,
	compilerOperationSpellings,
	wystAttributes,
	wystSyntaxWords,
} from "./wyst-highlight-catalog.mjs";
import { COMPILER_DIRECTIVE_CATEGORY } from "./wyst-highlight-policy.mjs";

// Prism remains the safe lexical renderer for documentation fragments. Word
// ownership and compiler-directive styling come from the shared policy used by
// the homepage semantic-token renderer.
export { wystAttributes, wystSyntaxWords };

const activeWords = activeWystSyntaxWords;

function spellings(predicate) {
	return activeWords.filter(predicate).map((word) => word.spelling);
}

function escapeRegex(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function alternatives(values) {
	const unique = [...new Set(values)].sort(
		(left, right) => right.length - left.length || left.localeCompare(right),
	);
	if (unique.length === 0) {
		throw new Error("Wyst syntax-word catalog produced an empty Prism token class");
	}
	return unique.map(escapeRegex).join("|");
}

function activeAlternatives(values, role) {
	for (const value of values) {
		if (!activeWords.some((word) => word.spelling === value)) {
			throw new Error(
				`Wyst Prism ${role} spelling is not active in the catalog: ${value}`,
			);
		}
	}
	return alternatives(values);
}

const HASH_OPERATIONS = alternatives(compilerOperationSpellings);
const RESERVED_WORDS = spellings(
	(word) =>
		word.classification === "reserved" &&
		word.spelling !== "false" &&
		word.spelling !== "true",
);
const RESERVED_EXCEPT_AS = alternatives(
	RESERVED_WORDS.filter((word) => word !== "as"),
);
const BUILTIN_TYPES = alternatives(
	spellings(
		(word) =>
			word.classification === "unshadowable" &&
			word.legalPositions.some((position) =>
				[
					"interface-requirement-type",
					"return-type",
					"type",
					"type-constructor",
				].includes(position),
			),
	),
);
const TYPE_DECLARATION_WORDS = activeAlternatives(
	["bitstruct", "enum", "interface", "register_map", "struct", "trap_frame"],
	"type declaration",
);
const VARIABLE_DECLARATION_WORDS = activeAlternatives(
	["mmio", "system_register", "var"],
	"variable declaration",
);
const POINTER_QUALIFIERS = activeAlternatives(
	["volatile", "mmio"],
	"address qualifier",
);
for (const structuralWord of ["const", "fn"]) {
	activeAlternatives([structuralWord], "declaration");
}

const DIRECTIVE_PATTERN = new RegExp(`(?:${HASH_OPERATIONS})\\b`);
// A hash-prefixed invalid form must not be split into punctuation plus an
// apparently active keyword. The canonical import/linkage `as` word is also
// unavailable as the head of a dotted expression.
const KEYWORD_PATTERN = new RegExp(
	`(?<![#.%])\\b(?:(?:${RESERVED_EXCEPT_AS})|as(?!\\s*\\.))\\b`,
);
const BUILTIN_TYPE_PATTERN = new RegExp(
	`(?<![#.%])\\b(?:${BUILTIN_TYPES})\\b`,
);
const TYPE_DECLARATION_PATTERN = new RegExp(
	`(\\b(?:${TYPE_DECLARATION_WORDS})\\s+)[A-Za-z_][A-Za-z0-9_]*`,
);
const VARIABLE_DECLARATION_PATTERN = new RegExp(
	`(\\b(?:${VARIABLE_DECLARATION_WORDS})\\s+)[A-Za-z_][A-Za-z0-9_]*`,
);
const POINTER_QUALIFIER_PATTERN = new RegExp(`@(?:${POINTER_QUALIFIERS})\\b`);

// Prism is a safe lexical projection, not a parser. Context-sensitive forms
// are highlighted only where their surrounding spelling is unambiguous.
export function registerWyst(Prism) {
	Prism.languages.wyst = {
		comment: [
			{ pattern: /\/\/.*/, greedy: true },
			{ pattern: /\/\*[\s\S]*?\*\//, greedy: true },
		],
		"attribute-group": {
			pattern: compilerAttributePatterns.group,
			greedy: true,
			inside: {
				comment: [
					{ pattern: /\/\/.*/, greedy: true },
					{ pattern: /\/\*[\s\S]*?\*\//, greedy: true },
				],
				string: {
					pattern: /"""[\s\S]*?"""|"(?:\\.|[^"\\\n])*"/,
					greedy: true,
				},
				char: {
					pattern:
						/'(?:\\x[0-9A-Fa-f]{2}|\\['\\ntr0]|[\x00-\x09\x0B\x0C\x0E-\x26\x28-\x5B\x5D-\x7F])'/,
					greedy: true,
				},
				"attribute-group-punctuation": {
					pattern: compilerAttributePatterns.punctuation,
					alias: COMPILER_DIRECTIVE_CATEGORY,
				},
				"attribute-name": {
					pattern: compilerAttributePatterns.name,
					alias: COMPILER_DIRECTIVE_CATEGORY,
				},
				boolean: /\b(?:false|true)\b/,
				number: {
					pattern:
						/\b(?:0[xX][0-9A-Fa-f](?:_?[0-9A-Fa-f])*|0[bB][01](?:_?[01])*|0[oO][0-7](?:_?[0-7])*|[0-9](?:_?[0-9])*(?:\.[0-9](?:_?[0-9])*)?(?:[eE][+-]?[0-9](?:_?[0-9])*)?)\b/,
				},
				punctuation: /[(),]/,
				operator: /[-+*/%&|^~!<>=]|[@?:]/,
			},
		},
		string: {
			pattern: /"""[\s\S]*?"""|"(?:\\.|[^"\\\n])*"/,
			greedy: true,
		},
		char: {
			pattern:
				/'(?:\\x[0-9A-Fa-f]{2}|\\['\\ntr0]|[\x00-\x09\x0B\x0C\x0E-\x26\x28-\x5B\x5D-\x7F])'/,
			greedy: true,
		},
		"static-interface-header": [
			{
				pattern:
					/\binterface\s+[A-Za-z_][A-Za-z0-9_]*\s*:\s*[A-Za-z_][A-Za-z0-9_]*/,
				inside: {
					"class-name": {
						pattern: /(^interface\s+)[A-Za-z_][A-Za-z0-9_]*/,
						lookbehind: true,
						alias: "type",
					},
					"generic-bound": {
						pattern: /[A-Za-z_][A-Za-z0-9_]*$/,
						alias: "keyword",
					},
					"static-interface-keyword": {
						pattern: /^interface\b/,
						alias: "keyword",
					},
					operator: /:/,
				},
			},
			{
				pattern:
					/\bimpl\s+[A-Za-z_][A-Za-z0-9_]*\s+for\s+[A-Za-z_][A-Za-z0-9_]*(?=\s*\{)/,
				inside: {
					"class-name": [
						{
							pattern: /(^impl\s+)[A-Za-z_][A-Za-z0-9_]*/,
							lookbehind: true,
							alias: "type",
						},
						{
							pattern: /(\bfor\s+)[A-Za-z_][A-Za-z0-9_]*$/,
							lookbehind: true,
							alias: "type",
						},
					],
					"static-interface-keyword": {
						pattern: /\b(?:impl|for)\b/,
						alias: "keyword",
					},
				},
			},
		],
		"callable-contract-clause": [
			{
				pattern:
					/\b(?:effects|trusts)\s*\(\s*[A-Za-z_][A-Za-z0-9_]*(?:\s*,\s*[A-Za-z_][A-Za-z0-9_]*)*\s*,?\s*\)/,
				inside: {
					"contract-atom": {
						pattern: /\b[A-Za-z_][A-Za-z0-9_]*\b(?!\s*\()/,
						alias: "constant",
					},
					"contract-keyword": {
						pattern: /^\s*(?:effects|trusts)\b/,
						alias: "keyword",
					},
					punctuation: /[(),]/,
				},
			},
			{
				pattern:
					/\baccesses\s*\(\s*(?:(?:read|mut)\s+)?parameter\s*\(\s*[0-9]+\s*\)\s*\)/,
				inside: {
					"contract-keyword": {
						pattern: /\b(?:accesses|mut|read)\b/,
						alias: "keyword",
					},
					"contract-source": {
						pattern: /\bparameter\b/,
						alias: "function",
					},
					number: /\b[0-9]+\b/,
					punctuation: /[()]/,
				},
			},
		],
		"result-policy": {
			pattern: /\bmust_observe\b(?=\s+[A-Za-z_][A-Za-z0-9_]*)/,
			alias: "keyword",
		},
		"type-parameter": {
			pattern:
				/(\b(?:enum|fn|struct|type)\s+[A-Za-z_][A-Za-z0-9_]*\s*<\s*)[A-Za-z_][A-Za-z0-9_]*(?=\s*(?::|[,>]))/,
			lookbehind: true,
		},
		"class-name": [
			{
				pattern: TYPE_DECLARATION_PATTERN,
				lookbehind: true,
				alias: "type",
			},
			{
				pattern: /(\bimpl\s+)[A-Za-z_][A-Za-z0-9_]*/,
				lookbehind: true,
				alias: "type",
			},
			{
				pattern:
					/(\bimpl\s+[A-Za-z_][A-Za-z0-9_]*\s+for\s+)[A-Za-z_][A-Za-z0-9_]*/,
				lookbehind: true,
				alias: "type",
			},
			{
				pattern:
					/(\b[A-Za-z_][A-Za-z0-9_]*\s*:\s*)[A-Z][A-Za-z0-9_]*/,
				lookbehind: true,
				alias: "type",
			},
		],
		function: [
			{
				pattern: /(\bfn\s+)[A-Za-z_][A-Za-z0-9_]*/,
				lookbehind: true,
			},
			/\b[A-Za-z_][A-Za-z0-9_]*(?=\s*:\s*fn\s*\()/,
			// Canonical calls and method calls exclude sigil-prefixed names and a
			// dotted expression whose head is the reserved alias word.
			/(?<![#%])(?<!as\.)\b(?!fn\b)[A-Za-z_][A-Za-z0-9_]*(?=\s*(?:<(?:[^<>\n]|<[^<>\n]*>)*>\s*)?\()/,
		],
		directive: {
			pattern: DIRECTIVE_PATTERN,
			alias: COMPILER_DIRECTIVE_CATEGORY,
		},
		"address-qualifier": {
			pattern: POINTER_QUALIFIER_PATTERN,
			alias: "type",
		},
		boolean: /\b(?:false|true)\b/,
		constant: [
			{
				pattern: /(\bconst\s+)[A-Za-z_][A-Za-z0-9_]*/,
				lookbehind: true,
			},
			// Single-letter names stay unclassified because they commonly name a
			// generic type parameter.
			/\b[A-Z][A-Z0-9_]{1,}\b/,
		],
		variable: {
			pattern: VARIABLE_DECLARATION_PATTERN,
			lookbehind: true,
		},
		keyword: KEYWORD_PATTERN,
		builtin: {
			pattern: BUILTIN_TYPE_PATTERN,
			alias: "type",
		},
		number: {
			pattern:
				/\b(?:0[xX][0-9A-Fa-f](?:_?[0-9A-Fa-f])*|0[bB][01](?:_?[01])*|0[oO][0-7](?:_?[0-7])*|[0-9](?:_?[0-9])*(?:\.[0-9](?:_?[0-9])*)?(?:[eE][+-]?[0-9](?:_?[0-9])*)?)\b/,
		},
		parameter: /\b[A-Za-z_][A-Za-z0-9_]*(?=\s*:\s*(?!:|=))/,
		// Longest spellings first. Only the current separator, postfix, and
		// statement-boundary vocabulary is present.
		punctuation: /\.\.<|\.\.=|\.\.|[{}[\](),.]/,
		operator:
			/&&=|\|\|=|%%=|&\^=|<<=|>>=|->|==|!=|<=|>=|<<|>>|&&|\|\||&\^|%%|\+=|-=|\*=|\/=|%=|&=|\|=|\^=|[-+*/%&|^~!<>=]|[@?:]/,
	};

	// `text` and `peg` fences intentionally fall back to escaped plain text.
	if (!Prism.languages.text) Prism.languages.text = {};
}
