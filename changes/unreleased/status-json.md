### Added

- **`/api/v1/status.json`: freshness per provider, keyed by slug.** A small
  generated file for clients that poll the dataset, such as API routers: for
  every provider, `last_verified`, the oldest day among its `field_checks`,
  its state against the 60/90-day freshness SLA (`fresh`, `due`, `stale` or
  `unverified`), whether its free access is in effect (`free_now`) and the
  day of its newest field change. States are graded at `generated_at`, the
  dataset day, and the thresholds are in the file, so a client can regrade.
  Contract v1 with a JSON Schema at `/api/v1/status.schema.json`, listed in
  `index.json`, on `/api/` and in `llms.txt`, and documented in
  `docs/api.md`. Purely additive: no existing file changes shape.
