# wyst.dev

Landing page and generated documentation for [Wyst](https://github.com/wystlang/wyst),
a semantic ARM64 systems language. Deployed as static files to Cloudflare.

## Structure

```
index.html              Landing page
assets/
  wyst.css              Shared design system (tokens, typography, components)
  docs.css              Documentation layout + prose + syntax-highlight colors
  …                     Fonts, icons, mascot art
docs/                   GENERATED — one folder per chapter/appendix (commit this)
roadmap/                GENERATED — from the compiler repo's roadmap.md
build/
  generate.mjs          Markdown → HTML generator
  template.mjs          Shared page shell (header/footer/sidebar)
  prism-wyst.mjs        Prism grammar for the Wyst language
  serve.mjs             Tiny static server for local preview
tools/
  normalize-docs.py     One-time docs source migration (see below)
  prepare-worker-assets.mjs
                          Copies committed site files into .worker-assets/
```

The landing page and the docs share **one** design system (`assets/wyst.css`),
so they stay visually consistent. Generated HTML under `docs/` and `roadmap/`
is committed, so deploys remain plain static files with no build step on
Cloudflare's side.

## Brand asset source

Website-ready brand exports and source design-system CSS snapshots come from
`wystlang/brand`. The site still serves assets from stable `/assets/...` URLs;
`tools/sync-brand-assets.mjs` copies the approved files from a local checkout
of the brand repo into this repo's `assets/` directory.

The brand repo is not a submodule here. That keeps Cloudflare Pages deploys
from needing access to the private `wystlang/brand` repository during checkout.
Deploys use the committed static files in `assets/`.

To update website brand assets:

```sh
gh repo clone wystlang/brand ../brand # first time only, or set WYST_BRAND_DIR
npm run sync:brand
git add assets
git commit -m "Update brand assets"
```

Only copy web-consumed exports and CSS into `assets/`. Keep source artwork,
brand guidelines, licensing notes, and marketing source materials in
`wystlang/brand`.

## Documentation source

The manual lives in the **compiler repo** (`wystlang/wyst`) under `design/`,
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
committed deploy artifact containing only `index.html`, `assets/`, `docs/`, and
`roadmap/`. Regenerate and commit it whenever those source files change:

```sh
npm run build:worker-assets
git add .worker-assets
```

### Automatic regeneration (git hook)

A tracked `pre-commit` hook in `.githooks/` runs the two steps above for you:
whenever a commit touches `index.html`, `assets/`, `docs/`, or `roadmap/`, it
regenerates `.worker-assets/` and stages it, so the deploy artifact can never
fall out of sync with the source (the cause of "I pushed but the live site
didn't change").

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

## Build

```sh
npm install
npm run build        # regenerates docs/ and roadmap/
npm run docs         # alias for build
npm run build:worker-assets # refreshes committed Worker deploy artifact
node build/serve.mjs # preview at http://localhost:8347
```

## Updating the site when docs change

Docs are edited in the compiler repo. To publish those changes here:

```sh
# 1. edit + commit docs in the wystlang/wyst repo, then:
WYST_DOCS_DIR=/path/to/wyst/design npm run build
npm run build:worker-assets
git add docs roadmap
git add .worker-assets
git commit -m "Update docs to <description>"
git push                                    # Cloudflare deploys
```

The generated HTML committed here is the reviewable deploy artifact. The site
only changes when you deliberately regenerate and commit it.

## One-time docs normalization

`tools/normalize-docs.py` was used once against `wystlang/wyst`'s `design/` to
(1) fix heading levels so each page has a single H1, and (2) add YAML
frontmatter (`title` / `group` / `order` / `summary`). It is fence-aware
(headings inside code blocks are never touched) and idempotent. Run it from the
compiler repo, not here:

```sh
python3 /path/to/wyst.dev/tools/normalize-docs.py /path/to/wyst/design
```
