### Changed and fixed

- Structured data: fixed the errors and warnings Google's Rich Results Test
  reported. Every `Dataset` node (on provider pages, `/not-free/`, `/api/`,
  `/quality/`, `/embed/` and the long guides) now carries a `description` (one
  sentence from the data: what is free, the verified-provider count and the
  data date) and the dataset's MIT `license`. Guide `Article`s name the
  maintainer as `author`, Tweakeo as `publisher`, the guide's OG image as
  `image`, and a `datePublished`. Every `datePublished` and `dateModified` is
  now a full ISO 8601 datetime with a timezone (`2026-11-24T00:00:00Z`). The
  home `Dataset` no longer has an `isPartOf` pointing at the `WebSite`, and
  provider pages are now `isPartOf` the `WebSite` and `about` the `Dataset`.
  `scripts/structured-data.test.mjs` walks every built page's JSON-LD and
  checks these rules.
