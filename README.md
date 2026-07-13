# wyst.dev

Source for [wyst.dev](https://wyst.dev), the project homepage and generated
reference manual for Wyst. The production site is an assets-only Cloudflare
Worker; GitHub Actions is its only build and deployment authority.

This repository is public so its standard GitHub Actions usage and repository
protections can remain free. **Public does not mean open source.** Most site
code, prose, and Wyst identity assets are all rights reserved. See
[LICENSE.md](LICENSE.md) for the path-by-path license map.

## Source and artifact model

Only source, imported snapshots, build programs, tests, and deployment
configuration belong in Git. The complete publication is rebuilt into the
ignored `dist/` directory:

```text
index.html                 Homepage source
assets/                    Site-owned styles, scripts, fonts, and images
vendor/wyst-design/        Versioned Wyst reference-source snapshot
vendor/wyst-snapshot.json  Hash manifest for imported design and fixture bytes
tests/fixtures/wyst/       Versioned Wyst sample fixtures used by tests
build/                     Documentation generator, templates, and local server
tools/                     Build, audit, snapshot, and reproducibility programs
.github/workflows/         Verification, release, and production monitoring
wrangler.jsonc             Assets-only Worker configuration
dist/                      GENERATED, ignored, and never committed
```

The build generates the documentation, sitemap, custom 404 page, fingerprinted
assets, and Cloudflare `_headers` directly into `dist/`. It also writes
`dist/.well-known/build.json`, which records the full site commit, the imported
Wyst snapshot digest and sync-time source-commit attribution, a deterministic
public tree hash, and the expected hash and size of every public file. A
separate release identity binds that tree to the non-public `_headers` file and
`wrangler.jsonc`; CI also pins the exact bytes of `build.json` itself. The
manifest deliberately contains no timestamp or CI run number.

Generated HTML and deployment bundles are not committed. Pull requests review
their source changes; CI supplies the generated result and proves that two
isolated builds are byte-identical.

## Local development

Node.js 22 or newer and Chrome or Chromium are required.

```sh
npm install
npm run build
npm run serve              # http://127.0.0.1:8347
```

The same verification used by pull requests is available locally:

```sh
npm test                   # clean build plus unit and regression tests
npm run test:fast          # read-only source tests used by pre-commit
npm run audit              # routes, assets, fragments, and sitemap
npm run audit:browser      # all routes/viewports plus keyboard, AX, CSP, and network gates
npm run audit:external     # external links (scheduled; intentionally not a PR gate)
npm run audit:dependencies # high/critical npm advisories (scheduled)
npm run verify:build       # build identity and byte hashes
npm run verify:determinism # two isolated builds must match exactly
npm run validate:assets    # Cloudflare limits, config, paths, headers, and HTML
npm run deploy:dry-run     # validate the Wrangler upload without credentials
npm run check              # all of the above, beginning with a clean build
```

The tracked pre-commit hook runs only the fast tests when relevant files are
staged. It never regenerates files and never calls `git add`. `npm install`
activates it through `core.hooksPath`; CI remains authoritative.

## Imported Wyst snapshots

The compiler repository remains the source of truth for the language design.
This public repository includes only the publication inputs and four example
fixtures required to build and test the site. `vendor/wyst-design/.source-commit`
records the source commit reported by the trusted local sync operation, while
`vendor/wyst-snapshot.json` hashes every imported design and fixture byte. The
build and public CI verify those committed bytes against the snapshot manifest;
they do not fetch the private/local upstream checkout and therefore do not
independently authenticate the commit attribution.

Refresh the snapshots from a sibling `../wyst` checkout or `WYST_REPO_DIR`:

```sh
npm run sync:wyst
npm run check
git add vendor/wyst-design vendor/wyst-snapshot.json tests/fixtures/wyst
```

Website-ready brand exports can similarly be refreshed from a sibling
`../brand` checkout or `WYST_BRAND_DIR`:

```sh
npm run sync:brand
npm run check
git add assets
```

Do not add `dist/`, generated documentation, or a Worker upload bundle to either
commit.

## GitHub verification and release

`.github/workflows/site.yml` runs for every pull request, every push to `main`,
and manual dispatches. Its `Verify` job has read-only repository permissions and
receives no deployment secrets. It installs the lockfile exactly, runs
`npm run check`, and verifies the build manifest.

For `main`, that job uploads the exact `dist/` tree as a one-day GitHub artifact,
including the normally excluded `.well-known/build.json`. The production job
downloads and re-verifies that artifact instead of rebuilding it. Before using
the protected production environment, a separate job confirms that the workflow
commit is still the tip of `main`. The protected job repeats that check after
admission, so an older queued run cannot deploy over a newer release.

The release then:

1. Verifies the downloaded artifact's public tree, release inputs, and exact
   manifest bytes against the checked-out release source.
2. Sorts Cloudflare deployments by `created_on` and requires the newest one to
   contain exactly one version at 100% traffic.
3. Uploads an undeployed version tagged with the full Git commit.
4. Stages the old version at 100% and the candidate at 0%.
5. Audits the candidate through the production hostname using a Cloudflare
   version-override header, exact artifact identity, and a full browser crawl.
6. Promotes the candidate to 100% and repeats the exact content and identity
   audit with bounded retries.
7. Restores the old version if the candidate audit fails, or rolls back to it if
   the post-promotion content audit fails.
8. Audits zone-owned HTTPS and injection policy separately. Policy drift fails
   and alerts without pointlessly rolling back otherwise-correct site content.

If no Worker exists, Wrangler's normal `deploy` command creates the first
version; if the Worker exists without a deployment, the uploaded candidate is
bootstrapped at 100%. Those explicit creation paths are audited immediately but
cannot promise rollback because no prior production version exists. Every
subsequent release must use the zero-percent staging path above.

Production deployments share a non-cancelling concurrency group, so a release
cannot be interrupted halfway through its safety sequence. The protected job
allows 30 minutes, while each Wrangler and audit subprocess has a shorter safety
timeout that returns control to the release script with time left to restore the
prior version.

`.github/workflows/monitor.yml` resolves the newest successful `production`
deployment recorded by the GitHub Environment, checks out that exact commit,
and rebuilds its expected artifact before performing a secretless HTTP, header,
and exact build-identity audit every day. It shares the production release lock
so it cannot inspect a half-finished deployment or mistake a pushed `main`
commit that has not yet been deployed for production. Once a week it also
renders every sitemap route in Chrome, checks external links with bounded
retries, and reports high or
critical npm advisories. Access-limited 403 and 429 responses are reported as
inconclusive, not broken links. These network-dependent checks stay out of the
pull-request gate. All audits can be started manually. GitHub automatically
disables scheduled workflows in inactive public repositories, so manual
dispatch remains available for recovery and diagnosis.

Dependabot checks both npm dependencies and pinned GitHub Actions weekly. Every
third-party action in the workflows is pinned to a full commit SHA.

## One-time repository configuration

After making the repository public:

1. Add a ruleset or branch protection rule for `main` that requires a pull
   request and the `Site / Verify` check.
2. Create a GitHub environment named `production`, restrict it to `main`, and
   optionally require manual approval.
3. Add `CLOUDFLARE_ACCOUNT_ID` as a repository or `production` environment
   variable.
4. Add `CLOUDFLARE_API_TOKEN` as a `production` environment secret. Use an
   account-owned token scoped only to the relevant account with **Workers
   Scripts: Edit**. The workflow does not require zone-route permission.
5. Disable Cloudflare Workers Builds/Git deployment for this Worker. GitHub must
   remain the sole release authority.

Set the GitHub Actions spending budget to `$0` with usage stopping at the limit.
Use standard Linux runners only; the workflows do not require paid runners or
long-lived GitHub artifacts.

## Cloudflare configuration

`wrangler.jsonc` publishes `./dist` with no Worker entry point, bindings, route,
preview URL, or `workers.dev` hostname. The existing `wyst.dev` custom domain is
managed in Cloudflare rather than by the deploy token, keeping its permissions
narrow.

The generated `_headers` supplies the content security policy and related
response protections. Cloudflare must also retain these zone-owned settings:

- **Always Use HTTPS** enabled.
- Automatic Web Analytics injection disabled.
- Bot JavaScript detections disabled when they would inject client code.

Before any upload, `npm run validate:assets` checks the exact artifact against
the Workers Free allowance of 20,000 files, the 25 MiB per-file ceiling, the
100-rule and 2,000-characters-per-line `_headers` limits, and a project-specific
25 MiB total release budget. It also rejects symlinks, URL-ambiguous or hidden
paths, case-folding collisions, unexpected Worker code or bindings, config that
re-enables preview hostnames, and malformed generated HTML. This complements
Wrangler's dry run, which does not perform a remote static-assets sync.

Check them at any time with:

```sh
npm run audit:live
```

The site uses only free Static Assets requests. The custom domain's registration
and renewal remain separate from Cloudflare hosting and GitHub CI costs.
