import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import MarkdownIt from "markdown-it";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultGuide = path.join(root, "content/guides/effective-wyst.md");

export function extractExamples(markdown, filename) {
	const lines = markdown.split(/\r?\n/);
	const examples = [];
	for (const token of new MarkdownIt().parse(markdown, {})) {
		if (token.type !== "fence" || token.info.trim() !== "wyst") continue;
		const line = token.map[0] + 1;
		const location = `${filename}:${line}`;
		const closing = lines[token.map[1] - 1]?.trim() || "";
		if (
			closing.length < token.markup.length ||
			![...closing].every((character) => character === token.markup[0])
		) {
			throw new Error(`${location}: unterminated Wyst fence`);
		}
		const modules = [...token.content.matchAll(/^module[ \t]+([^\r\n]+)$/gm)];
		const module = modules[0]?.[1].trim();
		if (
			modules.length !== 1 ||
			!/^[_A-Za-z][_A-Za-z0-9]*(?:\.[_A-Za-z][_A-Za-z0-9]*)*$/.test(module || "")
		) {
			throw new Error(`${location}: expected one complete module declaration`);
		}
		examples.push({ source: token.content, module, location });
	}
	if (!examples.length) throw new Error(`${filename}: no Wyst examples found`);
	return examples;
}

function runCompiler(wync, args, location) {
	const result = spawnSync(wync, args, {
		encoding: "utf8",
		timeout: 30_000,
	});
	if (result.error || result.status !== 0) {
		const detail = result.error?.message ||
			result.stderr.trim() || result.stdout.trim() ||
			`exit ${result.status}, signal ${result.signal}`;
		throw new Error(`${location}: wync ${args[0]} failed\n${detail}`);
	}
	return result.stdout;
}

export async function verifyGuides({ wync, files }) {
	const { sourceCommit } = JSON.parse(
		await readFile(path.join(root, "vendor/wyst-snapshot.json"), "utf8"),
	);
	const versionOutput = runCompiler(wync, ["--version"], "compiler identity");
	let version;
	try {
		version = JSON.parse(versionOutput);
	} catch {
		throw new Error("wync --version must return JSON with name and sourceId");
	}
	if (
		!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(sourceCommit) ||
		version.name !== "wync" || version.sourceId !== sourceCommit
	) {
		throw new Error(
			`compiler sourceId ${version.sourceId || "missing"} does not match ` +
			`the Wyst snapshot ${sourceCommit}`,
		);
	}
	const examples = [];
	for (const file of files) {
		examples.push(...extractExamples(await readFile(file, "utf8"), file));
	}
	const temporary = await mkdtemp(path.join(os.tmpdir(), "wyst-guide-examples-"));
	try {
		for (const [index, example] of examples.entries()) {
			const project = path.join(temporary, String(index + 1));
			const source = path.join(project, "src", `${example.module.replaceAll(".", "/")}.wyst`);
			await mkdir(path.dirname(source), { recursive: true });
			await writeFile(source, example.source);
			await writeFile(path.join(project, "wyst.project"), `project "guide-example" {
  source_root "src"
  default docs

  static_library docs for "qemu-virt-aarch64-el2" {
    root ${example.module}
    output "build/libdocs.a"
    companion "build/libdocs.wystlib"
    debug .none
    unwind .none
    frame_pointers .minimal
  }
}
`);
			runCompiler(wync, ["fmt", source, "--check"], example.location);
			runCompiler(wync, ["check", project], example.location);
			runCompiler(wync, ["build", project], example.location);
		}
	} finally {
		await rm(temporary, { recursive: true, force: true });
	}
	return { count: examples.length, sourceCommit };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try {
		let wync = process.env.WYST_WYNC_BIN || "wync";
		const files = [];
		const args = process.argv.slice(2);
		for (let index = 0; index < args.length; index++) {
			if (args[index] === "--wync" && args[index + 1]) {
				wync = args[++index];
			} else if (args[index].startsWith("-")) {
				throw new Error("usage: verify-guide-examples.mjs [--wync PATH] [GUIDE.md ...]");
			} else {
				files.push(path.resolve(args[index]));
			}
		}
		const result = await verifyGuides({
			wync,
			files: files.length ? files : [defaultGuide],
		});
		console.log(
			`validated ${result.count} Wyst modules: format, semantics, and static-library construction ` +
			`(compiler ${result.sourceCommit})`,
		);
	} catch (error) {
		console.error(error.message);
		process.exitCode = 1;
	}
}
