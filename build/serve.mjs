// Minimal static file server for local preview of the generated site.
// Root is derived from this file's location so it never depends on cwd.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
const PORT = Number(process.env.PORT || 8347);

const TYPES = {
	".html": "text/html; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".svg": "image/svg+xml",
	".png": "image/png",
	".webp": "image/webp",
	".avif": "image/avif",
	".woff2": "font/woff2",
	".json": "application/json",
};

http
	.createServer((req, res) => {
		let urlPath = decodeURIComponent(req.url.split("?")[0]);
		let fsPath = path.join(ROOT, urlPath);
		try {
			if (fs.existsSync(fsPath) && fs.statSync(fsPath).isDirectory()) {
				fsPath = path.join(fsPath, "index.html");
			}
			if (!fsPath.startsWith(ROOT) || !fs.existsSync(fsPath)) {
				res.writeHead(404, { "content-type": "text/plain" });
				res.end("404");
				return;
			}
			const ext = path.extname(fsPath);
			res.writeHead(200, { "content-type": TYPES[ext] || "application/octet-stream" });
			fs.createReadStream(fsPath).pipe(res);
		} catch (e) {
			res.writeHead(500, { "content-type": "text/plain" });
			res.end(String(e));
		}
	})
	.listen(PORT, () => console.log(`serving ${ROOT} on http://localhost:${PORT}`));
