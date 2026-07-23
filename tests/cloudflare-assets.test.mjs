import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
	DEFAULT_LIMITS,
	validateAssetInventory,
	validateCloudflareAssets,
	validateHeaders,
	validateHtml,
} from "../tools/validate-cloudflare-assets.mjs";

const packageJson = JSON.parse(
	await readFile(new URL("../package.json", import.meta.url), "utf8"),
);

const HTML = `<!doctype html>
<html lang="en"><head><title>Fixture</title></head>
<body><main id="main"><h1>Fixture</h1><img src="pixel.png" alt=""></main></body></html>
`;

test("canonical Worker-assets build command uses the deterministic builder", () => {
	assert.equal(
		packageJson.scripts["build:worker-assets"],
		"node tools/prepare-worker-assets.mjs",
	);
});

async function makeFixture(t) {
	const fixture = await mkdtemp(path.join(os.tmpdir(), "wyst-cloudflare-assets-"));
	t.after(() => rm(fixture, { recursive: true, force: true }));
	const publicRoot = path.join(fixture, "public");
	await mkdir(path.join(publicRoot, ".well-known"), { recursive: true });
	await Promise.all([
		writeFile(path.join(publicRoot, ".well-known", "build.json"), "{}\n"),
		writeFile(path.join(publicRoot, "404.html"), HTML),
		writeFile(path.join(publicRoot, "_headers"), "/*\n  X-Content-Type-Options: nosniff\n"),
		writeFile(path.join(publicRoot, "index.html"), HTML),
		writeFile(path.join(publicRoot, "robots.txt"), "User-agent: *\nAllow: /\n"),
		writeFile(path.join(publicRoot, "sitemap.xml"), "<urlset></urlset>\n"),
	]);
	return { fixture, publicRoot };
}

test("Cloudflare validator accepts the intended assets-only release shape", async (t) => {
	const fixture = await makeFixture(t);
	const result = await validateCloudflareAssets(fixture);
	assert.equal(result.files.length, 6);
	assert.equal(result.headerRules, 1);
	assert.ok(result.totalSize > 0);
});

test("asset inventory rejects symlinks and URL-ambiguous paths", async (t) => {
	const fixture = await makeFixture(t);
	await symlink("index.html", path.join(fixture.publicRoot, "linked.html"));
	await assert.rejects(
		validateAssetInventory(fixture.publicRoot),
		/symbolic links are not deployable: linked\.html/,
	);
	await rm(path.join(fixture.publicRoot, "linked.html"));
	await writeFile(path.join(fixture.publicRoot, "bad name.txt"), "bad");
	await assert.rejects(
		validateAssetInventory(fixture.publicRoot),
		/unsafe or URL-ambiguous asset path: bad name\.txt/,
	);
});

test("asset inventory enforces count, individual-size, and total-size budgets", async (t) => {
	const fixture = await makeFixture(t);
	await assert.rejects(
		validateAssetInventory(fixture.publicRoot, {
			...DEFAULT_LIMITS,
			maxFiles: 5,
		}),
		/artifact contains 6 files/,
	);
	await assert.rejects(
		validateAssetInventory(fixture.publicRoot, {
			...DEFAULT_LIMITS,
			maxFileSize: 8,
		}),
		/is .*Cloudflare allows 8 bytes per file/,
	);
	await assert.rejects(
		validateAssetInventory(fixture.publicRoot, {
			...DEFAULT_LIMITS,
			maxTotalSize: 32,
		}),
		/artifact totals .*project release budget is 32 bytes/,
	);
});

test("_headers validation enforces Cloudflare rule and line limits", () => {
	const tooManyRules = Array.from(
		{ length: 101 },
		(_, index) => `/path-${index}\n  X-Test: value\n`,
	).join("");
	assert.throws(() => validateHeaders(tooManyRules), /Cloudflare allows 100/);
	assert.throws(
		() => validateHeaders(`/*\n  X-Test: ${"x".repeat(2_001)}\n`),
		/_headers:2 exceeds 2000 characters/,
	);
	assert.throws(
		() => validateHeaders("/safe\n  X-Test: value\n/unsafe/../*\n  X-Test: value\n"),
		/target must not traverse directories/,
	);
});

test("static HTML sanity rejects duplicate IDs and missing alternative text", () => {
	assert.throws(
		() => validateHtml(HTML.replace("<h1>", '<h1 id="main">'), "index.html"),
		/duplicate IDs: main/,
	);
	assert.throws(
		() => validateHtml(HTML.replace(' alt=""', ""), "index.html"),
		/image elements without alt attributes/,
	);
	assert.throws(
		() =>
			validateHtml(
				HTML.replace(
					"<title>Fixture</title>",
					"<title><strong>Fixture</strong></title>",
				),
				"index.html",
			),
		/title must not contain raw markup/,
	);
});
