### Added

- Three long-form guides under `/guides/`:
  [Free alternatives to the OpenAI API](https://freellmapihub.com/guides/openai-api-alternatives) (what to switch
  to for chat, embeddings, speech, vision and OCR, with each provider's `base_url`, published limits and check
  date), [How to choose a free LLM API for production](https://freellmapihub.com/guides/choose-free-llm-api-for-production)
  (a six-point checklist: commercial use, limits, data policy, signup, expiry and freshness, and what a `null` flag
  means) and [Free LLM and AI APIs with no credit card and no phone number](https://freellmapihub.com/guides/free-llm-api-no-credit-card-no-phone)
  (every such provider with its catch). The copy is editorial; every number, limit, flag, date and provider list in
  it is computed from `data/providers.json` and `data/not-free.json` at build time (`scripts/lib/long-guides.mjs`),
  so the pages follow the data. Each has a FAQ (`FAQPage` JSON-LD), its own social image, and is on the Guides &
  Collections hub, in the sitemap and in `llms.txt`; related collections and provider pages link to them.
  Agent-assisted.
