### Added

- Five long-form guides organised by what you build, in a new "by what you're building" section of the
  [guides hub](https://freellmapihub.com/guides-and-collections/):
  [Free LLM APIs for coding assistants](https://freellmapihub.com/guides/free-llm-api-for-coding),
  [Free APIs to build a RAG app](https://freellmapihub.com/guides/free-api-for-rag),
  [Free LLM APIs for AI agents](https://freellmapihub.com/guides/free-llm-api-for-ai-agents),
  [Free LLM APIs for a chatbot side project](https://freellmapihub.com/guides/free-chatbot-api) and
  [Free AI APIs for students and learning](https://freellmapihub.com/guides/free-ai-api-for-students). Each has a
  "pick a stack" table, a comparison table, a quickstart filled from the data where the repository has one (chat,
  and for RAG an embeddings-plus-chat script with the picked providers' base URLs and free models), a FAQ whose
  `FAQPage` JSON-LD is the visible text, and links to `/find/` with its answers preset in the hash, the provider
  pages, the collections, `/compare/` and `/not-free/`. The coding guide shows the providers' published output
  speeds and structured rate limits; the agents guide says plainly that the dataset does not record tool calling and
  shows OpenAI compatibility, per-minute limits and commercial use instead; the chatbot guide checks every free text
  LLM against the `/find/` wizard's own card, phone, commercial-use and training rules, with unconfirmed checks
  shown as not confirmed; the students guide adds the no-account providers and the student programs from
  `data/programs.json`. Every number, list and pick is computed from the data at build time
  (`scripts/lib/long-guides.mjs`). Agent-assisted.
