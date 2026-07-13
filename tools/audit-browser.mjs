import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serveScript = path.join(root, "build", "serve.mjs");
const MOBILE_WIDTH = 375;
const VIEWPORTS = [
	{ label: "mobile", width: MOBILE_WIDTH, height: 812 },
	{ label: "desktop", width: 1440, height: 900 },
];
const configuredOrigin = process.env.WYST_BROWSER_ORIGIN;
const versionId = process.env.WYST_VERSION_ID?.trim();

if (versionId && !/^[\w.-]+$/.test(versionId)) {
	throw new Error("WYST_VERSION_ID contains invalid characters");
}

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
		this.handlers = new Map();
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
			for (const handler of this.handlers.get(message.method) ?? []) {
				handler(message.params);
			}
			const listeners = this.listeners.get(message.method) || [];
			this.listeners.delete(message.method);
			for (const listener of listeners) listener.resolve(message.params);
		});
	}

	on(method, handler) {
		const handlers = this.handlers.get(method) ?? new Set();
		handlers.add(handler);
		this.handlers.set(method, handlers);
		return () => handlers.delete(handler);
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
	const duplicateIds = [];
	const ids = new Set();
	for (const element of document.querySelectorAll("[id]")) {
		if (ids.has(element.id)) duplicateIds.push(element.id);
		ids.add(element.id);
	}
	const missingAlt = [...document.images]
		.filter((element) => !element.hasAttribute("alt"))
		.map((element) => element.getAttribute("src") || "(inline image)");
	const positiveTabindex = [...document.querySelectorAll("[tabindex]")]
		.filter((element) => Number(element.getAttribute("tabindex")) > 0)
		.map((element) => element.outerHTML.slice(0, 160));
	const invalidAriaReferences = [];
	for (const element of document.querySelectorAll(
		"[aria-controls], [aria-labelledby], [aria-describedby]",
	)) {
		for (const attribute of ["aria-controls", "aria-labelledby", "aria-describedby"]) {
			if (!element.hasAttribute(attribute)) continue;
			for (const id of element.getAttribute(attribute).trim().split(/\s+/)) {
				if (!id || !document.getElementById(id)) {
					invalidAriaReferences.push(attribute + "=" + JSON.stringify(id));
				}
			}
		}
	}
	const accessibleName = (element) => {
		const labelledBy = (element.getAttribute("aria-labelledby") || "")
			.trim()
			.split(/\s+/)
			.filter(Boolean)
			.map((id) => document.getElementById(id)?.textContent || "")
			.join(" ");
		const labelledControl = element.id
			? document.querySelector('label[for="' + CSS.escape(element.id) + '"]')
			: null;
		return [
			element.getAttribute("aria-label") ||
				"",
			labelledBy,
			labelledControl?.textContent || "",
			element.textContent || "",
			element.querySelector("img[alt]")?.getAttribute("alt") || "",
			element.getAttribute("title") || "",
			element.getAttribute("value") || "",
		].map((value) => value.trim()).find(Boolean) || "";
	};
	const unnamedControls = [...document.querySelectorAll(
		'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"]',
	)]
		.filter(visible)
		.filter((element) => element.getAttribute("aria-hidden") === "true" || !accessibleName(element))
		.map((element) => element.outerHTML.slice(0, 160));
	const cspViolations = [];
	for (const [selector, description] of [
		["script:not([src])", "inline script"],
		["style", "inline style element"],
		["[style]", "inline style attribute"],
		["form", "form blocked by form-action none"],
		["base", "base element blocked by base-uri none"],
		["iframe, frame, object, embed", "embedded content blocked by default-src none"],
	]) {
		const elements = [...document.querySelectorAll(selector)];
		if (elements.length) cspViolations.push(description + " (" + elements.length + ")");
	}
	const inlineHandlers = [...document.querySelectorAll("*")].filter((element) =>
		[...element.attributes].some((attribute) => /^on/i.test(attribute.name)),
	);
	if (inlineHandlers.length) {
		cspViolations.push("inline event handler (" + inlineHandlers.length + ")");
	}
	return {
		title: document.title,
		viewport,
		documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
		outOfBounds,
		smallTargets,
		badAnchors: document.querySelectorAll(
			'.doc-anchor[aria-hidden="true"], .doc-anchor:not([aria-label])',
		).length,
		mainElements: document.querySelectorAll("main").length,
		h1Elements: document.querySelectorAll("h1").length,
		documentLanguage: document.documentElement.lang,
		duplicateIds: [...new Set(duplicateIds)],
		missingAlt,
		positiveTabindex,
		invalidAriaReferences,
		unnamedControls,
		cspViolations,
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
	const navigation = await client.send("Page.navigate", { url });
	if (navigation.errorText) {
		throw new Error(`could not navigate to ${url}: ${navigation.errorText}`);
	}
	await loaded;
}

async function pressKey(client, key, { shift = false } = {}) {
	const keyCode = key === "Tab" ? 9 : key === "Enter" ? 13 : key === "Escape" ? 27 : 0;
	const params = {
		key,
		code: key,
		modifiers: shift ? 8 : 0,
		windowsVirtualKeyCode: keyCode,
		nativeVirtualKeyCode: keyCode,
		...(key === "Enter" ? { text: "\r", unmodifiedText: "\r" } : {}),
	};
	await client.send("Input.dispatchKeyEvent", { type: "keyDown", ...params });
	await client.send("Input.dispatchKeyEvent", { type: "keyUp", ...params });
}

async function keyboardFocusAudit(client) {
	await evaluate(
		client,
		String.raw`(() => {
			document.activeElement?.blur();
			window.scrollTo(0, 0);
		})()`,
	);
	await pressKey(client, "Tab");
	const firstFocus = await evaluate(
		client,
		String.raw`(() => {
			const element = document.activeElement;
			const style = getComputedStyle(element);
			const rect = element.getBoundingClientRect();
			const outlineVisible = style.outlineStyle !== "none" &&
				parseFloat(style.outlineWidth) > 0 &&
				style.outlineColor !== "transparent";
			const shadowVisible = style.boxShadow !== "none";
			return {
				tag: element.tagName.toLowerCase(),
				className: String(element.className || ""),
				text: element.textContent.trim(),
				href: element.getAttribute("href"),
				visible: style.display !== "none" &&
					style.visibility !== "hidden" &&
					rect.bottom > 0 && rect.right > 0 &&
					rect.top < innerHeight && rect.left < innerWidth,
				focusIndicator: outlineVisible || shadowVisible,
			};
		})()`,
	);
	const focusedObject = await client.send("Runtime.evaluate", {
		expression: "document.activeElement",
		returnByValue: false,
	});
	const focusedAxTree = await client.send("Accessibility.getPartialAXTree", {
		objectId: focusedObject.result.objectId,
		fetchRelatives: false,
	});
	const focusedAxNode = focusedAxTree.nodes.find((node) => !node.ignored);
	firstFocus.accessibilityRole = focusedAxNode?.role?.value ?? null;
	firstFocus.accessibilityName = focusedAxNode?.name?.value ?? null;
	await client.send("Runtime.releaseObject", {
		objectId: focusedObject.result.objectId,
	});
	await pressKey(client, "Enter");
	await evaluate(
		client,
		"new Promise((resolve) => requestAnimationFrame(() => resolve(true)))",
	);
	const activation = await evaluate(
		client,
		String.raw`(() => ({
			hash: location.hash,
			targetExists: Boolean(document.querySelector("main#main")),
		}))()`,
	);
	return { firstFocus, activation };
}

const debugPort = await freePort();
let preview;
let targetOrigin;
let previewOutput = "";

if (configuredOrigin) {
	targetOrigin = new URL(configuredOrigin);
	if (
		!/^https?:$/.test(targetOrigin.protocol) ||
		targetOrigin.pathname !== "/" ||
		targetOrigin.search ||
		targetOrigin.hash ||
		targetOrigin.username ||
		targetOrigin.password
	) {
		throw new Error("WYST_BROWSER_ORIGIN must be an HTTP(S) origin without a path");
	}
} else {
	const previewPort = await freePort();
	targetOrigin = new URL(`http://127.0.0.1:${previewPort}/`);
	preview = spawn(process.execPath, [serveScript], {
		cwd: root,
		env: { ...process.env, PORT: String(previewPort) },
		stdio: ["ignore", "pipe", "pipe"],
	});
	preview.stdout.on("data", (chunk) => {
		previewOutput += chunk;
	});
	preview.stderr.on("data", (chunk) => {
		previewOutput += chunk;
	});
}

const profile = await mkdtemp(path.join(os.tmpdir(), "wyst-browser-audit-"));

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
	if (preview) {
		await poll(targetOrigin, "preview server", () => previewOutput);
	}
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
	await client.send("Accessibility.enable");
	await client.send("Network.enable");
	await client.send("Network.setCacheDisabled", { cacheDisabled: true });
	const overrideHeaders = versionId
		? { "Cloudflare-Workers-Version-Overrides": `wyst="${versionId}"` }
		: {};
	if (versionId) {
		await client.send("Network.setExtraHTTPHeaders", {
			headers: overrideHeaders,
		});
	}

	let activeRoute = "(startup)";
	const requestUrls = new Map();
	const runtimeFailures = [];
	client.on("Network.requestWillBeSent", ({ requestId, request, type }) => {
		requestUrls.set(requestId, request.url);
		let url;
		try {
			url = new URL(request.url);
		} catch {
			runtimeFailures.push(`${activeRoute} requested a malformed URL: ${request.url}`);
			return;
		}
		if (url.protocol === "data:" || request.url === "about:blank") return;
		if (!/^https?:$/.test(url.protocol) || url.origin !== targetOrigin.origin) {
			runtimeFailures.push(
				`${activeRoute} made an unexpected cross-origin request to ${request.url}`,
			);
		}
		if (["EventSource", "Fetch", "Ping", "XHR"].includes(type)) {
			runtimeFailures.push(
				`${activeRoute} made a ${type} request blocked by connect-src none: ${request.url}`,
			);
		}
	});
	client.on("Network.webSocketCreated", ({ url }) => {
		runtimeFailures.push(
			`${activeRoute} opened a WebSocket blocked by connect-src none: ${url}`,
		);
	});
	client.on("Network.responseReceived", ({ response }) => {
		if (response.status >= 400) {
			runtimeFailures.push(
				`${activeRoute} received HTTP ${response.status} from ${response.url}`,
			);
		}
	});
	client.on("Network.loadingFailed", ({ requestId, errorText, canceled }) => {
		if (!canceled) {
			runtimeFailures.push(
				`${activeRoute} failed to load ${requestUrls.get(requestId) ?? requestId}: ${errorText}`,
			);
		}
	});
	client.on("Runtime.consoleAPICalled", ({ type, args }) => {
		if (type !== "error" && type !== "assert") return;
		const message = args
			.map((arg) => arg.value ?? arg.description ?? arg.type)
			.join(" ");
		runtimeFailures.push(`${activeRoute} console.${type}: ${message}`);
	});
	client.on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
		runtimeFailures.push(
			`${activeRoute} uncaught exception: ${exceptionDetails.exception?.description ?? exceptionDetails.text}`,
		);
	});

	const sitemapResponse = await fetch(new URL("/sitemap.xml", targetOrigin), {
		headers: overrideHeaders,
		redirect: "error",
		signal: AbortSignal.timeout(10_000),
	});
	if (!sitemapResponse.ok) {
		throw new Error(`target sitemap returned ${sitemapResponse.status}`);
	}
	const sitemap = await sitemapResponse.text();
	const routes = [...sitemap.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map(
		(match) => {
			const loc = new URL(match[1].replaceAll("&amp;", "&"));
			if (loc.origin !== "https://wyst.dev" || loc.username || loc.password) {
				throw new Error(`sitemap URL must use the canonical origin: ${loc}`);
			}
			if (loc.hash) throw new Error(`sitemap URL must not contain a fragment: ${loc}`);
			return `${loc.pathname}${loc.search}` || "/";
		},
	);
	if (!routes.length) throw new Error("target sitemap contains no routes");
	if (new Set(routes).size !== routes.length) {
		throw new Error("target sitemap contains duplicate routes");
	}
	const failures = [];
	for (const viewport of VIEWPORTS) {
		for (const route of routes) {
			const label = `${route} at ${viewport.label} ${viewport.width}px`;
			activeRoute = label;
			await navigate(
				client,
				new URL(route, targetOrigin).href,
				viewport.width,
				viewport.height,
			);
			const audit = await evaluate(client, PAGE_AUDIT);
			if (audit.documentWidth > audit.viewport + 1) {
				failures.push(
					`${label} overflows ${audit.documentWidth}px at ${audit.viewport}px`,
				);
			}
			if (audit.outOfBounds.length) {
				failures.push(
					`${label} clips elements: ${JSON.stringify(audit.outOfBounds)}`,
				);
			}
			if (audit.smallTargets.length) {
				failures.push(
					`${label} has undersized controls: ${JSON.stringify(audit.smallTargets)}`,
				);
			}
			if (audit.badAnchors) {
				failures.push(
					`${label} has ${audit.badAnchors} inaccessible heading anchors`,
				);
			}
			if (!audit.title.trim()) failures.push(`${label} has no document title`);
			if (audit.documentLanguage !== "en") {
				failures.push(`${label} has unexpected document language ${JSON.stringify(audit.documentLanguage)}`);
			}
			if (audit.mainElements !== 1) {
				failures.push(`${label} has ${audit.mainElements} main landmarks`);
			}
			if (audit.h1Elements !== 1) {
				failures.push(`${label} has ${audit.h1Elements} h1 elements`);
			}
			for (const [kind, findings] of [
				["duplicate IDs", audit.duplicateIds],
				["images without alt", audit.missingAlt],
				["positive tabindex values", audit.positiveTabindex],
				["invalid ARIA references", audit.invalidAriaReferences],
				["unnamed controls", audit.unnamedControls],
				["content that violates the generated CSP", audit.cspViolations],
			]) {
				if (findings.length) {
					failures.push(`${label} has ${kind}: ${JSON.stringify(findings)}`);
				}
			}
			const invalidScripts = audit.scripts.filter(
				(src) => !/^\/assets\/docs(?:\.[a-f0-9]{8})?\.js$/.test(src),
			);
			if (invalidScripts.length) {
				failures.push(
					`${label} has unexpected scripts: ${invalidScripts.join(", ")}`,
				);
			}
			if (
				viewport.label === "mobile" &&
				route.startsWith("/docs/") &&
				route !== "/docs/" &&
				audit.toggle !== "false"
			) {
				failures.push(`${label} Contents disclosure does not start collapsed`);
			}

			const keyboard = await keyboardFocusAudit(client);
			const first = keyboard.firstFocus;
			if (
				first.tag !== "a" ||
				!first.className.split(/\s+/).includes("skip") ||
				first.href !== "#main" ||
				first.text !== "Skip to content" ||
				first.accessibilityRole !== "link" ||
				first.accessibilityName !== "Skip to content"
			) {
				failures.push(`${label} does not expose Skip to content as the first Tab stop: ${JSON.stringify(first)}`);
			}
			if (!first.visible || !first.focusIndicator) {
				failures.push(`${label} first keyboard focus is not visibly indicated: ${JSON.stringify(first)}`);
			}
			if (keyboard.activation.hash !== "#main" || !keyboard.activation.targetExists) {
				failures.push(`${label} Skip to content does not activate #main: ${JSON.stringify(keyboard.activation)}`);
			}
		}
	}

	const disclosureRoute = routes.find(
		(route) => route.startsWith("/docs/") && route !== "/docs/",
	);
	if (!disclosureRoute) throw new Error("sitemap contains no documentation detail route");
	activeRoute = `${disclosureRoute} mobile keyboard disclosure`;
	await navigate(
		client,
		new URL(disclosureRoute, targetOrigin).href,
		MOBILE_WIDTH,
		812,
	);
	await evaluate(
		client,
		String.raw`(() => {
			const toggle = document.querySelector(".doc-sidebar-toggle");
			toggle.focus();
		})()`,
	);
	await pressKey(client, "Enter");
	const disclosureOpen = await evaluate(
		client,
		String.raw`(() => {
			const toggle = document.querySelector(".doc-sidebar-toggle");
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
			return {
				opened: toggle.getAttribute("aria-expanded") === "true" &&
					getComputedStyle(
						document.getElementById(toggle.getAttribute("aria-controls")),
					).display !== "none",
				smallTargets,
			};
		})()`,
	);
	await pressKey(client, "Escape");
	const disclosureClosed = await evaluate(
		client,
		String.raw`(() => {
			const toggle = document.querySelector(".doc-sidebar-toggle");
			return {
				closed: toggle.getAttribute("aria-expanded") === "false",
				focusRestored: document.activeElement === toggle,
			};
		})()`,
	);
	if (!disclosureOpen.opened || !disclosureClosed.closed || !disclosureClosed.focusRestored) {
		failures.push("mobile Contents disclosure state is not synchronized");
	}
	if (disclosureOpen.smallTargets.length) {
		failures.push(
			`mobile Contents has undersized links: ${JSON.stringify(disclosureOpen.smallTargets)}`,
		);
	}
	failures.push(...new Set(runtimeFailures));

	if (failures.length) {
		throw new Error(`browser audit failed:\n${failures.join("\n")}`);
	}
	console.log(
		`browser audit passed for ${targetOrigin.origin}: ${routes.length} routes at mobile and desktop; accessibility, keyboard, CSP, network-origin, and disclosure checks passed`,
	);
} finally {
	client?.close();
	await Promise.all([
		preview ? stopProcess(preview) : Promise.resolve(),
		stopProcess(chrome),
	]);
	await rm(profile, {
		recursive: true,
		force: true,
		maxRetries: 5,
		retryDelay: 100,
	});
}
