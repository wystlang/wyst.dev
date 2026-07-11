// Prism grammar for the Wyst language.
//
// Token vocabulary is taken directly from the formal grammar
// (appendix-b-grammar.md §1.1–§1.5): line/block comments, lexer keywords,
// `#` directives, `%` runtime primitives, `@` address qualifiers, built-in
// type names, and the numeric/string literal forms.
//
// Usage:  import { registerWyst } from "./prism-wyst.mjs"; registerWyst(Prism);

export function registerWyst(Prism) {
	Prism.languages.wyst = {
		comment: [
			{ pattern: /\/\/.*/, greedy: true },
			{ pattern: /\/\*[\s\S]*?\*\//, greedy: true },
		],
		string: {
			// triple-quoted multiline first, then simple strings with escapes
			pattern: /"""[\s\S]*?"""|"(?:\\.|[^"\\\n])*"/,
			greedy: true,
		},
		char: {
			pattern:
				/'(?:\\x[0-9A-Fa-f]{2}|\\['\\ntr0]|[\x00-\x09\x0B\x0C\x0E-\x26\x28-\x5B\x5D-\x7F])'/,
			greedy: true,
		},
		"class-name": {
			// Type declarations, including one level of nested generic arguments.
			pattern:
				/\b[a-zA-Z_]\w*(?=\s*(?:<(?:[^<>\n]|<[^<>\n]*>)*>\s*)?::\s*(?:(?:#[a-zA-Z_]\w*)(?:\([^\n)]*\))?\s*)*(?:bitfield|enum|struct)\b)/,
			alias: "type",
		},
		// #module, #align, #release, #exception_vector, ... (compile/layout directives)
		directive: {
			pattern: /#[a-zA-Z_]\w*/,
			alias: "macro",
		},
		// %nop(), %mrs(...), %wfe() — runtime-lowered primitives
		primitive: {
			pattern: /%[a-zA-Z_]\w*/,
			alias: "macro",
		},
		// @volatile, @u32 — address qualifiers / address types
		"address-qualifier": {
			pattern: /@[a-zA-Z_]\w*/,
			alias: "type",
		},
		keyword:
			/\b(?:as|bitfield|break|case|continue|else|enum|goto|if|is|label|loop|pub|repeat|return|select|struct|switch|while)\b/,
		function: [
			// declarations, with optional generic parameters and calling convention
			/\b[a-zA-Z_]\w*(?=\s*(?:<(?:[^<>\n]|<[^<>\n]*>)*>\s*)?::\s*(?:\[[a-zA-Z_]\w*\]\s*)?\()/,
			// ordinary and generic call sites
			/\b[a-zA-Z_]\w*(?=\s*(?:<(?:[^<>\n]|<[^<>\n]*>)*>\s*)?\()/,
		],
		boolean: /\b(?:false|true)\b/,
		// built-in types resolve in type context (not lexer keywords)
		builtin: {
			pattern: /\b(?:[iu](?:8|16|32|64)|f(?:32|64)|usize|isize|bool|string|char|void)\b/,
			alias: "type",
		},
		number: {
			pattern:
				/\b(?:0x[0-9a-fA-F](?:_?[0-9a-fA-F])*|0b[01](?:_?[01])*|0o[0-7](?:_?[0-7])*|\d(?:_?\d)*(?:\.\d(?:_?\d)*)?(?:[eE][+-]?\d(?:_?\d)*)?)\b/,
		},
		// Binding names can be recognized at declarations. References require
		// semantic information and remain ordinary identifiers.
		parameter: /\b[a-zA-Z_]\w*(?=\s*:\s*(?![:=]))/,
		variable: /\b[a-zA-Z_]\w*(?=\s*:=)/,
		// Common all-caps constants are the useful lexical subset. Single-letter
		// names stay unclassified because they are commonly generic type parameters.
		constant: /\b[A-Z][A-Z0-9_]{1,}\b/,
		// Longest spellings first so compound operators remain one token.
		operator:
			/::=|%%=|<<=|>>=|&&=|\|\|=|&\^=|::|:=|->|==|!=|<=|>=|<<|>>|&&|\|\||&\^|%%|\.\.|[-+*/%&|^~!<>=]=?|[@?:]/,
		punctuation: /[{}[\]();,.]/,
	};

	// alias so ```text / ```peg fences fall back to a no-op grammar (plain, escaped)
	if (!Prism.languages.text) Prism.languages.text = {};
}
