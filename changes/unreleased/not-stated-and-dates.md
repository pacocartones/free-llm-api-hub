### Changed and fixed

- A value the dataset does not hold reads "not stated" everywhere people read it: the pages, the README, llms.txt,
  llms-full.txt and the `.md` provider mirrors. It used to read "unknown", "not confirmed", "not recorded",
  "not specified", "none recorded", "no sample", "not listed" or "—" depending on the page. A recorded reason follows
  the words ("not stated in the provider's docs (checked 24 Nov 2026)"). The home explorer's column is now
  "Needs / not stated" and groups the flags as "Not stated: phone, training". llms-full.txt no longer says
  "text" for a provider without modalities. JSON keeps `null` and the `field_checks` reasons (`source_silent`,
  `needs_account`, `sources_disagree`) as they were; the API shape does not change.
- Dates people read use one format, "24 Nov 2026", inside `<time datetime="2026-11-24">` on the pages. JSON, the API,
  CSV, JSON-LD, sitemaps, feeds, llms.txt and the `.md` mirrors keep ISO dates.
- The wording comes from one helper, `scripts/lib/not-stated.mjs` (with the reasons in `REASON_LABEL`), and every
  date from `scripts/lib/dates.mjs`, which replaces the month tables and day helpers that were repeated in
  `stamp.mjs`, `provider-meta.mjs`, `state.mjs`, `changes.mjs`, `quality.mjs`, `freshness-histogram.mjs` and the
  scripts. CONTRIBUTING.md's style section states the rule.
