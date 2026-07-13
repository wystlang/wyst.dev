// Minimal static file server for local preview of the generated Worker asset.
// Roots are derived from this file's location so they never depend on cwd.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
const PUBLIC_ROOT = process.env.WYST_OUTPUT_DIR
	? path.resolve(process.env.WYST_OUTPUT_DIR)
	: path.join(ROOT, "dist");
const HOST = process.env.HOST || "127.0.0.1";
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
	".xml": "application/xml; charset=utf-8",
	".txt": "text/plain; charset=utf-8",
};

function notFound(res) {
	const notFoundPage = path.join(PUBLIC_ROOT, "404.html");
	if (fs.existsSync(notFoundPage)) {
		res.writeHead(404, { "content-type": TYPES[".html"] });
		fs.createReadStream(notFoundPage).pipe(res);
		return;
	}
	res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
	res.end("404");
}

function safePublicPath(req) {
	let urlPath;
	try {
		urlPath = decodeURIComponent(req.url.split("?")[0]);
	} catch {
		return null;
	}

	const relativePath = urlPath.replace(/^\/+/, "") || "index.html";
	const segments = relativePath.split("/");
	if (
		segments.some(
			(segment, index) =>
				(segment.startsWith(".") &&
					!(index === 0 && segment === ".well-known")) ||
				segment === "_headers",
		)
	) {
		return null;
	}

	let fsPath = path.resolve(PUBLIC_ROOT, relativePath);
	const relativeToRoot = path.relative(PUBLIC_ROOT, fsPath);
	if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
		return null;
	}

	if (fs.existsSync(fsPath) && fs.statSync(fsPath).isDirectory()) {
		fsPath = path.join(fsPath, "index.html");
	}

	return fsPath;
}

http
	.createServer((req, res) => {
		try {
			const fsPath = safePublicPath(req);
			if (!fsPath || !fs.existsSync(fsPath)) {
				notFound(res);
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
	.listen(PORT, HOST, () =>
		console.log(`serving ${PUBLIC_ROOT} on http://${HOST}:${PORT}`),
	);
