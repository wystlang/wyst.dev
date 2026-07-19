import { readFileSync } from "node:fs";

// Prism is used only by the Node documentation build. Its vocabulary comes
// from the same checked-in syntax-word catalog as the compiler and editor
// grammar; this module deliberately owns no second list of Wyst words.
const SYNTAX_WORD_CATALOG = new URL(
	"../vendor/wyst-design/syntax-words.tsv",
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

export const wystSyntaxWords = Object.freeze(
	parseSyntaxWords(readFileSync(SYNTAX_WORD_CATALOG, "utf8")).map(Object.freeze),
);

const activeWords = wystSyntaxWords.filter((word) =>
	ACTIVE_STATES.has(word.state),
);

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

const HASH_OPERATIONS = alternatives(
	spellings(
		(word) =>
			word.classification === "unshadowable" && word.spelling.startsWith("#"),
	),
);
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
				["return-type", "type", "type-constructor"].includes(position),
			),
	),
);
const TYPE_DECLARATION_WORDS = activeAlternatives(
	["bitstruct", "enum", "register_map", "struct", "trap_frame"],
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
		string: {
			pattern: /"""[\s\S]*?"""|"(?:\\.|[^"\\\n])*"/,
			greedy: true,
		},
		char: {
			pattern:
				/'(?:\\x[0-9A-Fa-f]{2}|\\['\\ntr0]|[\x00-\x09\x0B\x0C\x0E-\x26\x28-\x5B\x5D-\x7F])'/,
			greedy: true,
		},
		"class-name": {
			pattern: TYPE_DECLARATION_PATTERN,
			lookbehind: true,
			alias: "type",
		},
		function: [
			{
				pattern: /(\bfn\s+)[A-Za-z_][A-Za-z0-9_]*/,
				lookbehind: true,
			},
			// Canonical calls and method calls exclude sigil-prefixed names and a
			// dotted expression whose head is the reserved alias word.
			/(?<![#%])(?<!as\.)\b[A-Za-z_][A-Za-z0-9_]*(?=\s*(?:<(?:[^<>\n]|<[^<>\n]*>)*>\s*)?\()/,
		],
		directive: {
			pattern: DIRECTIVE_PATTERN,
			alias: "macro",
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
		// Longest spellings first. Only the final v0.9 separator, postfix, and
		// statement-boundary vocabulary is present.
		punctuation: /\.\.<|\.\.=|\.\.|[{}[\](),.]/,
		operator:
			/&&=|\|\|=|%%=|&\^=|<<=|>>=|->|==|!=|<=|>=|<<|>>|&&|\|\||&\^|%%|\+=|-=|\*=|\/=|%=|&=|\|=|\^=|[-+*/%&|^~!<>=]|[@?:]/,
	};

	// `text` and `peg` fences intentionally fall back to escaped plain text.
	if (!Prism.languages.text) Prism.languages.text = {};
}
