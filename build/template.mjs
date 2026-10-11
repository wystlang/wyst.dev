// The HTML shell of each page. All pages share the header, the footer, and
// the design system of /assets/wyst.css.

export const SITE = "https://wyst.dev";
export const GITHUB_URL = "https://github.com/wystlang/wyst.dev";

const DESCRIPTION =
	"Wyst is an experimental ARM64 language and compiler for low-level code that stays readable without hiding machine behavior or cost.";

export function escapeHtml(s) {
	return String(s)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function head({ title, description, url, assets, stylesheets }) {
	const desc = escapeHtml(description || DESCRIPTION);
	const pageTitle = escapeHtml(title);
	const social = url
		? `
		<link rel="canonical" href="${SITE}${url}" />
		<meta property="og:type" content="website" />
		<meta property="og:site_name" content="Wyst" />
		<meta property="og:url" content="${SITE}${url}" />
		<meta property="og:title" content="${pageTitle}" />
		<meta property="og:description" content="${desc}" />
		<meta property="og:image" content="${SITE}/assets/social-card.png" />
		<meta property="og:image:width" content="1200" />
		<meta property="og:image:height" content="630" />
		<meta property="og:image:alt" content="The Wyst wordmark beside Wyst source code." />
		<meta name="twitter:card" content="summary_large_image" />`
		: "";
	const links = stylesheets
		.map((name) => `\n\t\t<link rel="stylesheet" href="${assets[name]}" />`)
		.join("");
	return `	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<meta name="color-scheme" content="dark" />
		<meta name="theme-color" content="#0B0D12" />
		<meta name="description" content="${desc}" />
		<title>${pageTitle}</title>${social}
		<link rel="icon" type="image/svg+xml" href="/assets/favicon.svg" />
		<link rel="icon" type="image/png" sizes="48x48" href="/assets/favicon-48.png" />
		<link rel="apple-touch-icon" sizes="180x180" href="/assets/apple-touch-icon.png" />${links}
	</head>`;
}

function header(active) {
	const current = active ? ' class="is-active" aria-current="page"' : "";
	return `	<header class="site">
		<div class="wrap nav">
			<a class="brand" href="/" aria-label="Wyst home">
				<img class="brand-wordmark" src="/assets/wordmark-accent.svg" width="87" height="48" alt="" aria-hidden="true" />
			</a>
			<nav class="nav-links" aria-label="Primary">
				<a href="/docs/"${current}>docs</a>
				<a href="${GITHUB_URL}" rel="noopener">source</a>
			</nav>
		</div>
	</header>`;
}

function footer() {
	return `	<footer class="site">
		<div class="wrap foot-simple">
			<p class="foot-simple-note"><b>“Wyst”</b> is pronounced “<b>wist</b>,” an old word meaning “to know.”</p>
			<a href="${GITHUB_URL}/blob/main/LICENSE.md" rel="noopener">license</a>
		</div>
	</footer>`;
}

function shell({ title, description, url, assets, bodyClass, body, scripts = [] }) {
	const stylesheets = bodyClass === "home-page" ? ["wyst.css"] : ["wyst.css", "docs.css"];
	const scriptTags = scripts
		.map((name) => `\n\t\t<script src="${assets[name]}" defer></script>`)
		.join("");
	return `<!doctype html>
<html lang="en">
${head({ title, description, url, assets, stylesheets })}
	<body class="${bodyClass}">
		<a class="skip" href="#main">Skip to content</a>
${header(bodyClass === "docs")}
${body}
${footer()}${scriptTags}
	</body>
</html>
`;
}

function sidebar(nav, currentUrl) {
	const mark = (url) => (url === currentUrl ? ' aria-current="page"' : "");
	const groups = nav
		.map(
			(group) => `<div class="doc-nav-group">
				<div class="doc-nav-title">${escapeHtml(group.title)}</div>
				<ul>
					${group.pages
						.map((page) => `<li><a href="${page.url}"${mark(page.url)}><span>${escapeHtml(page.title)}</span></a></li>`)
						.join("\n\t\t\t\t\t")}
				</ul>
			</div>`,
		)
		.join("\n\t\t\t");
	return `<aside id="doc-sidebar" class="doc-sidebar" aria-label="Documentation">
			<a class="doc-sidebar-home" href="/docs/"${mark("/docs/")}>Wyst documentation</a>
			${groups}
		</aside>`;
}

function pager(previous, next) {
	if (!previous && !next) return "";
	const link = (page, rel, label) =>
		page
			? `<a class="doc-pager-${rel}" href="${page.url}" rel="${rel}"><span>${label}</span>${escapeHtml(page.title)}</a>`
			: "<span></span>";
	return `
					<nav class="doc-pager" aria-label="Previous and next pages">
						${link(previous, "prev", "previous")}
						${link(next, "next", "next")}
					</nav>`;
}

// A documentation page: the sidebar, the article, and the "On this page"
// rail.
export function docPage({ assets, nav, page, previous, next, articleHtml, tocHtml }) {
	const toc = tocHtml
		? `<aside class="doc-toc" aria-label="On this page">
				<div class="doc-toc-title">On this page</div>
				${tocHtml}
			</aside>`
		: "";
	const body = `		<main id="main" class="doc">
			<div class="wrap doc-wrap">
				<button class="doc-sidebar-toggle" type="button" aria-expanded="false" aria-controls="doc-sidebar"><span aria-hidden="true">☰</span> Contents</button>
${sidebar(nav, page.url)}
				<article class="doc-article">
					<header class="doc-article-head">
						<span class="eyebrow">${escapeHtml(page.group)}</span>
						<h1>${escapeHtml(page.title)}</h1>
						${page.summary ? `<p class="doc-lede">${escapeHtml(page.summary)}</p>` : ""}
					</header>
					<div class="doc-body">
${articleHtml}
					</div>${pager(previous, next)}
				</article>
				${toc}
			</div>
		</main>`;
	return shell({
		title: `${page.title} · Wyst`,
		description: page.summary,
		url: page.url,
		assets,
		bodyClass: "docs",
		body,
		scripts: ["docs.js"],
	});
}

// The documentation home: an introduction and one card for each page,
// grouped as in the sidebar.
export function docIndexPage({ assets, nav, title, summary, introHtml }) {
	const card = (page) => `<a class="doc-index-card" href="${page.url}">
						<h3>${escapeHtml(page.title)}</h3>
						${page.summary ? `<p>${escapeHtml(page.summary)}</p>` : ""}
					</a>`;
	const groups = nav
		.map(
			(group) => `<section class="doc-index-group">
					<h2>${escapeHtml(group.title)}</h2>
					<div class="doc-index-grid">
						${group.pages.map(card).join("\n\t\t\t\t\t\t")}
					</div>
				</section>`,
		)
		.join("\n\t\t\t\t");
	const body = `		<main id="main" class="doc-index">
			<div class="wrap">
				<header class="doc-index-head">
					<h1>${escapeHtml(title)}</h1>
					<div class="doc-index-lede">${introHtml}</div>
				</header>
				${groups}
			</div>
		</main>`;
	return shell({
		title: `${title} · Wyst`,
		description: summary,
		url: "/docs/",
		assets,
		bodyClass: "docs",
		body,
	});
}

export function homePage({ assets, body }) {
	return shell({
		title: "Wyst: ARM64 language and compiler",
		description: DESCRIPTION,
		url: "/",
		assets,
		bodyClass: "home-page",
		body,
		scripts: ["home.js"],
	});
}

export function notFoundPage({ assets }) {
	const body = `		<main id="main" class="nf-main">
			<div class="nf">
				<span class="nf-eyebrow">404</span>
				<h1>Page not found</h1>
				<p class="nf-lede">No page has this address.</p>
				<nav class="nf-links" aria-label="Error page links">
					<a href="/">home</a>
					<a href="/docs/">docs</a>
				</nav>
			</div>
		</main>`;
	return shell({
		title: "Page not found · Wyst",
		description: "No page on wyst.dev has this address.",
		assets,
		bodyClass: "nf-page",
		body,
	});
}
