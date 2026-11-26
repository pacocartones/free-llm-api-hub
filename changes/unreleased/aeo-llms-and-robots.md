### Added

- `llms.txt` now opens with the dataset date and provider count and follows the
  llms.txt layout more closely: a "Start here" section (`/find/`, `/best/`,
  `/not-free/`, `/compare/`), the dataset pages (`/api/`, `/quality/`,
  `/embed/`, methodology), the guides, the collections, the credit programs
  and one line per provider with its free type, its limits in one line, its
  page and its Markdown version (#901).
- Every provider page has a Markdown version at `/p/<slug>.md`, built from the
  same record: the "is it free" answer, the limits, the flags with the pages
  read and the date, the quickstart and the links. It names `/p/<slug>` as its
  canonical page and is not listed in `sitemap.xml` (#901).

### Changed and fixed

- `robots.txt`: `Google-Extended` may now crawl the HTML pages as well as the
  data files. That token also decides whether Gemini may ground its answers on
  these pages and cite them. Every other AI training crawler still gets the
  data files only. The comments at the top of the file explain the policy, and
  `scripts/robots.test.mjs` checks it (#901).
- The header of `llms-full.txt` reads "Data of <date>", like the rest of the
  site (#901).
