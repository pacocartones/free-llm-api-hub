### Added

- Structured data names who publishes the site and the dataset: Tweakeo, Inc.
  (the copyright holder in `LICENSE`) as `publisher` and Paco Cartones
  (GitHub `pacocartones`, the author in `CITATION.cff`) as `creator`. The home
  page carries one `@graph` with the `Dataset`, a `WebSite` node, the
  `Organization` and the `Person`, each with a stable `@id`
  (`https://freellmapihub.com/#website`, `#dataset`, `#publisher`,
  `#creator`). Every other page that names the site or the dataset refers to
  the same `@id` with the same publisher and creator. No email address is
  published.
- Provider pages' `WebPage` structured data carries `dateModified`, the
  `last_verified` date shown on the page.
- `sitemap-index.xml` lists `sitemap.xml` and `sitemap-state.xml`, so the
  monthly `/state/YYYY-MM/` reports can be found from one submitted sitemap.
  The post-deploy smoke test checks that it is published. `robots.txt` is
  unchanged.
