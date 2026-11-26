### Added

- A freshness histogram: how many verified entries become due (day 61) and
  pass the 90-day SLA (day 91) in each of the next 16 weeks, with clustered
  weeks marked. It is in the weekly worklist (issue #4) and on the
  [data coverage](https://freellmapihub.com/coverage/#freshness)
  page. Agent-assisted (#766).

### Changed and fixed

- The weekly re-verification batch (issue #4 and `npm run reverify`) now asks
  for at least 6 entries a week, the approved pace, and spreads same-day
  cohorts out: while a coming week has more than 8 entries becoming due (day
  61), entries due by then are pulled forward, oldest first, from 7 days old
  instead of waiting until they are 28 days old. Ties are broken by slug, so
  the batch does not depend on file order. This staggers the 45 entries
  verified on 2026-11-19 and 2026-11-20, which would otherwise all become due
  in the week of 2027-01-18 and overdue in mid-February. Agent-assisted (#766).
