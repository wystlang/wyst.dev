import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

export const coreFixturePaths = [
	"wync/tests/fixtures/qemu/virt/uart-hello/main.wyst",
	"wync/tests/fixtures/qemu/virt/uart-hello/layout.wyst",
	"wync/tests/fixtures/qemu/virt/uart-hello/expected.txt",
	"wync/tests/fixtures/qemu/virt/overflow-guard/main.wyst",
	"wync/tests/fixtures/qemu/virt/overflow-guard/layout.wyst",
	"wync/tests/fixtures/qemu/virt/overflow-guard/expected.txt",
	"wync/tests/fixtures/diagnostics/core/effect-denial/wyst.project",
	"wync/tests/fixtures/diagnostics/core/effect-denial/layout.wyst",
	"wync/tests/fixtures/diagnostics/core/effect-denial/src/keyboard_isr.wyst",
	"wync/tests/fixtures/diagnostics/core/effect-denial/expected.stderr",
	"wync/tests/fixtures/runtime/semihost.wyst",
];

export const syntaxCorpusRoot = "wync/tests/fixtures/syntax-corpus";

export const vocabularyCatalogs = [
	"attribute-catalog.tsv",
	"meta-operation-catalog.tsv",
	"syntax-words.tsv",
];

export const designCatalogs = [
	...vocabularyCatalogs,
	"c-interactive-adapter-catalog.tsv",
].map((destination) => ({
	destination,
	source: `design/catalogs/language/${destination}`,
}));

export async function walkFiles(directory, relativeDirectory = "") {
	const entries = await readdir(path.join(directory, relativeDirectory), {
		withFileTypes: true,
	});
	entries.sort((left, right) =>
		left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
	);
	const files = [];
	for (const entry of entries) {
		const relative = relativeDirectory
			? path.posix.join(relativeDirectory, entry.name)
			: entry.name;
		if (entry.isDirectory()) files.push(...(await walkFiles(directory, relative)));
		else if (entry.isFile()) files.push(relative);
		else throw new Error(`unsupported Wyst snapshot entry: ${relative}`);
	}
	return files;
}

export async function publicReferencePaths(wystRoot, designFileNames) {
	const sourcePaths = new Set();
	let publishesAdrs = false;
	for (const file of designFileNames) {
		const markdown = await readFile(path.join(wystRoot, "design", file), "utf8");
		for (const match of markdown.matchAll(/\]\(([^)\s]+)\)/g)) {
			const href = match[1].split("#", 1)[0];
			if (/^catalogs\/[\w./-]+\.(?:md|json|tsv|jsonl\.gz)$/.test(href)) {
				sourcePaths.add(path.posix.join("design", href));
			} else if (href === "../docs/adr/") {
				publishesAdrs = true;
			}
		}
	}
	if (publishesAdrs) {
		for (const file of await walkFiles(path.join(wystRoot, "docs", "adr"))) {
			sourcePaths.add(path.posix.join("docs", "adr", file));
		}
	}
	return [...sourcePaths].sort();
}

export function referenceDestination(source) {
	return source.replace(/^design\//, "");
}
