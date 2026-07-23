# Repository Guidelines

## Project Structure & Module Organization

This repo is the static website and documentation site for Wyst. `index.html`,
`robots.txt`, `assets/`, `vendor/wyst-design/`, and the imported fixture snapshot
are authoritative publication inputs. `vendor/wyst-snapshot.json` binds every
imported byte. `build/` contains the Markdown-to-HTML generator, shared templates,
Prism grammar, and local server. `tools/` owns deterministic packaging and
artifact, browser, and production audits. `dist/` is generated, ignored, and
never committed; GitHub Actions deploys the exact verified `dist/` artifact.

## Build, Test, and Development Commands

- `npm ci`: install the exact dependencies from `package-lock.json`.
- `npm run build`: cleanly generate the complete site into `dist/` from the
  vendored Wyst snapshot.
- `npm test`: run Node test files under `tests/*.test.mjs`.
- `npm run check`: run the same build, test, artifact, browser, and determinism
  gates used by CI.
- `npm run audit:live`: audit the deployed production origin and exact build
  manifest.
- `npm run sync:brand`: copy approved web assets from the local brand repo.
- `npm run sync:wyst`: refresh the versioned Wyst documentation and fixture
  snapshots from an explicitly selected local compiler checkout.
- `node build/serve.mjs`: preview the site at `http://localhost:8347`.

## Coding Style & Naming Conventions

Use ES modules (`*.mjs`) for scripts and keep filenames lowercase and
descriptive. This repository owns the complete `assets/wyst.css` and
`assets/docs.css` implementations; keep their reusable visual decisions aligned
with the brand guidelines. Preserve stable asset URLs under `/assets/...`.
Generated docs should be changed by editing `wystlang/wyst` design sources,
refreshing `vendor/wyst-design/`, and rebuilding locally. Never edit or commit
`dist/`.

## Testing Guidelines

Add site tests as `tests/<feature>.test.mjs` using Node's built-in test runner.
For visual or content changes, run `npm run check` and preview with
`node build/serve.mjs`. Git hooks are convenience checks only: they must not
rewrite or stage generated files. Production deployment is owned exclusively by
the protected GitHub Actions workflow.

## Commit & Pull Request Guidelines

Use short imperative commit subjects such as `Tighten hero copy` or
`Sync social card from brand`. Pull requests should describe source changes,
list verification commands, link related issues, and include screenshots for
layout, brand, or visual changes. Generated deploy artifacts do not belong in
pull requests.
