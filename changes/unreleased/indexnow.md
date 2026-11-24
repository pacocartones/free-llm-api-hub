### Added

- IndexNow: after each verified deploy, `pages.yml` sends the URLs whose
  sitemap entry is new or has a new `lastmod` to `api.indexnow.org`, which
  shares them with Bing, Yandex and the other participating engines. The list is
  capped at 100. The key file is served from the site root. The step is best
  effort and can never fail the deploy. See `docs/architecture.md`.
