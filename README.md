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
build/
  generate.mjs          Markdown → HTML generator
  generate-404.mjs      404 page generator
  template.mjs          Shared page shell (header/footer/sidebar)
  prism-wyst.mjs        Prism grammar for the Wyst language
  serve.mjs             Tiny static server for local preview
tools/
  prepare-worker-assets.mjs
                          Copies committed site files into .worker-assets/
```

The homepage and the docs share **one** design system (`assets/wyst.css`),
so they stay visually consistent. Generated HTML under `docs/` is committed,
so deploys remain plain static files with no build step on Cloudflare's side.

## Brand asset source

Website-ready brand exports and source design-system CSS snapshots come from
`wystlang/brand`. The site still serves assets from stable `/assets/...` URLs;
`tools/sync-brand-assets.mjs` copies the approved files from a local checkout
of the brand repo into this repo's `assets/` directory.

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
committed deploy artifact containing `index.html`, `404.html`, `assets/`,
`docs/`, and generated `_headers`. CSS filenames are fingerprinted
inside `.worker-assets/assets/`. Regenerate and commit the artifact whenever
those source files change:

```sh
npm run build:worker-assets
git add .worker-assets
```

### Automatic regeneration (git hook)

A tracked `pre-commit` hook in `.githooks/` runs the two steps above for you:
whenever a commit touches `index.html`, `404.html`, `assets/`, or `docs/`, it
regenerates `.worker-assets/` and stages it, so the deploy
artifact can never fall out of sync with the source (the cause of "I pushed but
the live site didn't change").

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
npm test         # runs node --test tests/*.test.mjs
npm run audit    # checks CSS references and public-route reachability
npm run build        # regenerates docs/
npm run build:worker-assets # refreshes committed Worker deploy artifact
node build/serve.mjs # preview at http://localhost:8347
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
