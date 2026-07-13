# Cloudflare production contract

The `wyst` Worker serves only the static files built into `dist/`. It has no
Worker entry point, runtime bindings, storage products, or request-time code.

## Routing

- `https://wyst.dev` is the canonical production origin and is attached as a
  Worker custom domain.
- `https://www.wyst.dev/<path>` permanently redirects to
  `https://wyst.dev/<path>` and preserves the query string.
- The `workers.dev` route and public version preview URLs are disabled.
- HTTP redirects to HTTPS before static content is served.

## Client-side policy

- Security and cache headers are generated into `dist/_headers` during the
  deterministic build.
- Cloudflare Web Analytics injection remains disabled.
- Bot or challenge features must not inject `/cdn-cgi/` JavaScript into normal
  site responses.

The production audit enforces these externally observable controls after every
release and on a schedule. Dashboard-only settings are not silently changed by
application deployments.

## Deployment ownership

GitHub Actions is the only release authority. Cloudflare Workers Builds and its
Git repository connection are disabled. The production GitHub environment owns
an account-scoped token with only Workers Scripts edit permission; the account
identifier is stored as a non-secret environment variable.

Every established release uploads an immutable version tagged with the full Git
commit, adds it to the active deployment at zero percent, audits that version
through the production domain with a version override and browser crawl, and
promotes the same version to 100 percent. The audit pins the public tree,
non-public `_headers`, `wrangler.jsonc`, and the exact build-manifest bytes. A
failed post-promotion content audit restores the previously active version.
Zone-policy drift alerts without rolling back site content.

The explicit bootstrap path uses `wrangler deploy` only when Cloudflare returns
a Worker-not-found code, or deploys an uploaded version when the Worker exists
without a deployment. It is audited immediately; rollback begins with the
second release because a first deployment has no prior version.
