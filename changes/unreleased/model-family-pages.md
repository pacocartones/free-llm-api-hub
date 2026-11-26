### Added

- One page per open model family at `/free-api/<family>/`, answering "Where can I use Qwen / Gemma / DeepSeek /
  Llama / GPT-OSS / GLM for free via API?": the six families listed by the most verified providers in the
  free-model samples when the pages were added (Qwen 14, Gemma 12, DeepSeek 10, Llama 8, GPT-OSS 8, GLM 8). Each
  page opens with a one-sentence answer that gives the count, the ongoing/trial split and the first three providers
  in the recommended order, then a table of the verified providers whose sample lists a model of the family: the
  exact model IDs (linked to their model page when one exists), the free limits, card, phone, commercial use and the
  last verification date, all from `data/providers.json`, with "Not stated" where a field is null. A short computed
  shortlist (no card and no phone, commercial use allowed, ongoing tier, OpenAI-compatible) follows. An ID that names
  two families belongs to the one it names first (`deepseek-r1-distill-qwen-32b` is DeepSeek). Pages carry a
  canonical URL, a title and description, `WebPage` + `BreadcrumbList` JSON-LD and the model-sample caveat; they are
  in the sitemap and `llms.txt` and linked from `/models/` while two or more verified providers list the family, and
  carry `noindex` otherwise (`scripts/lib/model-families.mjs`). The Lighthouse gate now also measures
  `/free-api/qwen/`. Agent-assisted.
