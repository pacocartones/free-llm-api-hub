### Changed and fixed

- Citable titles, after the first AEO baseline (27 Nov 2026: 0 of 26
  AI-assistant answers cited the site; the pages that were cited repeat the
  question and carry a count and a date). The highest-limits guide is now
  "Free LLM API with the highest limits (<month>): N tiers ranked" and opens
  with one table of every tier ranked by the requests and tokens per day it
  publishes (`free_limits` only, "not stated" otherwise). The
  OpenAI-compatible guide is "OpenAI-compatible free LLM APIs (N, checked
  <date>): base URLs" and lists each `openai_base_url`. `/collections/commercial-use`
  is "Free LLM API for commercial use: what each provider’s terms allow (N
  checked)". The home `<title>` reads "Free LLM API list (<month>): …". Every
  count and date is filled from the data; the h1, the JSON-LD names and
  llms.txt say the same as the `<title>` (`scripts/aeo-titles.test.mjs`).

### Added

- "What other sources get wrong" on the provider pages of Cerebras, Google
  Gemini and Groq: the stale figures assistants still repeat (Cerebras "1M
  tokens per day, free", Gemini "1,500 requests per day", Groq "14,400
  requests per day, with Llama 4"), each next to the current value with its
  quote or field, source and date. The claims live in
  `data/stale-claims.json` (claim, where it was seen, the day it was noted,
  the evidence); the build refuses an entry whose provider, quote or field it
  cannot resolve (`scripts/lib/stale-claims.mjs`,
  `scripts/stale-claims.test.mjs`).
