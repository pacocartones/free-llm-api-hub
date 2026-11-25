### Added

- A public data quality page, [`/quality/`](https://freellmapihub.com/quality/): the verified share, freshness
  (fresh, due and stale, and the last verification by week with the day each week turns due), the four yes/no flags
  as answered, null with a recorded reason or not checked, the coverage of `data_policy`, `free_limits` and
  `models_free`, and the non-text ratio under both definitions (no `text` in `modalities`, and `is_text_llm: false`).
  Every number is computed from `data/providers.json` at build time and dated by the dataset's as-of day; tables
  only, no script. Linked from the footer and the methodology, in the sitemap and in the Lighthouse gate.
  Agent-assisted.
