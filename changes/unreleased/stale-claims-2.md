### Added

- README.md now opens with a generated, citable first line: "Free LLM API
  list: N providers, checked <date>", the count from `data/providers.json`
  and the date from the dataset's own as-of day; the build refuses a README
  whose first line is not that headline (`scripts/lib/readme-headline.mjs`,
  `scripts/readme-headline.test.mjs`).
- `data/stale-claims.json` entries can name the public page a stale claim was
  seen on (`seen_url`, https only) and that page's own date (`seen_date`,
  left out when the page states none, shown as "not stated"); the provider
  page links it next to the claim.
