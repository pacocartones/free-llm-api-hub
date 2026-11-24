### Changed and fixed

- Data pull requests no longer edit `generated` in `data/providers.json` or
  `CHANGELOG.md`: in the canonical file `generated` is now the dataset release
  date and changes only with `version`, and changelog entries are fragments in
  `changes/unreleased/`. So open data pull requests stop conflicting on those
  lines. **Nothing changes for API and dataset consumers:** `generated` in
  `/api/v1/*`, the site's `providers.json`, the CSV column `dataset_generated`,
  `llms.txt` and the sitemap still means the date of the last dataset change,
  now derived from the newest date recorded in the data. `date-released` in
  `CITATION.cff` is now the release date. The README freshness badge is served
  by the site and refreshed on every deploy (#702).
