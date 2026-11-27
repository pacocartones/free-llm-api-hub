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
  `null` is never permission. First values for 82 providers: the 79 of the
  research, plus Google Cloud Text-to-Speech, Speech-to-Text and Vision API
  (Google Cloud Terms of Service 3.3, read on 2026-11-27): 29 with a stated
  multi-account answer (22 `true`, 6 `"conditional"`, 1 `false`) and 49 with a
  stated limit answer (48 `true`, 1 `false`). The 13 providers added since
  whose terms could not be read yet have neither flag, so their pages read Not
  stated. Provider pages show both
  under "What you need to start", reading forbidden, allowed, conditional or
  Not stated. The research, with every sentence, is in
  `docs/research/multi-account-terms-2026-11.md`; quotes were re-read on
  2026-11-26 and 2026-11-27 (agent-assisted reading).
