### Added

- Home page: a six-question FAQ below the provider table ("Is there a free LLM
  API?", highest limits, no credit card, commercial use, OpenAI-compatible, how
  fresh the data is). Every count, provider name and date in an answer is built
  from `data/providers.json` at build time (providers are named in the hub's
  recommended order, the table's order); an unrecorded value is counted as
  "not stated". The same answers feed a FAQPage node in the home page's JSON-LD
  `@graph`, so the visible text and the structured data are the same string
  (`scripts/lib/home-faq.mjs`, `scripts/home-faq.test.mjs`).
