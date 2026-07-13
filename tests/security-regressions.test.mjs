import assert from "node:assert/strict";
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

function hookPatternMatches(pattern, path) {
	return (
		spawnSync("grep", ["-Eq", pattern], {
			input: `${path}\n`,
			encoding: "utf8",
		}).status === 0
	);
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

test("pre-commit artifact rebuild trigger includes every deployed source directory", async () => {
	const hook = await readFile(new URL("../.githooks/pre-commit", import.meta.url), "utf8");
	const patterns = [...hook.matchAll(/grep -Eq '([^']+)'/g)].map((match) => match[1]);
	assert.ok(
		patterns.length >= 2,
		"pre-commit hook should separate docs and artifact inputs",
	);

	for (const path of [
		"index.html",
		"404.html",
		"assets/wyst.css",
		"docs/index.html",
		"build/generate.mjs",
		"build/generate-sitemap.mjs",
		"build/generate-404.mjs",
		"build/template.mjs",
		"build/prism-wyst.mjs",
		"tools/prepare-worker-assets.mjs",
		"robots.txt",
		"sitemap.xml",
		"package.json",
		"package-lock.json",
	]) {
		assert.equal(
			patterns.some((pattern) => hookPatternMatches(pattern, path)),
			true,
			`${path} should trigger rebuild`,
		);
	}
	assert.match(hook, /npm run --silent build\b/);
	assert.match(hook, /git add docs sitemap\.xml/);
	assert.match(hook, /git add 404\.html sitemap\.xml \.worker-assets/);
});

test("stable favicon assets always revalidate", async () => {
	const headers = await readFile(
		new URL("../.worker-assets/_headers", import.meta.url),
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
		new URL("../.worker-assets/_headers", import.meta.url),
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
		readFile(new URL("../.worker-assets/index.html", import.meta.url), "utf8"),
		readFile(new URL("../.worker-assets/docs/index.html", import.meta.url), "utf8"),
		readFile(new URL("../.worker-assets/robots.txt", import.meta.url), "utf8"),
		readFile(new URL("../.worker-assets/sitemap.xml", import.meta.url), "utf8"),
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
