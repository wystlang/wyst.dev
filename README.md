# wyst.dev

Source for [wyst.dev](https://wyst.dev): the Wyst homepage and the Wyst
documentation. The site is static files, which an assets-only Cloudflare
Worker serves.

This repository is public so that its GitHub Actions use stays free.
**Public does not mean open source.** See [LICENSE.md](LICENSE.md) for the
license of each path.

## Layout

```text
content/docs/      The documentation pages, one Markdown file each
content/docs/nav.json
                   The sections of the documentation and the order of the pages
content/home/      The Wyst example of the homepage
build/             The build, the HTML templates, the Wyst highlighter, and the preview server
assets/            Styles, scripts, fonts, and images
tools/             The example check, which needs a Wyst compiler
tests/             Node tests of the built site
dist/              The built site; Git ignores it
```

## Commands

Node.js 22 or newer is necessary.

```sh
npm ci                  # install the locked dependencies
npm run build           # build the site into dist/
npm run serve           # preview dist/ at http://127.0.0.1:8347
npm test                # build into a temporary directory and test it
npm run deploy:dry-run  # build and check the Worker upload
```

## Writing documentation

Each page is `content/docs/<slug>.md`, at the URL `/docs/<slug>/`. A page
starts with front matter:

```markdown
---
title: Operators
summary: Arithmetic that wraps, division and shifts by constants, comparisons, and precedence.
---
```

`nav.json` gives the order of the pages, which is also the order of the
previous and next links. Link to another page with its URL, such as
`/docs/values/#strings`. `npm test` fails on a link to a page or a heading
that does not exist.

Write in ASD-STE100 Simplified Technical English. State current facts. For
a form that the grammar has but the compiler refuses, say that it is "not
implemented now", not that the language forbids it.

## Checking the examples

Each Wyst example must be correct for the current compiler. Build `wync`
from the `wystlang/wyst` repository, then run:

```sh
npm run check:examples -- ../wyst/wync/target/debug/wync
```

The command checks each example of the documentation and the homepage
with `wync fmt --check` and the checker. The info string of a fence selects
the check:

| Fence | Check |
| --- | --- |
| `wyst` | A module that the checker accepts. |
| `wyst name.wyst` | The same, with this file name. |
| `wyst fails` | A module that the checker refuses. The next fence is `text`, with the exact error. |
| `wyst dir/name.wyst` | A module that the other examples of the page import. |
| `wyst fragment` | Not checked. |

The homepage example, `content/home/hello.wyst`, also builds with its
layout. To see its output, run it on QEMU as `/docs/hello-world/` shows.

Run the check after each compiler change that affects the language. CI does
not run it, because the compiler repository is private.

## Deployment

A change reaches `main` through a pull request, which is squash-merged
after the check `Verify` passes. A push to `main` runs
`.github/workflows/site.yml`. It tests the site, builds it, and deploys
`dist/` with `wrangler deploy`. The `production`
environment holds the Cloudflare account ID and an API token with only the
Workers Scripts edit permission. `build/build.mjs` writes the security and
cache headers into `dist/_headers`.
