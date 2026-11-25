### Changed and fixed

- The embeddings, speech, OCR and image-generation guides are now long-form guides, at the same URLs:
  [Free embedding APIs](https://freellmapihub.com/guides/free-embeddings-apis),
  [Free speech-to-text and text-to-speech APIs](https://freellmapihub.com/guides/free-speech-to-text-apis),
  [Free OCR and document-parsing APIs](https://freellmapihub.com/guides/free-ocr-document-ai-apis) and
  [Free image generation APIs](https://freellmapihub.com/guides/free-image-generation-apis). Each has who it is
  for, a comparison table (free limits, card and phone, commercial use, data policy, check date), how to choose,
  the gotchas from each entry's notes and the reasons a flag stays unconfirmed, and a FAQ (`FAQPage` JSON-LD). The
  embeddings guide has the repository's embeddings quickstart, filled from the data. The speech guide's
  speech-to-text and text-to-speech labels and the image guide's split between generation and other image APIs are
  read from the words of each entry, and the pages say so. Every number and list is computed from
  `data/providers.json` at build time (`scripts/lib/long-guides.mjs`). Agent-assisted.
