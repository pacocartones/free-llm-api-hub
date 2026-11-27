### Added

- Tooling for serving freellmapihub.com from a Cloudflare Worker with static
  assets, inert until the owner sets its variables: `scripts/parity-crawl.mjs`
  compares two origins URL by URL (status, redirect chain, canonical, robots,
  headers, body hash, both sitemaps) with an allow-list that needs a reason
  per entry; `web-deploy-trigger.yml` rebuilds the Worker when `main` moved
  past the live `/build.json`; `web-watch.yml` checks the live site every six
  hours or runs the parity crawl by hand; `smoke-live.mjs` takes `--origin`.
  With `WEB_HOST` = `cloudflare`, `pages.yml` no longer verifies or announces
  the Pages copy. See docs/architecture.md, "Hosting cutover".
