import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serveScript = path.join(root, "build", "serve.mjs");
const MOBILE_WIDTH = 375;

function chromeBinary() {
	const absoluteCandidates = [
		process.env.CHROME_BIN,
		"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
		"/Applications/Chromium.app/Contents/MacOS/Chromium",
	].filter(Boolean);
	for (const candidate of absoluteCandidates) {
		if (existsSync(candidate)) return candidate;
	}
	for (const command of [
		"google-chrome",
		"google-chrome-stable",
		"chromium",
		"chromium-browser",
	]) {
		const found = spawnSync("which", [command], { encoding: "utf8" });
		if (found.status === 0 && found.stdout.trim()) return found.stdout.trim();
	}
	throw new Error(
		"Chrome or Chromium is required (set CHROME_BIN to its executable)",
	);
}

function freePort() {
	return new Promise((resolve, reject) => {
		const server = net.createServer();
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const { port } = server.address();
			server.close(() => resolve(port));
		});
	});
}

async function stopProcess(child) {
	if (child.exitCode !== null || child.signalCode !== null) return;
	const exited = new Promise((resolve) => child.once("exit", resolve));
	child.kill("SIGTERM");
	await Promise.race([
		exited,
		new Promise((resolve) => setTimeout(resolve, 1500)),
	]);
	if (child.exitCode === null && child.signalCode === null) {
		child.kill("SIGKILL");
		await exited;
	}
}

async function poll(url, label, processOutput, attempts = 400) {
	let lastError;
	for (let attempt = 0; attempt < attempts; attempt++) {
		try {
			const response = await fetch(url);
			if (response.ok) return response;
			lastError = new Error(`${label} returned ${response.status}`);
		} catch (error) {
			lastError = error;
		}
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	throw new Error(
		`${label} did not become ready: ${lastError?.message || "unknown error"}\n${processOutput()}`,
	);
}

class CdpClient {
	constructor(url) {
		this.nextId = 1;
		this.pending = new Map();
		this.listeners = new Map();
		this.socket = new WebSocket(url);
		this.ready = new Promise((resolve, reject) => {
			this.socket.addEventListener("open", resolve, { once: true });
			this.socket.addEventListener(
				"error",
				() => reject(new Error("CDP WebSocket failed to open")),
				{ once: true },
			);
		});
		this.socket.addEventListener("message", (event) => {
			const message = JSON.parse(event.data);
			if (message.id) {
				const pending = this.pending.get(message.id);
				if (!pending) return;
				this.pending.delete(message.id);
				if (message.error) pending.reject(new Error(message.error.message));
				else pending.resolve(message.result);
				return;
			}
			const listeners = this.listeners.get(message.method) || [];
			this.listeners.delete(message.method);
			for (const listener of listeners) listener.resolve(message.params);
		});
	}

	async send(method, params = {}) {
		await this.ready;
		const id = this.nextId++;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error(`CDP command timed out: ${method}`));
			}, 10000);
			this.pending.set(id, {
				resolve(value) {
					clearTimeout(timer);
					resolve(value);
				},
				reject(error) {
					clearTimeout(timer);
					reject(error);
				},
			});
			this.socket.send(JSON.stringify({ id, method, params }));
		});
	}

	waitFor(method) {
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				const listeners = this.listeners.get(method) || [];
				this.listeners.set(
					method,
					listeners.filter((listener) => listener.resolve !== wrappedResolve),
				);
				reject(new Error(`CDP event timed out: ${method}`));
			}, 10000);
			const wrappedResolve = (value) => {
				clearTimeout(timer);
				resolve(value);
			};
			const listeners = this.listeners.get(method) || [];
			listeners.push({ resolve: wrappedResolve });
			this.listeners.set(method, listeners);
		});
	}

	close() {
		this.socket.close();
	}
}

const PAGE_AUDIT = String.raw`(() => {
	const viewport = document.documentElement.clientWidth;
	const visible = (element) => {
		const style = getComputedStyle(element);
		const rect = element.getBoundingClientRect();
		return style.display !== "none" &&
			style.visibility !== "hidden" &&
			style.opacity !== "0" &&
			rect.width > 0 &&
			rect.height > 0;
	};
	const containedByScroller = (element) => {
		for (
			let parent = element.parentElement;
			parent && parent !== document.body;
			parent = parent.parentElement
		) {
			const overflow = getComputedStyle(parent).overflowX;
			if (
				/^(auto|scroll|hidden|clip)$/.test(overflow) &&
				parent.getBoundingClientRect().right <= viewport + 1
			) return true;
		}
		return false;
	};
	const outOfBounds = [...document.body.querySelectorAll("*")]
		.filter(visible)
		.filter((element) => !element.classList.contains("visually-hidden"))
		.filter((element) => {
			const rect = element.getBoundingClientRect();
			return (rect.left < -1 || rect.right > viewport + 1) &&
				!containedByScroller(element);
		})
		.slice(0, 10)
		.map((element) => {
			const rect = element.getBoundingClientRect();
			return {
				element: element.tagName.toLowerCase() +
					(element.className
						? "." + String(element.className).replace(/\s+/g, ".")
						: ""),
				left: rect.left,
				right: rect.right,
			};
		});
	const smallTargets = [...document.querySelectorAll(
		"header.site a, .doc-sidebar-toggle, .artifact-bar a, footer.site a",
	)]
		.filter(visible)
		.map((element) => {
			const rect = element.getBoundingClientRect();
			return {
				label: element.textContent.trim() || element.getAttribute("aria-label"),
				width: rect.width,
				height: rect.height,
			};
		})
		.filter((target) => target.width < 24 || target.height < 24);
	return {
		title: document.title,
		viewport,
		documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
		outOfBounds,
		smallTargets,
		badAnchors: document.querySelectorAll(
			'.doc-anchor[aria-hidden="true"], .doc-anchor:not([aria-label])',
		).length,
		scripts: [...document.scripts].map(
			(script) => script.getAttribute("src") || "inline",
		),
		toggle: document.querySelector(".doc-sidebar-toggle")
			?.getAttribute("aria-expanded") ?? null,
	};
})()`;

async function evaluate(client, expression) {
	const result = await client.send("Runtime.evaluate", {
		expression,
		returnByValue: true,
		awaitPromise: true,
	});
	if (result.exceptionDetails) {
		throw new Error(
			result.exceptionDetails.exception?.description ||
				"browser evaluation failed",
		);
	}
	return result.result.value;
}

async function navigate(client, url, width, height) {
	await client.send("Emulation.setDeviceMetricsOverride", {
		width,
		height,
		deviceScaleFactor: 1,
		mobile: width <= MOBILE_WIDTH,
	});
	const loaded = client.waitFor("Page.loadEventFired");
	await client.send("Page.navigate", { url });
	await loaded;
}

const [previewPort, debugPort] = await Promise.all([freePort(), freePort()]);
const profile = await mkdtemp(path.join(os.tmpdir(), "wyst-browser-audit-"));
const preview = spawn(process.execPath, [serveScript], {
	cwd: root,
	env: { ...process.env, PORT: String(previewPort) },
	stdio: ["ignore", "pipe", "pipe"],
});
let previewOutput = "";
preview.stdout.on("data", (chunk) => {
	previewOutput += chunk;
});
preview.stderr.on("data", (chunk) => {
	previewOutput += chunk;
});

const chromeExecutable = chromeBinary();
const chrome = spawn(
	chromeExecutable,
	[
		"--headless=new",
		"--disable-background-networking",
		"--disable-component-update",
		"--disable-default-apps",
		"--disable-dev-shm-usage",
		"--disable-extensions",
		"--disable-gpu",
		"--disable-sync",
		"--metrics-recording-only",
		"--no-default-browser-check",
		"--no-first-run",
		...(process.env.CI ? ["--no-sandbox"] : []),
		"--remote-debugging-address=127.0.0.1",
		`--remote-debugging-port=${debugPort}`,
		`--user-data-dir=${profile}`,
		"about:blank",
	],
	{ stdio: ["ignore", "pipe", "pipe"] },
);
let chromeOutput = "";
chrome.stdout.on("data", (chunk) => {
	chromeOutput += chunk;
});
chrome.stderr.on("data", (chunk) => {
	chromeOutput += chunk;
});

let client;
try {
	await poll(
		`http://127.0.0.1:${previewPort}/`,
		"preview server",
		() => previewOutput,
	);
	await poll(
		`http://127.0.0.1:${debugPort}/json/version`,
		"Chrome debugging endpoint",
		() =>
			`Chrome executable: ${chromeExecutable}\n` +
			`Chrome exit code: ${chrome.exitCode ?? "running"}\n` +
			chromeOutput,
	);
	const targetResponse = await fetch(
		`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent("about:blank")}`,
		{ method: "PUT" },
	);
	if (!targetResponse.ok) {
		throw new Error(`could not create browser target: ${targetResponse.status}`);
	}
	const target = await targetResponse.json();
	client = new CdpClient(target.webSocketDebuggerUrl);
	await client.send("Page.enable");
	await client.send("Runtime.enable");

	const sitemap = await readFile(path.join(root, "sitemap.xml"), "utf8");
	const routes = [...sitemap.matchAll(/<loc>https:\/\/wyst\.dev([^<]*)<\/loc>/g)].map(
		(match) => match[1] || "/",
	);
	const failures = [];
	for (const route of routes) {
		await navigate(
			client,
			`http://127.0.0.1:${previewPort}${route}`,
			MOBILE_WIDTH,
			812,
		);
		const audit = await evaluate(client, PAGE_AUDIT);
		if (audit.documentWidth > audit.viewport + 1) {
			failures.push(
				`${route} overflows ${audit.documentWidth}px at ${audit.viewport}px`,
			);
		}
		if (audit.outOfBounds.length) {
			failures.push(
				`${route} clips elements at ${audit.viewport}px: ${JSON.stringify(audit.outOfBounds)}`,
			);
		}
		if (audit.smallTargets.length) {
			failures.push(
				`${route} has undersized controls: ${JSON.stringify(audit.smallTargets)}`,
			);
		}
		if (audit.badAnchors) {
			failures.push(
				`${route} has ${audit.badAnchors} inaccessible heading anchors`,
			);
		}
		const invalidScripts = audit.scripts.filter(
			(src) => !/^\/assets\/docs(?:\.[a-f0-9]{8})?\.js$/.test(src),
		);
		if (invalidScripts.length) {
			failures.push(
				`${route} has unexpected scripts: ${invalidScripts.join(", ")}`,
			);
		}
		if (
			route.startsWith("/docs/") &&
			route !== "/docs/" &&
			audit.toggle !== "false"
		) {
			failures.push(`${route} Contents disclosure does not start collapsed`);
		}
	}

	await navigate(
		client,
		`http://127.0.0.1:${previewPort}/docs/chapter-06-types/`,
		MOBILE_WIDTH,
		812,
	);
	const disclosure = await evaluate(
		client,
		String.raw`(() => {
			const toggle = document.querySelector(".doc-sidebar-toggle");
			toggle.click();
			const opened = toggle.getAttribute("aria-expanded") === "true" &&
				getComputedStyle(
					document.getElementById(toggle.getAttribute("aria-controls")),
				).display !== "none";
			const smallTargets = [...document.querySelectorAll(".doc-sidebar a")]
				.map((link) => {
					const rect = link.getBoundingClientRect();
					return {
						label: link.textContent.trim(),
						width: rect.width,
						height: rect.height,
					};
				})
				.filter((target) => target.width < 24 || target.height < 24);
			document.dispatchEvent(
				new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
			);
			return {
				opened,
				closed: toggle.getAttribute("aria-expanded") === "false",
				smallTargets,
			};
		})()`,
	);
	if (!disclosure.opened || !disclosure.closed) {
		failures.push("mobile Contents disclosure state is not synchronized");
	}
	if (disclosure.smallTargets.length) {
		failures.push(
			`mobile Contents has undersized links: ${JSON.stringify(disclosure.smallTargets)}`,
		);
	}

	for (const route of ["/", "/docs/chapter-06-types/"]) {
		await navigate(client, `http://127.0.0.1:${previewPort}${route}`, 1440, 900);
		const audit = await evaluate(client, PAGE_AUDIT);
		if (audit.documentWidth > audit.viewport + 1) {
			failures.push(
				`${route} overflows ${audit.documentWidth}px at desktop width ${audit.viewport}px`,
			);
		}
		if (audit.outOfBounds.length) {
			failures.push(`${route} clips desktop elements: ${JSON.stringify(audit.outOfBounds)}`);
		}
	}

	if (failures.length) {
		throw new Error(`browser audit failed:\n${failures.join("\n")}`);
	}
	console.log(
		`browser audit passed: ${routes.length} routes at ${MOBILE_WIDTH}px; desktop and disclosure checks passed`,
	);
} finally {
	client?.close();
	await Promise.all([stopProcess(preview), stopProcess(chrome)]);
	await rm(profile, {
		recursive: true,
		force: true,
		maxRetries: 5,
		retryDelay: 100,
	});
}
