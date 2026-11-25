### Changed and fixed

- New look, part 1 of the "Fingerprint + Receipts" brand: white or near-black grounds instead of terminal green, a
  magenta accent, one colour per modality (text, vision, image, speech, embeddings, rerank, OCR) and Roboto Flex
  with DM Mono for data. The site opens in the light theme unless the system asks for dark; the toggle still
  remembers the visitor's choice. Every colour keeps WCAG AA contrast in both themes (checked in CI), and a page's
  fonts stay under a 90 KB budget that the Lighthouse gate now enforces.
