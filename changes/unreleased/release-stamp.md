### Changed and fixed

- **Nothing changes for API and dataset consumers:** `generated` in
  `/api/v1/*`, the site's `providers.json`, the CSV column
  `dataset_generated`, `llms.txt` and the sitemap still means the date of
  the last dataset change, now derived from the newest date recorded in the
  data. In the canonical `data/providers.json`, `generated` is now the
  dataset release date and changes only with `version`; `date-released` in
  `CITATION.cff` is that release date. Data pull requests no longer edit
  `generated` or `CHANGELOG.md` (changelog entries are fragments in
  `changes/unreleased/`), so open data pull requests stop conflicting on
  those lines. The README freshness badge is served by the site and refreshed
  on every deploy (#702).
