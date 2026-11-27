### Added

- Three long-form guides that each rank one structured field, in the "how to choose" section of the
  [guides hub](https://freellmapihub.com/guides-and-collections/):
  [Free LLM APIs with the highest rate limits](https://freellmapihub.com/guides/free-llm-api-highest-limits)
  ranks the free text LLMs by their structured `free_limits`, one table per unit (requests per day, per minute and
  per second, tokens per day, per month), never converting one unit into another, and lists every free text LLM
  with no structured figure as "not stated" with its published limits in the provider's words;
  [The strongest free LLM APIs, by Arena rating](https://freellmapihub.com/guides/strongest-free-llm-api) ranks the
  free text LLMs with a rated free model by the public LMArena rating behind `model_tier` (rating, 95% interval,
  votes, tier and snapshot date), names the unrated ones and says the rating measures preference, not capability;
  [Free APIs for open models](https://freellmapihub.com/guides/free-open-source-llm-api) lists the providers whose
  free-model sample names a Qwen, Gemma, DeepSeek, Llama, GPT-OSS or GLM model, with the exact IDs, using the
  model-family pages' own rule and linking each family page. Each has a shortlist table, a FAQ whose `FAQPage`
  JSON-LD is the visible text, a gotchas section and links to the provider pages, a collection, `/compare/`,
  `/find/` and `/not-free/`. Every number, list and pick is computed from `data/providers.json` at build time
  (`scripts/lib/long-guides.mjs`). Agent-assisted.
