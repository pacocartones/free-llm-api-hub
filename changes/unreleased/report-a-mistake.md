### Added

- Every provider page ends its FAQ with "Something wrong on this page? Report a
  mistake": a plain link to the data-correction issue form
  (`.github/ISSUE_TEMPLATE/inaccuracy.yml`) with the provider's slug, the title
  and the page's URL already filled in, and a link to how corrections work. The
  hero is unchanged, and nothing is loaded from GitHub until the link is
  clicked. Each provider row of a model-family page (`/free-api/<family>/`) has
  the same link under its verification date. `scripts/report-mistake.test.mjs`
  checks every page, every row and the form's field ids.
