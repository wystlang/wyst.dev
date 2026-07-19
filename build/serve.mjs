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
	".tsv": "text/tab-separated-values; charset=utf-8",
};

function publicFileIndex(publicRoot) {
	const files = new Map();

	function add(urlPath, file) {
		if (files.has(urlPath)) {
			throw new Error(`duplicate preview URL: ${urlPath}`);
		}
		files.set(urlPath, file);
	}

	function walk(directory, segments = []) {
		const entries = fs
			.readdirSync(directory, { withFileTypes: true })
			.sort((a, b) => a.name.localeCompare(b.name));
		for (const entry of entries) {
			if (
				entry.name === "_headers" ||
				(entry.name.startsWith(".") &&
					!(segments.length === 0 && entry.name === ".well-known"))
			) {
				continue;
			}

			const childSegments = [...segments, entry.name];
			const fullPath = path.join(directory, entry.name);
			if (entry.isDirectory()) {
				walk(fullPath, childSegments);
				continue;
			}
			// The generated artifact validator rejects links and special files. Ignore
			// them here as well so a custom preview tree cannot escape its root.
			if (!entry.isFile()) continue;

			const urlPath = `/${childSegments.join("/")}`;
			const file = {
				path: fullPath,
				contentType:
					TYPES[path.extname(entry.name)] || "application/octet-stream",
			};
			add(urlPath, file);
			if (entry.name === "index.html") {
				const directoryUrl = `/${segments.join("/")}`;
				if (directoryUrl === "/") {
					add("/", file);
				} else {
					add(directoryUrl, file);
					add(`${directoryUrl}/`, file);
				}
			}
		}
	}

	walk(publicRoot);
	return files;
}

function notFound(res, files) {
	const notFoundPage = files.get("/404.html");
	if (notFoundPage) {
		const body = fs.readFileSync(notFoundPage.path);
		res.writeHead(404, { "content-type": TYPES[".html"] });
		res.end(body);
		return;
	}
	res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
	res.end("404");
}

function requestedPath(req) {
	try {
		return decodeURIComponent((req.url || "/").split("?")[0]);
	} catch {
		return null;
	}
}

export function createPreviewServer({
	publicRoot = PUBLIC_ROOT,
	files,
	logError = (error) => console.error("preview request failed", error),
} = {}) {
	return http.createServer((req, res) => {
		try {
			// Refreshing the trusted index preserves live rebuilds without deriving a
			// filesystem path from the request URL.
			const publicFiles = files || publicFileIndex(publicRoot);
			const urlPath = requestedPath(req);
			const file = urlPath === null ? null : publicFiles.get(urlPath);
			if (!file) {
				notFound(res, publicFiles);
				return;
			}
			const body = fs.readFileSync(file.path);
			res.writeHead(200, { "content-type": file.contentType });
			res.end(body);
		} catch (error) {
			logError(error);
			if (res.headersSent) {
				res.destroy();
				return;
			}
			res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
			res.end("Internal Server Error");
		}
	});
}

if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	createPreviewServer().listen(PORT, HOST, () =>
		console.log(`serving ${PUBLIC_ROOT} on http://${HOST}:${PORT}`),
	);
}
