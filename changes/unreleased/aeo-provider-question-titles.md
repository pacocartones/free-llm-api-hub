### Changed and fixed

- Provider pages are titled by the question a developer asks, with its
  answer and a date, from the data (`scripts/lib/provider-title.mjs`): "Is
  the Groq API free? Yes: 30 RPM, 1,000 RPD (checked 2026-11-27)", "Does
  Cerebras have a free API? No: $5 trial (checked 2026-11-27)". The answer
  word comes from `category`, the catch from `free_limits`, the credit at the
  start of `free_tier` and `card_required`, and the date is the newest
  `last_verified` or field-check day ("check date not stated" when there is
  none). Titles stay under 65 characters: the catch is shortened first, then
  the short question and the short name are used. The `<title>`, the h1, the
  first clause of the meta description, the JSON-LD `WebPage` name, the first
  FAQ question, the `/p/<slug>.md` heading and the `llms.txt` line all use the
  same words. The answer under the h1 for a trial credit now opens with "No."
  (it was "Not permanently."), and the MCP server's `is_free` answer follows.
  URLs and canonicals are unchanged. Pinned in
  `scripts/aeo-provider-titles.test.mjs`.
