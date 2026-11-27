### Changed and fixed

- Maintenance: `npm run validate` now reports the data checks that only the
  build ran before: `data/not-free.json`, `data/stale-claims.json`,
  `data/redirects.json` and the ADVISORY-007 client-config guard. The rules and
  messages are unchanged and `scripts/build.mjs` still runs them. To prepare
  the website split, `scripts/validate.mjs` no longer imports an HTML renderer
  or reads `site/`: the guards moved to data modules (`scripts/lib/slug.mjs`,
  `not-free-data.mjs`, `stale-claims-data.mjs`, `free-limits.mjs`,
  `compare-pairs.mjs`), re-exported where they were. The provider-count check
  of `site/index.html` moved to `scripts/site-figures.test.mjs`, and
  `scripts/validate-graph.test.mjs` fails if the validator's imports reach a
  module that writes HTML. Every built file is unchanged.
