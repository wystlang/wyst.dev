# Repository Guidelines

## Project Structure & Module Organization

This repo is the static website and generated documentation site for Wyst.
`index.html` and `404.html` are hand-edited pages. Shared site styling and web
assets live in `assets/`; keep `assets/wyst.css` as the common design system and
`assets/docs.css` for documentation prose. `build/` contains the Markdown to
HTML generator, page template, Prism grammar, and local static server. `docs/`
is generated from the compiler repo's `design/` docs and must be committed.
`.worker-assets/` is also committed because Cloudflare deploys that artifact.

## Build, Test, and Development Commands

- `npm install`: install dependencies and configure the tracked git hooks.
- `npm test`: run Node test files under `tests/*.test.mjs`.
- `npm run build`: regenerate `docs/` from `WYST_DOCS_DIR` or `../wyst/design`.
- `npm run build:worker-assets`: regenerate `404.html` assets and refresh
  `.worker-assets/` for Cloudflare.
- `npm run sync:brand`: copy approved web assets from the local brand repo.
- `node build/serve.mjs`: preview the site at `http://localhost:8347`.
- `npm run deploy`: deploy with Wrangler.

## Coding Style & Naming Conventions

Use ES modules (`*.mjs`) for scripts and keep filenames lowercase and
descriptive. Keep CSS changes in the shared design-system files unless a page
needs truly local structure. Preserve stable asset URLs under `/assets/...`.
Generated docs should be changed by editing `wystlang/wyst` design sources, not
by hand-editing `docs/`.

## Testing Guidelines

Add site tests as `tests/<feature>.test.mjs` using Node's built-in test runner.
For visual or content changes, run `npm test` and preview with
`node build/serve.mjs`. When touching `index.html`, `404.html`, `assets/`, or
`docs/`, run `npm run build:worker-assets` and commit the matching
`.worker-assets/` update.

## Commit & Pull Request Guidelines

Use short imperative commit subjects such as `Tighten hero copy` or
`Sync social card from brand`. Pull requests should describe source and
generated artifact changes, list commands run, link related issues, and include
screenshots for layout, brand, or visual changes.
