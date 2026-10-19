// Prism grammars for Wyst source and layout files. The word lists come
// from the compiler: `KEYWORDS` in `wync/src/lex.rs`, `BUILTIN_NAMES` in
// `wync/src/check.rs`, and the layout words in `wync/src/layout.rs`. When
// the compiler changes a list, change it here.

export const KEYWORDS = [
	"import", "pub", "fn", "struct", "enum", "interface", "const", "var",
	"if", "else", "for", "break", "continue", "return", "match", "goto",
	"mut", "xfer", "linear", "asm",
];

export const BUILTIN_TYPES = [
	"bool", "u8", "u16", "u32", "u64", "i64", "string", "never", "Result",
	"Option",
];

export const BUILTIN_FUNCTIONS = [
	"len", "size_of", "align_of", "field_offset", "static_assert", "trap",
	"load", "store", "truncate", "widen", "bitcast",
];

const words = (list) => new RegExp(`\\b(?:${list.join("|")})\\b`);
const NUMBER = /\b(?:0x[\dA-Fa-f_]+|0b[01_]+|\d[\d_]*)\b/;

export function registerWyst(Prism) {
	Prism.languages.wyst = {
		comment: /\/\/.*/,
		string: { pattern: /"(?:\\.|[^"\\\n])*"/, greedy: true },
		// A character literal, such as `'q'` or `'\n'`, is an integer.
		char: { pattern: /'(?:\\x[\dA-Fa-f]{2}|\\.|[^'\\\n])'/, greedy: true, alias: "number" },
		attribute: {
			pattern: /#\[[^\]\n]*\]/,
			alias: "macro",
			inside: { number: NUMBER, punctuation: /[(),.]/ },
		},
		// `.Some` and `.16K` name a variant. A `.` after a name or a call
		// is a field or a method, not a variant.
		variant: {
			pattern: /(^|[^\w).\]])\.[A-Za-z0-9_]+/,
			lookbehind: true,
			alias: "constant",
		},
		number: NUMBER,
		// `in` and `at` have a meaning only in some positions, but they read
		// as keywords where they occur.
		keyword: words([...KEYWORDS, "in", "at"]),
		boolean: /\b(?:true|false)\b/,
		builtin: [words(BUILTIN_TYPES), /\bu(?:[1-5]\d|6[0-4]|[1-9])\b/],
		"builtin-function": {
			pattern: words(BUILTIN_FUNCTIONS),
			alias: "function",
		},
		function: /\b[A-Za-z_]\w*(?=\()/,
		// Names in capitals, such as register fields, are constants. Other
		// names that start with a capital are types.
		constant: /\b[A-Z][A-Z0-9_]*\b/,
		"class-name": /\b[A-Z]\w*\b/,
		"address-qualifier": /@/,
		operator: /\.\.[<=]|->|<<=?|>>=?|[-+*/%&|^]=?|[=!<>]=?|&&|\|\||[~?]/,
		punctuation: /[{}[\]();,.:]/,
	};

	Prism.languages.layout = {
		comment: /\/\/.*/,
		section: {
			pattern: /(^|[^\w])\.[A-Za-z_][\w.]*/,
			lookbehind: true,
			alias: "property",
		},
		number: NUMBER,
		keyword: words([
			"entry", "region", "section", "symbol", "at", "size", "in", "after",
			"align",
		]),
		constant: {
			pattern: /(:\s*)(?:readonly|readwrite|code|rodata|data|bss)\b/,
			lookbehind: true,
		},
		builtin: /\bu64\b/,
		function: /\b(?:start|end)(?=\()/,
		operator: /=/,
		punctuation: /[():.]/,
	};
}
