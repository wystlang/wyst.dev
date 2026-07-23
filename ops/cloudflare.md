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
- Persisted Worker logs and traces remain disabled in the Cloudflare project
  settings.

The production audit enforces these externally observable controls after every
release and on a schedule. Dashboard-only settings are not silently changed by
application deployments.

## Deployment ownership

The protected GitHub repository is the release authority. Cloudflare's GitHub
connection builds and publishes `main`; GitHub Actions verifies the same source
but stores no Cloudflare deployment token and invokes no deployment CLI.

The production integration reports the deployed commit through GitHub
Deployments. Scheduled audits rebuild that exact commit, authenticate the public
tree, non-public `_headers`, and exact build-manifest bytes, and compare them
with production responses. Zone-policy drift is reported separately from
content drift.
