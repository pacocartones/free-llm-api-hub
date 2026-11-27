### Changed and fixed

- The change history counts each real change once. It now follows `main`'s first-parent line instead of every
  commit of every merged branch: with two pull requests open at the same time their commits interleaved, and each
  branch's revision undid the other's edits, so every flip counted as a field change. A merged pull request is now
  one revision, dated the day it landed, and a month-end snapshot is always `main`'s state (#798). The commits of
  one day also merge into one entry per field, with the value before the day's first commit and after its last; a
  field that ended the day where it started is left out, and limits and flag changes show before → after (#789).
  `/state/2026-11/` had reported 362 field changes for November 2026 where `main` had about 170, and `/changes/`,
  `changes.xml`, `api/v1/changes.json`, `api/v1/history.json`, the monthly reports and the provider pages'
  history repeated the same flips (`/p/groq` listed "Updated the catch" ten times on 2026-11-24; it now lists it
  once).
