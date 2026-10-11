// The homepage: the introduction and the hello example, which is the
// files `hello.wyst` and `hello.layout` in content/home/.
// `npm run check:examples` builds the example with wync.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HOME = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../content/home");

export const EXAMPLE = { file: "hello.wyst", layout: "hello.layout" };

export function exampleSource() {
	return fs.readFileSync(path.join(HOME, EXAMPLE.file), "utf8");
}

export function exampleLayout() {
	return fs.readFileSync(path.join(HOME, EXAMPLE.layout), "utf8");
}

export function homeBody(highlight) {
	return `		<main id="main" class="home-split">
			<section class="notebook-hero" aria-labelledby="page-title">
				<h1 id="page-title">
					<img class="hero-wordmark" src="/assets/wordmark-accent.svg" width="87" height="48" alt="Wyst" />
				</h1>
				<div class="project-introduction">
					<p class="project-lede">Wyst is an experimental ARM64 language and compiler exploring whether low-level code can remain readable without hiding machine behavior or cost.</p>
					<div class="notebook-intro">
						<p>Wyst has 20 keywords. Registers, devices, and assembly are declarations that the compiler checks, and the compiler proves each array index before the program runs. It writes AArch64 machine code directly, with no LLVM.</p>
						<p>I make the language and compiler decisions. Coding agents write the implementation. Checks examine the result: compiler test fixtures, a fuzz gate, and the QEMU boot of a new kernel, built two times and compared byte for byte. The kernel is the only user of Wyst, and a feature enters the language only when the kernel needs it.</p>
						<p>My day job is building web interfaces. Wyst is where I pursue my interest in low-level programming and put my CS degree to use.</p>
						<p><a href="/docs/">Read the documentation</a> or start with <a href="/docs/hello-world/">Hello, world!</a></p>
					</div>
				</div>
				<p class="project-meta">
					<span>ARM64 only</span>
					<span>unversioned</span>
					<span>Rust bootstrap compiler</span>
					<span>no LLVM</span>
					<span>QEMU virt</span>
				</p>
			</section>
			<section class="notebook-section" aria-labelledby="example-title">
				<h2 id="example-title" class="visually-hidden">A Wyst example</h2>
				<figure class="artifact source-artifact">
					<div class="artifact-bar">
						<span>${EXAMPLE.file} · complete program</span>
						<div class="artifact-actions">
							<button class="artifact-copy" type="button" aria-label="Copy the code" aria-controls="example-source" aria-describedby="example-copy-status" data-copy-target="example-source">copy</button>
						</div>
						<span id="example-copy-status" class="visually-hidden" role="status" aria-live="polite" aria-atomic="true"></span>
					</div>
					<div class="source-viewport">
						<pre class="wyst-code" aria-label="Wyst source" aria-describedby="example-scroll-hint" tabindex="0"><code id="example-source">${highlight(exampleSource(), "wyst")}</code></pre>
						<span id="example-scroll-hint" class="source-scroll-hint">scroll for more code ↓</span>
					</div>
					<div class="artifact-output">
						<span>qemu / virt</span>
						<pre aria-label="QEMU output"><code>Hello, World!</code></pre>
					</div>
					<figcaption class="visually-hidden">A complete Wyst program and its output on QEMU.</figcaption>
				</figure>
			</section>
		</main>`;
}
