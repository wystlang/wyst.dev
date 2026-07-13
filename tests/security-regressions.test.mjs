import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import test from "node:test";
import { fileURLToPath } from "node:url";

const serveScript = fileURLToPath(new URL("../build/serve.mjs", import.meta.url));

function getFreePort() {
	return new Promise((resolve, reject) => {
		const server = net.createServer();
		server.on("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			server.close(() => resolve(address.port));
		});
	});
}

function request(port, path) {
	return new Promise((resolve, reject) => {
		const req = http.get({ host: "127.0.0.1", port, path }, (res) => {
			let body = "";
			res.setEncoding("utf8");
			res.on("data", (chunk) => {
				body += chunk;
			});
			res.on("end", () => {
				resolve({ statusCode: res.statusCode, body });
			});
		});
		req.on("error", reject);
		req.setTimeout(2000, () => {
			req.destroy(new Error(`timed out requesting ${path}`));
		});
	});
}

async function waitForPreview(port, child) {
	const deadline = Date.now() + 4000;
	let lastError;
	while (Date.now() < deadline) {
		if (child.exitCode !== null) {
			throw new Error(`preview server exited with code ${child.exitCode}`);
		}
		try {
			const res = await request(port, "/");
			if (res.statusCode === 200) return;
		} catch (error) {
			lastError = error;
		}
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	throw lastError || new Error("preview server did not start");
}

async function startPreview(t) {
	const port = await getFreePort();
	const child = spawn(process.execPath, [serveScript], {
		env: { ...process.env, PORT: String(port) },
		stdio: ["ignore", "pipe", "pipe"],
	});
	let output = "";
	child.stdout.on("data", (chunk) => {
		output += chunk;
	});
	child.stderr.on("data", (chunk) => {
		output += chunk;
	});
	t.after(async () => {
		if (child.exitCode === null) {
			child.kill("SIGTERM");
			await Promise.race([
				once(child, "exit"),
				new Promise((resolve) => setTimeout(resolve, 1000)),
			]);
		}
	});
	await waitForPreview(port, child);
	return { port, output: () => output };
}

test("preview server serves public assets without exposing repository internals", async (t) => {
	const preview = await startPreview(t);

	const home = await request(preview.port, "/");
	assert.equal(home.statusCode, 200, preview.output());

	for (const path of [
		"/.git/config",
		"/.claude/launch.json",
		"/.wrangler/cache/wrangler-account.json",
		"/package.json",
	]) {
		const res = await request(preview.port, path);
		assert.equal(res.statusCode, 404, `${path} should not be served`);
	}
});

test("preview server listens on loopback instead of every interface", async (t) => {
	const preview = await startPreview(t);
	const listener = spawnSync("lsof", [
		"-nP",
		`-iTCP:${preview.port}`,
		"-sTCP:LISTEN",
	], { encoding: "utf8" });

	assert.equal(listener.status, 0, listener.stderr);
	assert.doesNotMatch(listener.stdout, new RegExp(`TCP \\*:${preview.port}`));
	assert.match(listener.stdout, new RegExp(`127\\.0\\.0\\.1:${preview.port}`));
});

test("stable favicon assets always revalidate", async () => {
	const headers = await readFile(
		new URL("../dist/_headers", import.meta.url),
		"utf8",
	);
	for (const path of [
		"/assets/apple-touch-icon.png",
		"/assets/favicon-48.png",
		"/assets/favicon.svg",
	]) {
		assert.match(
			headers,
			new RegExp(`${path.replaceAll(".", "\\.")}\\n  Cache-Control: public, max-age=0, must-revalidate`),
			`${path} should not retain a stale icon across deploys`,
		);
	}
});

test("Worker assets apply the complete static-site security policy", async () => {
	const headers = await readFile(
		new URL("../dist/_headers", import.meta.url),
		"utf8",
	);
	for (const expected of [
		"Content-Security-Policy: default-src 'none'",
		"base-uri 'none'",
		"connect-src 'none'",
		"form-action 'none'",
		"frame-ancestors 'none'",
		"Cross-Origin-Opener-Policy: same-origin",
		"Permissions-Policy:",
		"Referrer-Policy: strict-origin-when-cross-origin",
		"Strict-Transport-Security: max-age=31536000",
		"X-Content-Type-Options: nosniff",
		"X-Frame-Options: DENY",
	]) {
		assert.ok(headers.includes(expected), `missing ${expected}`);
	}
});

test("deploy artifact contains discovery files and no injected script markup", async () => {
	const [home, docs, robots, sitemap] = await Promise.all([
		readFile(new URL("../dist/index.html", import.meta.url), "utf8"),
		readFile(new URL("../dist/docs/index.html", import.meta.url), "utf8"),
		readFile(new URL("../dist/robots.txt", import.meta.url), "utf8"),
		readFile(new URL("../dist/sitemap.xml", import.meta.url), "utf8"),
	]);
	assert.doesNotMatch(home, /<script\b/i);
	assert.match(
		docs,
		/<script src="\/assets\/docs\.[a-f0-9]{8}\.js" defer><\/script>/,
	);
	assert.doesNotMatch(
		`${home}\n${docs}`,
		/static\.cloudflareinsights\.com|data-cf-beacon|\/cdn-cgi\/challenge-platform/i,
	);
	assert.match(robots, /^Sitemap: https:\/\/wyst\.dev\/sitemap\.xml$/m);
	assert.match(sitemap, /<loc>https:\/\/wyst\.dev\/docs\/<\/loc>/);
});

test("deploy artifact identifies its immutable source and public files", async () => {
	const [manifestSource, headers, wranglerConfig] = await Promise.all([
		readFile(new URL("../dist/.well-known/build.json", import.meta.url), "utf8"),
		readFile(new URL("../dist/_headers", import.meta.url)),
		readFile(new URL("../wrangler.jsonc", import.meta.url)),
	]);
	const manifest = JSON.parse(manifestSource);
	assert.equal(manifest.schema, 2);
	assert.match(manifest.siteCommit, /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/);
	assert.match(manifest.wystSourceCommit, /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/);
	assert.match(manifest.wystSnapshotSha256, /^[0-9a-f]{64}$/);
	assert.match(manifest.treeSha256, /^[0-9a-f]{64}$/);
	assert.match(manifest.releaseSha256, /^[0-9a-f]{64}$/);
	assert.deepEqual(Object.keys(manifest.releaseFiles), ["_headers", "wrangler.jsonc"]);
	assert.deepEqual(manifest.releaseFiles._headers, {
		sha256: createHash("sha256").update(headers).digest("hex"),
		size: headers.byteLength,
	});
	assert.deepEqual(manifest.releaseFiles["wrangler.jsonc"], {
		sha256: createHash("sha256").update(wranglerConfig).digest("hex"),
		size: wranglerConfig.byteLength,
	});
	assert.ok(manifest.files["/"], "manifest should map index.html to its canonical URL");
	assert.ok(manifest.files["/404.html"]);
	assert.ok(manifest.files["/docs/"]);
	assert.equal(manifest.files["/.well-known/build.json"], undefined);
	assert.equal(manifest.files["/_headers"], undefined);
});
