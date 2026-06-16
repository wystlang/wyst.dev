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
vendor/wyst/            Docs source — git submodule of wystlang/wyst (see below)
```

The landing page and the docs share **one** design system (`assets/wyst.css`),
so they stay visually consistent. Generated HTML under `docs/` and `roadmap/`
is committed, so deploys remain plain static files with no build step on
Cloudflare's side.

## Brand asset source

Website-ready brand exports come from `wystlang/brand`. The site still serves
assets from stable `/assets/...` URLs; `tools/sync-brand-assets.mjs` copies the
approved exports from a local checkout of the brand repo into this repo's
`assets/` directory.

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

Only copy web-consumed exports into `assets/`. Keep source artwork, brand
guidelines, licensing notes, and marketing source materials in `wystlang/brand`.

## Documentation source

The manual lives in the **compiler repo** (`wystlang/wyst`) under `design/`,
versioned alongside the compiler. This repo *consumes* it; never edit docs here.

The generator resolves the docs directory in this order:

1. `WYST_DOCS_DIR` (env override)
2. `vendor/wyst/design` (submodule — the production wiring)
3. `../wyst/design` (a sibling checkout — convenient for local work)

### Submodule

`vendor/wyst` is a submodule of `wystlang/wyst`, pinned to a specific commit.
It was added with the SSH remote (the repo isn't anonymously cloneable over
https):

```sh
git submodule add git@github.com:wystlang/wyst.git vendor/wyst
```

A fresh checkout of this repo needs `git submodule update --init` to populate
the docs submodule. Cloudflare's build environment needs access to
`vendor/wyst` if it fetches submodules during deploy; website brand assets are
committed directly, so Cloudflare does not need access to `wystlang/brand`.

## Build

```sh
npm install
npm run build        # regenerates docs/ and roadmap/
npm run docs         # alias for build
node build/serve.mjs # preview at http://localhost:8347
```

## Updating the site when docs change

Docs are edited in the compiler repo. To publish those changes here:

```sh
# 1. edit + commit docs in the wystlang/wyst repo, then:
git submodule update --remote vendor/wyst   # bump to the latest docs commit
npm run build                               # regenerate
git add docs roadmap vendor/wyst
git commit -m "Update docs to <description>"
git push                                    # Cloudflare deploys
```

The submodule SHA committed here is an explicit, reviewable pin: the site
documents exactly the docs commit you chose. The site only changes when you
deliberately bump it.

## One-time docs normalization

`tools/normalize-docs.py` was used once against `wystlang/wyst`'s `design/` to
(1) fix heading levels so each page has a single H1, and (2) add YAML
frontmatter (`title` / `group` / `order` / `summary`). It is fence-aware
(headings inside code blocks are never touched) and idempotent. Run it from the
compiler repo, not here:

```sh
python3 /path/to/wyst.dev/tools/normalize-docs.py /path/to/wyst/design
```
