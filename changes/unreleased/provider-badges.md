### Added

- Provider badge kit: every provider now has a small SVG badge served by the
  site at `/badge/<slug>.svg` (and `/badge/<slug>-dark.svg`), in the Cálida
  colours, that reads "Free tier" or "Trial credit" and the date of our last
  verification, e.g. "Free tier · verified 24 Nov 2026". The text comes from
  the dataset on every build. A generic "Listed on Free LLM API Hub" badge sits
  at `/badge/listed.svg`. The new `/badges/` page gives copy-paste Markdown and
  HTML per provider, linking to `/p/<slug>`, the rules (a badge reflects only
  our verification and is not an endorsement) and how to request a correction.
  Each provider page links to its badge below the FAQ. `/badges/` is in the
  sitemap and llms.txt (#954).
