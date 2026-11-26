### Changed and fixed

- Maintenance: a weekly, report-only source watch (`source-watch.yml`,
  `scripts/source-watch.mjs`) re-reads every page cited in `data/quotes.json`
  the way `npm run quotes:add` reads it and keeps one "Source watch: quotes to
  re-check" issue: quotes no longer on their page, per provider, and fetch
  errors that lasted two runs in a row (404/410 at once). It is closed when a
  run is clean. Pages whose text changed while the quote is still present are
  listed as low priority. It never edits data, uses no secret, has only
  `contents: read` and `issues: write`, and lists our own ids and URLs, never
  page text; the run-to-run memory lives in the issue body, not the repository.
  See `docs/update-playbook.md#source-watch` (#771).
