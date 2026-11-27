### Changed and fixed

- Re-verified five of the twelve entries last verified on 2026-11-24
  (agent-assisted, official pages only, read 2026-11-27): Groq, OpenRouter,
  Cloudflare Workers AI, Cohere and Modal move `last_verified` to 2026-11-27.
  Their data policies, published speeds and flag quotes were re-read.
- Modal: the pricing page now gives the Starter plan 250 containers (was 100),
  with 10 GPU concurrency, 5 deployed crons and 1-day log retention unchanged.
- Groq: "no credit card required" is removed from `free_tier`, because no page
  read states it (`card_required` stays `null`, `source_silent`). The note on
  rate-limit scope now follows the page: organization level, not individual
  users.
- SambaNova keeps its 2026-11-24 verification: docs.sambanova.ai answers HTTP
  403 (a Vercel security checkpoint) to scripts and to headless Chromium, so the
  rate limits, Free Tier table and Preview-model note could not be re-read. Its
  stored values are kept and the affected `field_checks` say why.
