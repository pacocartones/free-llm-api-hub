### Added

- A monthly changes report on [`/state/2026-11/`](https://freellmapihub.com/state/2026-11/): "Free LLM API changes —
  November 2026", with the three changes that matter most, the month in numbers against October, the providers added
  and removed (with the reason from `data/not-free.json`), what changed for existing providers, data policies, what
  we couldn't confirm and how the report is made. The prose comes from a reviewed file,
  `content/state/2026-11.md`. Every count, list of names and date in it is filled from the data at build time
  (`scripts/lib/monthly-report.mjs`), and an unknown placeholder fails the build. The report has `Article` JSON-LD,
  is marked on [`/changes/`](https://freellmapihub.com/changes/) and is an item in both change feeds (`changes.xml` and
  `changes.atom`). A value the provider doesn't state reads "not stated", as everywhere else on the site.
  Agent-assisted.
- Every monthly `/state/YYYY-MM/` page with a month before it now also shows generated sections: the month against
  the month before in numbers, providers added and removed, data policies added or changed, and flags that moved to
  unknown with their recorded reason. December and later months get them with no file; a reviewed
  `content/state/YYYY-MM.md` adds the prose (see `content/state/README.md`).
