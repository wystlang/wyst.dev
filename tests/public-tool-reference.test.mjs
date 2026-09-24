import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { makeMd } from "../build/generate.mjs";

const toolSource = "../wync/tools/compare-compiler-facts/README.md";

test("the approved comparison guide and its owning manual have local reciprocal links", () => {
	const md = makeMd();
	assert.match(md.render(`[comparison](${toolSource})`),
		/href="\/docs\/tools\/compare-compiler-facts\/"/);
	assert.match(md.render("[manual](../../../design/inspection-reports.md)"),
		/href="\/docs\/inspection-reports\/"/);
	assert.match(md.render("[unapproved](../wync/tools/private/README.md)"),
		/href="\.\.\/wync\/tools\/private\/README\.md"/);
});

test("the comparison guide is published from its snapshot with the manual backlink", async () => {
	const html = await readFile(new URL(
		"../dist/docs/tools/compare-compiler-facts/index.html", import.meta.url), "utf8");
	assert.match(html, /<h1[^>]*>Compare compiler facts<\/h1>/);
	assert.match(html, /Run both source snapshots with the same compiler binary/);
	assert.match(html, /These tests do not measure reader comprehension/);
	assert.match(html, /href="\/docs\/inspection-reports\/"/);
	assert.doesNotMatch(html, /href="\.\.\/\.\.\/\.\.\/design\//);
});
