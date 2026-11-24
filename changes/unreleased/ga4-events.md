### Added

- Product events for the optional Google Analytics, sent only when a visitor
  has allowed the analytics category: clicks to a provider's own pages, copied
  snippet kinds, explorer filters, sorting and searches (cut to 60 characters,
  sent after a pause in typing), comparisons and collections viewed, and data
  file downloads. No parameter carries personal data. Provider pages and static
  comparisons mark their outbound links with `data-provider` and `data-link`.
  The event names and the recommended key events are listed in
  `docs/architecture.md`; the privacy page describes them.
