import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const homeScript = await readFile(
	new URL("../assets/home.js", import.meta.url),
	"utf8",
);
const source = "/*\n* QEMU `virt`\n*\n*/\nfn hello() {\n  uart_write('h')\n}";
const copiedSource =
	"/*\n * QEMU `virt`\n *\n */\nfn hello() {\n  uart_write('h')\n}";

function copyFixture({ clipboard, execCommand = () => false } = {}) {
	const listeners = new Map();
	const paneListeners = new Map();
	const timers = [];
	const buffers = [];
	const windowListeners = new Map();
	const button = {
		dataset: { copyTarget: "uart-source" },
		disabled: false,
		textContent: "copy",
		addEventListener(type, listener) {
			listeners.set(type, listener);
		},
		getAttribute(name) {
			return name === "aria-describedby" ? "uart-copy-status" : null;
		},
	};
	const target = {
		textContent: source,
		querySelectorAll(selector) {
			assert.equal(selector, ".block-comment-line");
			return ["* QEMU `virt`", "*", "*/"].map((textContent) => ({
				textContent,
			}));
		},
	};
	const status = { textContent: "" };
	const viewport = {
		dataset: {},
	};
	const pane = {
		clientHeight: 100,
		parentElement: viewport,
		scrollHeight: 300,
		scrollTop: 0,
		addEventListener(type, listener, options) {
			paneListeners.set(type, { listener, options });
		},
	};
	const document = {
		body: {
			append(buffer) {
				buffers.push(buffer);
			},
		},
		createElement(name) {
			assert.equal(name, "textarea");
			const attributes = new Map();
			return {
				attributes,
				className: "",
				removed: false,
				selected: false,
				selection: null,
				value: "",
				remove() {
					this.removed = true;
				},
				select() {
					this.selected = true;
				},
				setAttribute(attribute, value) {
					attributes.set(attribute, value);
				},
				setSelectionRange(start, end) {
					this.selection = [start, end];
				},
			};
		},
		execCommand,
		getElementById(id) {
			if (id === "uart-source") return target;
			if (id === "uart-copy-status") return status;
			return null;
		},
		querySelectorAll(selector) {
			if (selector === "[data-copy-target]") return [button];
			if (selector === ".source-viewport > pre") return [pane];
			assert.fail(`unexpected selector: ${selector}`);
		},
	};
	const window = {
		addEventListener(type, listener, options) {
			windowListeners.set(type, { listener, options });
		},
	};

	vm.runInNewContext(homeScript, {
		clearTimeout() {},
		document,
		navigator: { clipboard },
		setTimeout(callback, delay) {
			timers.push({ callback, delay });
			return timers.length;
		},
		window,
	});

	return {
		buffers,
		button,
		listeners,
		pane,
		paneListeners,
		status,
		timers,
		viewport,
		windowListeners,
	};
}

test("homepage scroll cue fades within the first two scroll steps", () => {
	const fixture = copyFixture();
	const opacity = () => Number(fixture.viewport.dataset.scrollCue) / 8;
	const scroll = fixture.paneListeners.get("scroll");
	assert.ok(scroll);
	assert.equal(scroll.options.passive, true);
	assert.equal(opacity(), 1);

	fixture.pane.scrollTop = 48;
	scroll.listener();
	assert.equal(opacity(), 0.5);

	fixture.pane.scrollTop = 96;
	scroll.listener();
	assert.equal(opacity(), 0);

	fixture.pane.scrollTop = 0;
	scroll.listener();
	assert.equal(opacity(), 1);

	fixture.pane.scrollHeight = fixture.pane.clientHeight;
	fixture.windowListeners.get("resize").listener();
	assert.equal(opacity(), 0, "a non-scrolling pane should not show the cue");
});

test("homepage copy control writes only the source text", async () => {
	let copied = "";
	const fixture = copyFixture({
		clipboard: {
			async writeText(text) {
				copied = text;
			},
		},
	});

	await fixture.listeners.get("click")();
	assert.equal(copied, copiedSource);
	assert.doesNotMatch(copied, /scroll for more|main\.wyst|source ↗/i);
	assert.equal(fixture.buffers.length, 0);
	assert.equal(fixture.button.textContent, "copied");
	assert.equal(fixture.button.dataset.copyState, "success");
	assert.equal(fixture.button.disabled, false);
	assert.equal(fixture.status.textContent, "Code copied to clipboard.");
	const resetTimer = fixture.timers.find(({ delay }) => delay === 2_000);
	assert.ok(resetTimer);

	resetTimer.callback();
	assert.equal(fixture.button.textContent, "copy");
	assert.equal(fixture.button.dataset.copyState, undefined);
	assert.equal(fixture.status.textContent, "");
});

test("homepage copy control falls back when Clipboard API is unavailable", async () => {
	let stagedBuffer;
	const fixture = copyFixture({
		execCommand(command) {
			assert.equal(command, "copy");
			stagedBuffer = fixture.buffers.at(-1);
			return true;
		},
	});

	await fixture.listeners.get("click")();
	assert.equal(stagedBuffer.value, copiedSource);
	assert.equal(stagedBuffer.attributes.get("data-clipboard-buffer"), "");
	assert.equal(stagedBuffer.selected, true);
	assert.deepEqual(stagedBuffer.selection, [0, copiedSource.length]);
	assert.equal(stagedBuffer.removed, true);
	assert.equal(fixture.button.dataset.copyState, "success");
	assert.equal(fixture.status.textContent, "Code copied to clipboard.");
});
