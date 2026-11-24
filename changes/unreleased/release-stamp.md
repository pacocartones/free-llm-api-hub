### Changed and fixed

- **For API and dataset consumers: `generated` now means the date of the dataset
  release, not the date of the last data change.** It changes only together with
  `version`, so between releases it stays at the release day while providers
  keep being re-verified. For how fresh one provider is, read its
  `last_verified` (and `data_policy.checked`, `free_limits.checked`), not
  `generated`. The same date is used by `/api/v1/*` (`generated`), the CSV
  column `dataset_generated`, `date-released` in `CITATION.cff` and the sitemap.
  No field is added, removed or renamed. Data pull requests no longer edit
  `generated` or `CHANGELOG.md` (changelog entries are now fragments in
  `changes/unreleased/`), so open data pull requests stop conflicting on those
  lines. The README freshness badge is now served by the site and refreshed on
  every deploy (#702).
