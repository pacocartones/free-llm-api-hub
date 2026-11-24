### Added

- **`published_speed`: the speed a provider publishes, with its words
  (#606).** A new optional list on a provider records a speed figure only
  when the provider publishes it on its own site for a model of its free
  sample: `model`, `metric` (`output_tokens_per_second` or
  `time_to_first_token_ms`), `unit`, `value` exactly as written, the
  `qualifier` its words give (`exact`, `approx`, `at_least`, `up_to`),
  optional `conditions`, `plan_named`, `source`, `checked` and `quote`. The
  validator refuses a source off the provider's site, a figure the quote
  does not carry, a qualifier the quote contradicts, a figure attributed to
  a third party and a model outside `models_free`.
  Quotes are registered in `data/quotes.json` as `speed_quote` entries
  (`npm run quotes:add -- <slug> --speed`). Provider pages show a
  "Published speed" section, comparisons a "Published speed" row, and
  `llms-full.txt` a line; all say these are provider claims, not our
  measurement. Additive in `/api/v1/` (documented in `docs/api.md`); the CSV
  does not carry it. Recorded on 2026-11-24 for Groq (gpt-oss-120b,
  gpt-oss-20b), Cerebras (gpt-oss-120b, qwen-3.8-27b) and Sarvam AI
  (deepseekv4.1-flash-1017). No figure is stated for the free tier, and
  vendor figures are not comparable, so there is no "fastest" collection.

### Changed and fixed

- The README TL;DR row "The fastest inference" (Groq or SambaNova, "far
  faster than typical GPU-served APIs") had no source. It is now
  "Published speed figures", generated from `published_speed` and checked by
  a test: each provider's own figure for the model two providers publish,
  labelled as a claim that neither says applies to the free tier. The
  unsourced "fastest" wording also leaves the /best/ picks of Groq and
  SambaNova and Cerebras's `best_for`.
