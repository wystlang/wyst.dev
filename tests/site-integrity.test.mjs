import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const auditScript = fileURLToPath(
	new URL("../tools/audit-site.mjs", import.meta.url),
);

test("public CSS and routes pass the site integrity audit", () => {
	const result = spawnSync(process.execPath, [auditScript], { encoding: "utf8" });
	assert.equal(result.status, 0, result.stderr || result.stdout);
	assert.match(result.stdout, /site audit passed/);
});
