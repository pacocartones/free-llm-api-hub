### Added

- **Dataset 2.16.0: two terms flags for API routers.** `multi_account_forbidden`
  (`true`, `false`, `"conditional"` or `null`, with `multi_account_condition`
  saying which users or which part of the offer a conditional ban covers) records
  whether the provider's own terms forbid one person holding more than one
  account. `limit_circumvention_forbidden` (`true`, `false` or `null`) records
  whether they forbid getting around rate limits, quotas or usage limits by any
  means, rotating keys or accounts included. Both are optional, additive in
  `/api/v1/` and new CSV columns. Each recorded value has a `field_checks` entry
  with the provider's sentence (registered in `data/quotes.json`) or, for
  `null`, the reason `source_silent`: the terms were read and say nothing.
  `null` is never permission. First values for the 79 providers of the research
  (the 12 providers added since have neither flag yet, so their pages read Not
  stated): 26 with a
  stated multi-account answer (19 `true`, 6 `"conditional"`, 1 `false`) and 46
  with a stated limit answer (45 `true`, 1 `false`). Provider pages show both
  under "What you need to start", reading forbidden, allowed, conditional or
  Not stated. The research, with every sentence, is in
  `docs/research/multi-account-terms-2026-11.md`; quotes were re-read on
  2026-11-26 (agent-assisted reading).
