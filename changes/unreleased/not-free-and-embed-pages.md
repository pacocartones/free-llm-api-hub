### Added

- A [`/not-free/`](https://freellmapihub.com/not-free/) page: the APIs people expect to be free and are not, or
  stopped being free (OpenAI, Anthropic, xAI, Together AI, DeepInfra, Mistral, GitHub Models, Cerebras and the
  other removals). Each entry gives what people expect, what the provider's own page says (with the quote already
  recorded in `docs/sources.md` or `data/quotes.json`), the day it was read, and the closest free alternatives in
  the dataset with a shared modality. It has a FAQ (with `FAQPage` JSON-LD) and is in the sitemap, the footer, the
  guides and the comparisons. The README's "Notably NOT free" section and the page are now generated from one
  file, `data/not-free.json`, so they cannot drift. Agent-assisted.
- A [`/embed/`](https://freellmapihub.com/embed/) page, "Use the data": a snippet generator for the widget (count,
  modality, category) with a live preview, the verified badge and each provider's badge, links to the JSON API,
  `providers.json` and `providers.csv`, and a Cite block (BibTeX and APA generated from `CITATION.cff` at build
  time). First-party script only. Linked from the footer, `/api/` and every provider page ("Embed this provider's
  badge"). Agent-assisted.

### Changed and fixed

- The `copy_snippet` GA4 event (sent only with analytics consent) recognises the widget snippet, which starts
  with `<div`, as `embed` instead of `other`, and takes two new values, `badge` and `citation`, from the code
  blocks of `/embed/`.
- The widget's "Could not load" fallback line takes the host page's text colour instead of a fixed grey that
  failed contrast on dark pages.
