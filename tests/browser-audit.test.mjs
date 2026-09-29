import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const auditScript = fileURLToPath(
	new URL("../tools/audit-browser.mjs", import.meta.url),
);

function listen(server) {
	return new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => resolve(server.address().port));
	});
}

function close(server) {
	return new Promise((resolve, reject) => {
		server.close((error) => (error ? reject(error) : resolve()));
	});
}

function runAudit(origin, environment = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [auditScript], {
			env: { ...process.env, WYST_BROWSER_ORIGIN: origin, ...environment },
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (chunk) => {
			stdout += chunk;
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk;
		});
		child.once("error", reject);
		child.once("close", (code, signal) => resolve({ code, signal, stdout, stderr }));
	});
}

async function startupFixture(t, mode) {
	const directory = await mkdtemp(path.join(os.tmpdir(), "wyst-chrome-test-"));
	t.after(() => rm(directory, { recursive: true, force: true }));
	const log = path.join(directory, "launches.jsonl");
	return {
		environment: {
			NODE_OPTIONS: `--import=${new URL("./fixtures/chrome-startup.mjs", import.meta.url).href}`,
			WYST_TEST_CHROME_MODE: mode,
			WYST_TEST_CHROME_LOG: log,
		},
		async launches() {
			return (await readFile(log, "utf8")).trim().split("\n").map(JSON.parse);
		},
	};
}

async function assertCleanedUp(launches, expectedAttempts) {
	assert.equal(launches.length, expectedAttempts, "unexpected Chrome launch count");
	assert.equal(new Set(launches.map(({ profile }) => profile)).size, expectedAttempts);
	for (const { pid, profile } of launches) {
		if (pid) assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
		await assert.rejects(access(profile), { code: "ENOENT" });
	}
}

test(
	"browser audit catches cross-origin requests, desktop-only overflow, and unnamed controls",
	{ timeout: 60_000 },
	async (t) => {
		const assetServer = http.createServer((request, response) => {
			if (request.url === "/pixel.svg") {
				response.writeHead(200, { "Content-Type": "image/svg+xml" });
				response.end('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>');
				return;
			}
			response.writeHead(404).end();
		});
		const assetPort = await listen(assetServer);
		t.after(() => close(assetServer));

		const style = `<style>
			.skip { position: absolute; top: -100px; left: 0; }
			.skip:focus { top: 0; outline: 2px solid red; }
			.doc-sidebar-toggle { min-width: 44px; min-height: 44px; }
			.doc-sidebar { display: none; }
			.doc-sidebar.is-open { display: block; }
			.doc-sidebar a { display: block; min-width: 24px; min-height: 24px; }
			@media (min-width: 1000px) { .desktop-overflow { width: 2000px; } }
		</style>`;
		const page = ({ docs = false } = {}) => `<!doctype html>
			<html lang="en"><head><title>Audit fixture</title>${style}</head><body>
			<a class="skip" href="#main">Skip to content</a>
			${docs ? '<button class="doc-sidebar-toggle" aria-expanded="false" aria-controls="doc-sidebar"></button><aside id="doc-sidebar" class="doc-sidebar"><a href="/">Home</a></aside>' : ""}
			<main id="main"><h1>Audit fixture</h1>${docs ? '<div class="desktop-overflow">wide</div>' : `<img src="http://127.0.0.1:${assetPort}/pixel.svg" alt="">`}</main>
			${docs ? '<script src="/assets/docs.js" defer></script>' : ""}
			</body></html>`;
		const siteServer = http.createServer((request, response) => {
			if (request.url === "/sitemap.xml") {
				response.writeHead(200, { "Content-Type": "application/xml" });
				response.end("<urlset><url><loc>https://wyst.dev/</loc></url><url><loc>https://wyst.dev/docs/test/</loc></url></urlset>");
				return;
			}
			if (request.url === "/assets/docs.js") {
				response.writeHead(200, { "Content-Type": "text/javascript" });
				response.end(`fetch("/same-origin.json");
					const toggle = document.querySelector(".doc-sidebar-toggle");
					const sidebar = document.getElementById("doc-sidebar");
					toggle.addEventListener("click", () => {
						const open = toggle.getAttribute("aria-expanded") !== "true";
						toggle.setAttribute("aria-expanded", String(open));
						sidebar.classList.toggle("is-open", open);
					});
					document.addEventListener("keydown", (event) => {
						if (event.key === "Escape") {
							toggle.setAttribute("aria-expanded", "false");
							sidebar.classList.remove("is-open");
							toggle.focus();
						}
					});`);
				return;
			}
			if (request.url === "/same-origin.json") {
				response.writeHead(200, { "Content-Type": "application/json" });
				response.end("{}\n");
				return;
			}
			if (request.url === "/" || request.url === "/docs/test/") {
				response.writeHead(200, { "Content-Type": "text/html" });
				response.end(page({ docs: request.url === "/docs/test/" }));
				return;
			}
			response.writeHead(404).end();
		});
		const sitePort = await listen(siteServer);
		t.after(() => close(siteServer));

		for (const mode of ["normal", "stall-once"]) {
			await t.test(mode, async (t) => {
				const fixture = await startupFixture(t, mode);
				const result = await runAudit(
					`http://127.0.0.1:${sitePort}`, fixture.environment,
				);
				assert.notEqual(result.code, 0, result.stdout);
				assert.match(result.stderr, /unexpected cross-origin request/);
				assert.match(result.stderr, /Fetch request blocked by connect-src none/);
				assert.match(result.stderr, /inline style element/);
				assert.match(result.stderr, /\/docs\/test\/ at desktop 1440px overflows/);
				assert.match(result.stderr, /\/docs\/test\/ at mobile 375px has unnamed controls/);
				if (mode === "stall-once") {
					assert.match(result.stderr, /Chrome startup attempt 1 failed/);
				}
				await assertCleanedUp(await fixture.launches(), mode === "normal" ? 1 : 2);
			});
		}
	},
);

test(
	"browser audit fails promptly after two Chrome startup exits and removes both profiles",
	{ timeout: 5000 },
	async (t) => {
		const fixture = await startupFixture(t, "exit");
		const result = await runAudit("http://127.0.0.1:1", fixture.environment);
		assert.notEqual(result.code, 0);
		assert.match(result.stderr, /Chrome exit code: 17/);
		assert.match(result.stderr, /Chrome startup fixture exited/);
		await assertCleanedUp(await fixture.launches(), 2);
	},
);

test(
	"browser audit reports Chrome spawn errors and removes both profiles",
	{ timeout: 5000 },
	async (t) => {
		const fixture = await startupFixture(t, "spawn-error");
		const result = await runAudit("http://127.0.0.1:1", fixture.environment);
		assert.notEqual(result.code, 0);
		assert.match(result.stderr, /Chrome exit code: not started/);
		assert.match(result.stderr, /ENOENT/);
		await assertCleanedUp(await fixture.launches(), 2);
	},
);
