### Added

- One page per model, `/models/<model>/` (titled "Free API for" and the model name), for every
  model in the providers' free-model samples. The same model listed under
  different deployment names (`openai/gpt-oss-120b`, `gpt-oss-120b`,
  `@cf/…`, `…:free`) shares one page; a different size, version, date,
  quantisation or base/instruct suffix never does, and any other merge needs a
  reviewed entry in `scripts/lib/model-keys.mjs`. Each page shows the exact ID
  every provider lists, the plan, limits with their source and date, the
  card/phone/commercial flags, a quickstart when the provider is
  OpenAI-compatible, and says that model lists are a sample, not part of the
  verified core claim. Only models listed by two or more verified providers
  are indexed and in the sitemap; the others carry `noindex`. `/models/` and
  the provider pages link to them.
