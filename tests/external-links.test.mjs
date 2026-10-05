import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const auditScript = fileURLToPath(
	new URL("../tools/audit-external-links.mjs", import.meta.url),
);

async function fixture(t, body) {
	const directory = await mkdtemp(path.join(os.tmpdir(), "wyst-external-links-"));
	t.after(() => rm(directory, { recursive: true, force: true }));
	await writeFile(path.join(directory, "index.html"), body);
	return directory;
}

async function server(t, handler) {
	const instance = http.createServer(handler);
	instance.listen(0, "127.0.0.1");
	await once(instance, "listening");
	t.after(
		() =>
			new Promise((resolve) => {
				instance.closeAllConnections();
				instance.close(resolve);
			}),
	);
	return `http://127.0.0.1:${instance.address().port}`;
}

async function runAudit(root, { testOrigin = "" } = {}) {
	const child = spawn(process.execPath, [auditScript, "--root", root], {
		env: {
			...process.env,
			WYST_EXTERNAL_LINK_TEST_ORIGIN: testOrigin,
			WYST_EXTERNAL_LINK_RETRIES: "0",
			WYST_EXTERNAL_LINK_TIMEOUT_MS: "1000",
		},
	});
	let stdout = "";
	let stderr = "";
	child.stdout.setEncoding("utf8");
	child.stderr.setEncoding("utf8");
	child.stdout.on("data", (chunk) => {
		stdout += chunk;
	});
	child.stderr.on("data", (chunk) => {
		stderr += chunk;
	});
	const [status] = await once(child, "close");
	return { status, stdout, stderr };
}

test("external-link audit falls back to GET and tolerates access limits", async (t) => {
	const origin = await server(t, (request, response) => {
		if (request.url === "/head-blocked" && request.method === "HEAD") {
			response.writeHead(405).end();
			return;
		}
		if (request.url === "/forbidden") {
			response.writeHead(403).end();
			return;
		}
		if (request.url === "/limited") {
			response.writeHead(429).end();
			return;
		}
		response.writeHead(200).end("ok");
	});
	const root = await fixture(
		t,
		`<a href="${origin}/ok">ok</a>
		<a href="${origin}/head-blocked">fallback</a>
		<a href="${origin}/forbidden">forbidden</a>
		<a href="${origin}/limited">limited</a>`,
	);

	const result = await runAudit(root, { testOrigin: origin });
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /4 unique URL\(s\)/);
	assert.match(result.stdout, /2 inconclusive/);
	assert.match(result.stderr, /inconclusive external link \(403\)/);
	assert.match(result.stderr, /inconclusive external link \(429\)/);
});

test("external-link audit fails confirmed missing links with source locations", async (t) => {
	const origin = await server(t, (_request, response) => {
		response.writeHead(404).end();
	});
	const root = await fixture(t, `<a href="${origin}/missing#section">missing</a>`);

	const result = await runAudit(root, { testOrigin: origin });
	assert.notEqual(result.status, 0);
	assert.match(result.stderr, /external-link audit failed/);
	assert.match(result.stderr, /HTTP 404/);
	assert.match(result.stderr, /index\.html:1/);
});

test("external-link audit blocks private and metadata-network destinations", async (t) => {
	const root = await fixture(
		t,
		'<a href="http://169.254.169.254/latest/meta-data/">metadata</a>',
	);

	const result = await runAudit(root);
	assert.notEqual(result.status, 0);
	assert.match(result.stderr, /blocked non-public address 169\.254\.169\.254/);
});

test("external-link audit validates every redirect destination", async (t) => {
	const origin = await server(t, (_request, response) => {
		response.writeHead(302, {
			location: "http://169.254.169.254/latest/meta-data/",
		});
		response.end();
	});
	const root = await fixture(t, `<a href="${origin}/redirect">redirect</a>`);

	const result = await runAudit(root, { testOrigin: origin });
	assert.notEqual(result.status, 0);
	assert.match(result.stderr, /blocked non-public address 169\.254\.169\.254/);
});
