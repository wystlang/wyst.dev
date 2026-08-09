import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const homeScript = await readFile(
	new URL("../assets/home.js", import.meta.url),
	"utf8",
);

function tabsFixture() {
	const panels = new Map();
	const tabs = ["uart", "overflow", "effects"].map((id, index) => {
		const listeners = new Map();
		const attributes = new Map([
			["aria-controls", `${id}-panel`],
			["aria-selected", String(index === 0)],
		]);
		const viewport = { dataset: {} };
		const pane = {
			clientHeight: 100,
			parentElement: viewport,
			scrollHeight: 200,
			scrollTop: 0,
			addEventListener() {},
		};
		panels.set(`${id}-panel`, {
			hidden: index !== 0,
			querySelector(selector) {
				assert.equal(selector, ".source-viewport > pre");
				return pane;
			},
		});
		return {
			focused: false,
			listeners,
			tabIndex: index === 0 ? 0 : -1,
			addEventListener(type, listener) {
				listeners.set(type, listener);
			},
			focus() {
				this.focused = true;
			},
			getAttribute(name) {
				return attributes.get(name) ?? null;
			},
			setAttribute(name, value) {
				attributes.set(name, value);
			},
		};
	});

	const document = {
		getElementById(id) {
			return panels.get(id) ?? null;
		},
		querySelectorAll(selector) {
			if (selector === '[role="tab"][data-example-tab]') return tabs;
			if (selector === ".source-viewport > pre") {
				return [...panels.values()].map((panel) =>
					panel.querySelector(".source-viewport > pre"),
				);
			}
			if (selector === "[data-copy-target]") return [];
			assert.fail(`unexpected selector: ${selector}`);
		},
	};

	vm.runInNewContext(homeScript, {
		document,
		window: { addEventListener() {} },
	});

	return { panels, tabs };
}

function keyEvent(key) {
	return {
		key,
		prevented: false,
		preventDefault() {
			this.prevented = true;
		},
	};
}

test("homepage tabs expose one panel and support roving keyboard focus", () => {
	const fixture = tabsFixture();
	const [uart, overflow, effects] = fixture.tabs;

	overflow.listeners.get("click")();
	assert.equal(uart.getAttribute("aria-selected"), "false");
	assert.equal(overflow.getAttribute("aria-selected"), "true");
	assert.equal(fixture.panels.get("uart-panel").hidden, true);
	assert.equal(fixture.panels.get("overflow-panel").hidden, false);

	const end = keyEvent("End");
	overflow.listeners.get("keydown")(end);
	assert.equal(end.prevented, true);
	assert.equal(effects.getAttribute("aria-selected"), "true");
	assert.equal(effects.tabIndex, 0);
	assert.equal(effects.focused, true);
	assert.equal(fixture.panels.get("effects-panel").hidden, false);

	const wrap = keyEvent("ArrowRight");
	effects.listeners.get("keydown")(wrap);
	assert.equal(uart.getAttribute("aria-selected"), "true");
	assert.equal(uart.focused, true);
	assert.equal(fixture.panels.get("uart-panel").hidden, false);
});
