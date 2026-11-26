### Added

- Free tier limits pages, `/limits/<provider>/`, with an index at `/limits/`.
  Each page brings together the recorded facts about one free tier: the
  structured limits, the limits as the provider words them, the card, phone
  and commercial-use flags, the data policy and the verification date. Each
  fact links to its source page and shows its reading date, plus the
  provider's own sentence where the dataset records one. A flag nobody has
  confirmed is shown with the reason recorded in `field_checks` ("not stated
  by the provider", "needs an account to check", "provider pages disagree").
  The verified date appears in the title only while it is at most 30 days
  old. A page is built only for a verified entry inside the freshness window
  that has sourced `free_limits` and at least four of five sourced facts.
  Otherwise there is no page and no sitemap entry. A provider with a
  `keys_url` gets the same "Get a free key" button as on its provider page.
  10 pages today.
- Free alternatives pages, `/alternatives/<provider>/`, with an index at
  `/alternatives/`, for a fixed list of providers that people look for
  alternatives to. The alternatives are verified providers with the same
  primary modality, OpenAI-compatible when the original is, and a comparable
  free offer (an ongoing tier, or a trial for a trial). The closest come
  first, up to eight. Each row shows card, phone, limits, verified date and
  one line on how it differs, built from recorded fields. A page needs at
  least five qualifying providers. A provider on the Not free page
  (Cerebras, Mistral, Together AI today) gets no page here: the index links
  its Not free entry, which already lists the closest free alternatives.
  OpenAI has no free API tier: the index links its Not free entry and the
  free OpenAI API alternatives guide. 7 pages today.
- Provider pages get a "Hit the limit?" block that links their limits and
  alternatives pages when they exist, plus up to three similar providers.
  Every footer links both indexes. The new pages carry `WebPage` or
  `CollectionPage` + `ItemList` structured data with the same publisher and
  creator as the rest of the site. They have their own social images, are
  measured by the Lighthouse gate, and a test fails when two pages of the same
  template overlap more than 80 % (agent-assisted).
