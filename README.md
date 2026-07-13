# wyst.dev

Project homepage and generated documentation for [Wyst](https://github.com/wystlang/wyst),
a semantic ARM64 systems language. Deployed as static files to Cloudflare.

## Structure

```
index.html              Project notebook homepage
404.html                Generated custom not-found page (commit this)
assets/
  wyst.css              Shared design system (tokens, typography, components)
  docs.css              Documentation layout + prose + syntax-highlight colors
  …                     Fonts, icons, social imagery
docs/                   GENERATED — one folder per chapter/appendix (commit this)
robots.txt              Crawler policy and sitemap discovery
sitemap.xml             GENERATED — canonical public routes (commit this)
build/
  generate.mjs          Markdown → HTML generator
  generate-404.mjs      404 page generator
  generate-sitemap.mjs  Public route sitemap generator
  template.mjs          Shared page shell (header/footer/sidebar)
  prism-wyst.mjs        Prism grammar for the Wyst language
  serve.mjs             Tiny static server for local preview
tools/
  audit-site.mjs        Local routes, assets, fragments, and reachability gate
  audit-browser.mjs     Chrome mobile overflow and interaction gate
  audit-live-site.mjs   Post-deploy HTTPS, header, and injected-script gate
  prepare-worker-assets.mjs  Copies committed site files into .worker-assets/
```

The homepage and the docs share **one** design system (`assets/wyst.css`),
so they stay visually consistent. Generated HTML under `docs/` is committed,
so deploys remain plain static files with no build step on Cloudflare's side.

## Brand asset source

Website-ready brand exports and source design-system CSS snapshots come from
`wystlang/brand`. The site still serves assets from stable `/assets/...` URLs;
`tools/sync-brand-assets.mjs` replaces the brand-managed contents of this repo's
`assets/` directory from a local brand checkout while preserving site-owned
runtime assets. Removed manifest entries are pruned instead of lingering as
stale public assets.

The brand repo is not a submodule here. That keeps Cloudflare Workers Builds
from needing access to the private `wystlang/brand` repository during checkout.
Deploys use the committed static files in `assets/` and `.worker-assets/`.

To update website brand assets:

```sh
gh repo clone wystlang/brand ../brand # first time only, or set WYST_BRAND_DIR
npm run sync:brand
npm run build:worker-assets
git add assets .worker-assets
git commit -m "Update brand assets"
```

Only copy web-consumed exports and CSS into `assets/`. Keep source artwork,
brand guidelines, licensing notes, and marketing source materials in
`wystlang/brand`.

## Documentation source

The reference manual lives in the **compiler repo** (`wystlang/wyst`) under `design/`,
versioned alongside the compiler. This repo consumes generated HTML snapshots;
never edit docs here.

The generator resolves the docs directory in this order:

1. `WYST_DOCS_DIR` (env override)
2. `../wyst/design` (a sibling checkout)

### Local docs source

Keep `wystlang/wyst` checked out next to this repo, or set `WYST_DOCS_DIR`:

```sh
gh repo clone wystlang/wyst ../wyst
# or:
WYST_DOCS_DIR=/path/to/wyst/design npm run build
```

A fresh checkout of this repo does not need private submodule access. Cloudflare
deploys committed static files directly and does not regenerate docs during
deployment.

## Cloudflare deployment

Cloudflare Workers Builds deploys the static Worker named `wyst`.

The current Cloudflare trigger runs:

```sh
npx wrangler deploy
```

Wrangler deploys `.worker-assets/` as static Worker assets. That directory is a
committed deploy artifact containing `index.html`, `404.html`, `robots.txt`,
`sitemap.xml`, `assets/`, `docs/`, and generated `_headers`. CSS and JavaScript
filenames are fingerprinted inside `.worker-assets/assets/`. Regenerate and
commit the artifact whenever those source files change:

```sh
npm run build:worker-assets
git add .worker-assets
```

### Edge security settings

The artifact's generated `_headers` applies CSP, HSTS, clickjacking,
content-type, referrer, permissions, and opener policies. Two controls live at
the Cloudflare zone rather than in this repository and must remain configured:

1. Enable **SSL/TLS → Edge Certificates → Always Use HTTPS**. Static asset
   `_redirects` rules cannot match a protocol or domain, so this layer guarantees
   HTTP requests redirect before content is served.
2. Disable automatic **Web Analytics** injection and **Security → Bots →
   JavaScript Detections** (including Bot Fight Mode if it forces detections).
   The site intentionally ships only its fingerprinted documentation disclosure
   script; Cloudflare RUM and challenge scripts are not part of the site.

After each production deployment, verify both edge-owned controls and the
committed headers:

```sh
npm run audit:live
```

See Cloudflare's documentation for [Always Use HTTPS](https://developers.cloudflare.com/ssl/edge-certificates/additional-options/always-use-https/),
[Web Analytics automatic setup](https://developers.cloudflare.com/web-analytics/get-started/),
and [JavaScript Detections](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/javascript-detections/).

### Automatic regeneration (git hook)

A tracked `pre-commit` hook in `.githooks/` regenerates docs when their build
scripts change, then refreshes `404.html` and `.worker-assets/` whenever a
deployed source or artifact tool changes. It stages the generated files so the
deploy artifact cannot drift from its sources.

The hook is activated by pointing git at `.githooks/`, which the `prepare`
script does automatically on `npm install`. To enable it manually in an existing
checkout:

```sh
git config core.hooksPath .githooks
```

Note: the hook regenerates from your working tree, so commit the source change
and its artifact together (avoid committing a partial `git add -p` of a source
file without its matching artifact). Hooks don't run on Cloudflare — only the
committed artifact is deployed.

### CI integrity gate

`.github/workflows/site-integrity.yml` repeats the locked install, docs/sitemap
generation, Worker asset preparation, tests, full public-reference audit, and
all-route mobile Chrome audit. It fails if committed generated files drift.
Configure the repository secret `WYST_REPO_TOKEN` as a fine-grained, read-only
token for the private
`wystlang/wyst` repository so CI can read the authoritative design sources.

## Build

```sh
npm install
npm test                    # runs node --test tests/*.test.mjs
npm run audit               # checks routes/assets/fragments/reachability
npm run audit:browser       # checks every route at mobile width in Chrome
npm run build               # regenerates docs/ and sitemap.xml
npm run build:worker-assets # refreshes committed Worker deploy artifact
npm run audit:live          # verifies the deployed edge configuration
node build/serve.mjs        # preview at http://localhost:8347
```

## Updating the site when docs change

Docs are edited in the compiler repo. To publish those changes here:

```sh
# 1. edit + commit docs in the wystlang/wyst repo, then:
WYST_DOCS_DIR=/path/to/wyst/design npm run build
npm run build:worker-assets
git add docs
git add .worker-assets
git commit -m "Update docs to <description>"
git push                                    # Cloudflare deploys
```

The generated HTML committed here is the reviewable deploy artifact. The site
only changes when you deliberately regenerate and commit it.

Keeping `.worker-assets/` committed is intentional: the Cloudflare build trigger
runs `wrangler deploy` directly, and Wrangler uploads the configured directory as
it exists at deploy time. Committing the directory makes that input deterministic
and reviewable without requiring a separate build command in Cloudflare.
