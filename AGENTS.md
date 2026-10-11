# Repository Guidelines

This repository is the Wyst homepage and documentation. README.md gives the
layout and the commands.

## Rules

- The documentation describes the language that the compiler implements
  now. The `wystlang/wyst` design documents (`design/`) are the source of
  the facts. When the compiler and a page disagree, the page changes.
- Each Wyst example passes `npm run check:examples` with the `wync` of the
  current `wystlang/wyst` checkout. Copy error text from the compiler; do
  not write it by hand.
- For a form that the grammar allows but the compiler refuses, write "not
  implemented now". Never state it as a rule of the language. List it on
  `content/docs/status.md`.
- Write in ASD-STE100 Simplified Technical English. State current facts,
  not history.
- Keep the design: `assets/wyst.css`, `assets/docs.css`, and the class names
  in `build/template.mjs`. Brand assets come from the `brand` repository;
  keep their file names.
- Keep the build small: Node built-ins, `markdown-it`, `markdown-it-anchor`,
  and `prismjs`. Do not add self-checks of the build output.
- Never commit `dist/`, secrets, or local absolute paths.

## Checks

Before a commit, run `npm test`. After a change to an example or to the
compiler, also run `npm run check:examples -- <path to wync>`. Preview a
visual change with `npm run build && npm run serve`.

## Commits

Use short imperative subjects, such as `Document bit structs`.
