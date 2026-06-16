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
			/\b(?:as|bitfield|break|case|continue|else|enum|goto|if|label|loop|repeat|return|select|struct|switch|while)\b/,
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
		// call sites: ident immediately followed by '(' (keywords already consumed above)
		function: /\b[a-zA-Z_]\w*(?=\s*\()/,
		// :: declaration, -> return arrow, %% floored mod, shifts, compound + comparison
		operator: /::|->|%%|<<|>>|&&|\|\||[-+*/%&|^~!<>=]=?|[@:]/,
		punctuation: /[{}[\]();,.]/,
	};

	// alias so ```text / ```peg fences fall back to a no-op grammar (plain, escaped)
	if (!Prism.languages.text) Prism.languages.text = {};
}
