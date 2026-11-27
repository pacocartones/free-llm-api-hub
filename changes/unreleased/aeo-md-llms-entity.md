### Added

- Every provider page advertises its Markdown version in `<head>` with
  `<link rel="alternate" type="text/markdown">`, so an agent on the HTML page
  finds `/p/<slug>.md`.
- Every fact on a provider page has a stable anchor to cite it by:
  `#card`, `#phone`, `#commercial` and `#openai` join `#is-it-free`,
  `#limits`, `#quickstart`, `#data-policy` and `#faq`. A link to a fact inside
  the closed "What you need to start" box opens it.
- `/p/<slug>.md` opens its answer with the same answer-first sentence as the
  HTML page, cites the official docs and the verification day next to the
  provider's own words on limits, lists the anchor of each fact under
  "Cite a fact", and names the publisher (Tweakeo, Inc.), the creator
  (Paco Cartones) and the repository.
- `llms.txt` names the publisher, the creator and the repository at the top,
  says which anchors each provider page carries, and has an "API files"
  section linking the static JSON files and the CSV.

### Changed and fixed

- `/p/<slug>.md` writes an unknown as "not stated" (with its recorded reason),
  like the HTML page, instead of "unknown" or "not confirmed".
- The creator `Person` in the structured data of every page carries
  `alternateName` and `sameAs` (the GitHub account), not only on the home
  page. The `Organization` gets no `sameAs`: no public profile of Tweakeo is
  recorded, and none is invented.
