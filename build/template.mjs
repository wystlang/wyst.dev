// HTML shell shared by every generated page. Mirrors the homepage's
// header/footer markup (and class names) so the docs inherit the same design
// system from /assets/wyst.css.

export const GITHUB_URL = "https://github.com/wystlang/wyst";
const VERSION = "v0.8";

export function escapeHtml(s) {
	return String(s)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function head({ title, description, canonical }) {
	const desc = escapeHtml(
		description ||
			"Wyst is a personal ARM64 language and compiler project.",
	);
	return `	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<meta name="color-scheme" content="dark" />
		<meta name="theme-color" content="#0B0D12" />
		<meta name="description" content="${desc}" />
		<title>${escapeHtml(title)}</title>${
			canonical ? `\n\t\t<link rel="canonical" href="${canonical}" />` : ""
		}
		<link rel="icon" type="image/svg+xml" href="/assets/favicon.svg?v=6ed879ce" />
		<link rel="icon" type="image/png" sizes="48x48" href="/assets/favicon-48.png?v=090a1ea7" />
		<link rel="apple-touch-icon" sizes="180x180" href="/assets/apple-touch-icon.png?v=fd071720" />
		<link rel="stylesheet" href="/assets/wyst.css" />
		<link rel="stylesheet" href="/assets/docs.css" />
	</head>`;
}

function header(active = "") {
	const link = (href, label, key) =>
		`<a href="${href}"${active === key ? ' class="is-active" aria-current="page"' : ""}>${label}</a>`;
	return `	<header class="site">
		<div class="wrap nav">
			<a class="brand" href="/" aria-label="Wyst home">
				<span class="word">wyst</span>
				<span class="ver">${VERSION}</span>
			</a>
			<nav class="nav-links" aria-label="Primary">
				${link("/docs/", "manual", "docs")}
				<a href="${GITHUB_URL}" rel="noopener">source</a>
			</nav>
		</div>
	</header>`;
}

function footer() {
	return `	<footer class="site">
		<div class="wrap foot-simple">
			<p class="foot-simple-note">“<b>wist</b>” means to know.</p>
			<a href="${GITHUB_URL}#license" rel="noopener">license</a>
		</div>
	</footer>`;
}

const DOC_SIDEBAR_SCRIPT = `<script>
(() => {
	const t = document.querySelector(".doc-sidebar-toggle");
	const sb = document.querySelector(".doc-sidebar");
	if (t && sb) t.addEventListener("click", () => sb.classList.toggle("is-open"));
})();
</script>`;

function sidebar(navModel, currentUrl) {
	const groups = [
		["Chapters", navModel.filter((d) => d.group === "chapter")],
		["Appendices", navModel.filter((d) => d.group === "appendix")],
	];
	const sections = groups
		.filter(([, items]) => items.length)
		.map(([label, items]) => {
			const lis = items
				.map((d) => {
					const cur = d.url === currentUrl ? ' aria-current="page"' : "";
					const num = d.chapter
						? `<span class="doc-nav-num">${d.chapter}</span>`
						: d.appendix
							? `<span class="doc-nav-num">${d.appendix}</span>`
							: "";
					return `<li><a href="${d.url}"${cur}>${num}<span>${escapeHtml(d.navTitle)}</span></a></li>`;
				})
				.join("\n\t\t\t\t\t");
			return `<div class="doc-nav-group">
				<div class="doc-nav-title">${label}</div>
				<ul>
					${lis}
				</ul>
			</div>`;
		})
		.join("\n\t\t\t");
	return `<aside class="doc-sidebar" aria-label="Documentation">
			<a class="doc-sidebar-home" href="/docs/"${currentUrl === "/docs/" ? ' aria-current="page"' : ""}>Reference Manual</a>
			${sections}
		</aside>`;
}

function shell({ title, description, canonical, bodyClass, body }) {
	const sidebarScript =
		bodyClass === "docs" ? `\n\t\t${DOC_SIDEBAR_SCRIPT}` : "";
	return `<!doctype html>
<html lang="en">
${head({ title, description, canonical })}
	<body${bodyClass ? ` class="${bodyClass}"` : ""}>
		<a class="skip" href="#main">Skip to content</a>
${header(bodyClass === "docs" ? "docs" : "")}
${body}
${footer()}${sidebarScript}
	</body>
</html>
`;
}

// A full documentation page: sidebar + article + on-this-page rail.
export function docPage({
	title,
	description,
	canonical,
	navModel,
	current,
	eyebrow,
	articleHtml,
	tocHtml,
	pager,
}) {
	const prevNext = pager
		? `<nav class="doc-pager" aria-label="Chapter navigation">
					${pager.prev ? `<a class="doc-pager-link prev" href="${pager.prev.url}"><span class="dir">← Previous</span><span class="lbl">${escapeHtml(pager.prev.navTitle)}</span></a>` : "<span></span>"}
					${pager.next ? `<a class="doc-pager-link next" href="${pager.next.url}"><span class="dir">Next →</span><span class="lbl">${escapeHtml(pager.next.navTitle)}</span></a>` : "<span></span>"}
				</nav>`
		: "";
	const toc = tocHtml
		? `<aside class="doc-toc" aria-label="On this page">
				<div class="doc-toc-title">On this page</div>
				${tocHtml}
			</aside>`
		: "";
	const body = `		<main id="main" class="doc">
			<div class="wrap doc-wrap">
				<button class="doc-sidebar-toggle" type="button">☰ Chapters</button>
${sidebar(navModel, current.url)}
				<article class="doc-article">
					<header class="doc-article-head">
						${eyebrow ? `<span class="eyebrow">${escapeHtml(eyebrow)}</span>` : ""}
						<h1>${escapeHtml(current.h1 || title)}</h1>
						${current.summary ? `<p class="doc-lede">${escapeHtml(current.summary)}</p>` : ""}
					</header>
					<div class="doc-body">
${articleHtml}
					</div>
					${prevNext}
				</article>
				${toc}
			</div>
		</main>`;
	return shell({ title, description, canonical, bodyClass: "docs", body });
}

// The documentation home: a card grid grouped by Chapters / Appendices.
export function docIndexPage({
	title,
	description,
	canonical,
	navModel,
	h1,
	introHtml,
}) {
	const card = (d) => {
		const num = d.chapter
			? String(d.chapter).padStart(2, "0")
			: d.appendix || "";
		return `<a class="doc-index-card" href="${d.url}">
						<span class="num">${num}</span>
						<h3>${escapeHtml(d.navTitle)}</h3>
						${d.summary ? `<p>${escapeHtml(d.summary)}</p>` : ""}
					</a>`;
	};
	const group = (label, items) =>
		items.length
			? `<section class="doc-index-group">
					<h2>${label}</h2>
					<div class="doc-index-grid">
						${items.map(card).join("\n\t\t\t\t\t\t")}
					</div>
				</section>`
			: "";
	const chapters = navModel.filter((d) => d.group === "chapter");
	const appendices = navModel.filter((d) => d.group === "appendix");
	const body = `		<main id="main" class="doc-index">
			<div class="wrap">
				<header class="doc-index-head">
					<h1>${escapeHtml(h1)}</h1>
					${introHtml ? `<div class="doc-index-lede">${introHtml}</div>` : ""}
				</header>
				${group("Chapters", chapters)}
				${group("Appendices", appendices)}
			</div>
		</main>`;
	return shell({ title, description, canonical, bodyClass: "docs", body });
}

// Error pages use the same quiet working-copy language as the rest of the site.
// `fault` is an optional { code, text } monospace detail; `actions` is an
// optional array of plain links.
export function errorPage({
	title,
	description,
	eyebrow,
	fault,
	h1,
	bodyHtml,
	actions = [],
}) {
	const faultHtml = fault
		? `<p class="nf-fault"><code>${escapeHtml(fault.code)}</code><span>${escapeHtml(fault.text)}</span></p>`
		: "";
	const actionsHtml = actions
		.map((a) => {
			const rel = /^https?:/i.test(a.href) ? ' rel="noopener"' : "";
			return `<a href="${a.href}"${rel}>${escapeHtml(a.label)}</a>`;
		})
		.join("\n\t\t\t\t\t");
	const actionsBlock = actionsHtml
		? `<nav class="nf-links" aria-label="Error page links">\n\t\t\t\t\t${actionsHtml}\n\t\t\t\t</nav>`
		: "";
	const contentHtml = [faultHtml, bodyHtml, actionsBlock]
		.filter(Boolean)
		.join("\n\t\t\t\t");
	const body = `		<main id="main" class="nf-main">
			<div class="nf">
				<span class="nf-eyebrow">${escapeHtml(eyebrow)}</span>
				<h1>${escapeHtml(h1)}</h1>
				${contentHtml}
			</div>
		</main>`;
	return shell({ title, description, bodyClass: "nf-page", body });
}
