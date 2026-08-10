export const COMPILER_DIRECTIVE_CATEGORY = "macro";
export const COMPILER_DIRECTIVE_MODIFIERS = Object.freeze(["defaultLibrary"]);

function quotedLiteralEnd(source, start) {
	const quote = source[start];
	if (quote !== "'" && quote !== '"') return null;
	let offset = start + 1;
	const triple = quote === '"' && source.startsWith('""', offset);
	if (triple) offset += 2;
	while (offset < source.length) {
		if (source[offset] === "\\") {
			offset += 2;
			continue;
		}
		if (triple ? source.startsWith('"""', offset) : source[offset] === quote) {
			return offset + (triple ? 3 : 1);
		}
		offset++;
	}
	return source.length;
}

function commentEnd(source, start) {
	if (source.startsWith("//", start)) {
		const end = source.indexOf("\n", start);
		return end === -1 ? source.length : end;
	}
	if (!source.startsWith("/*", start)) return null;
	const close = source.indexOf("*/", start + 2);
	if (close === -1) {
		throw new Error("Wyst source contains an unterminated block comment");
	}
	return close + 2;
}

function nonCodeEnd(source, start) {
	return commentEnd(source, start) ?? quotedLiteralEnd(source, start);
}

export function compilerAttributePunctuationSpans(source) {
	const spans = [];
	const matchingDelimiter = { ")": "(", "]": "[", "}": "{" };
	for (let offset = 0; offset < source.length; ) {
		const skipped = nonCodeEnd(source, offset);
		if (skipped !== null) {
			offset = skipped;
			continue;
		}
		if (!source.startsWith("#[", offset)) {
			offset++;
			continue;
		}

		spans.push({ end: offset + 2, start: offset });
		offset += 2;
		const delimiters = [];
		let closed = false;
		while (offset < source.length) {
			const groupSkipped = nonCodeEnd(source, offset);
			if (groupSkipped !== null) {
				offset = groupSkipped;
				continue;
			}

			const character = source[offset];
			if (character === "(" || character === "[" || character === "{") {
				delimiters.push(character);
				offset++;
				continue;
			}
			if (character === "]" && delimiters.length === 0) {
				spans.push({ end: offset + 1, start: offset });
				offset++;
				closed = true;
				break;
			}
			if (matchingDelimiter[character]) {
				if (delimiters.at(-1) === matchingDelimiter[character]) delimiters.pop();
				offset++;
				continue;
			}
			if (character === "," && delimiters.length === 0) {
				spans.push({ end: offset + 1, start: offset });
			}
			offset++;
		}
		if (!closed) {
			throw new Error("Wyst source contains an unterminated attribute group");
		}
	}
	return spans;
}
