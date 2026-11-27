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
- "What other sources get wrong" on eight more provider pages, from
  third-party lists read on 27 Nov 2026, each described with its own date
  (not named or linked):
  OpenRouter ("20 requests per minute and 200 requests per day"), Hugging Face
  ("$0.10 a month of free credits"), NVIDIA NIM ("40 requests per minute"),
  Jina AI ("1M free tokens"), Cloudflare Workers AI ("10K tokens per day"),
  Fireworks AI ("600 requests per minute"), AssemblyAI ("50 hours a month")
  and Deepgram ("$150 in free credits"). Each sits next to the current
  `free_tier`, `rate_limits` or `free_limits` value from
  `data/providers.json`. Cohere and SambaNova were checked too: the lists
  read that day repeat no stale figure for them, so they have no block.
