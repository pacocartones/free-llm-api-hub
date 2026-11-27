### Added

- An Atom feed of provider changes at `/changes.atom`: one entry per ISO week,
  built from the same projected weeks as `api/v1/changes.json`, with tag-URI
  ids that never move and every date taken from the data. Every page, the home
  page and `/changes/` included, advertises it with a
  `<link rel="alternate" type="application/atom+xml">` next to the RSS feed.
  `scripts/changes-feed.test.mjs` checks it against the essentials of RFC 4287 (#957).
- `/changes/` opens with an answer-first summary of the latest week with a
  change: how many providers changed, how many ongoing free tiers ended and how
  many providers were added, then the changes provider by provider, with "not
  stated" for an unknown value (#957).

### Changed and fixed

- `changes.xml` now reads the same projected weeks as `api/v1/changes.json`,
  so RSS, Atom and the API list the same changes, and each item links to the
  monthly report that holds the week instead of a `/changes/` anchor that no
  longer exists (#957).
