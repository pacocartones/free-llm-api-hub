### Changed and fixed

- `CONTRIBUTORS.md` lists all 36 outside contributors with a merged pull request (it listed 13).
  `npm run contributors` regenerates it from the merged pull requests through `gh`, leaving out
  maintainers and bots and listing no email, and it is now a step of every release (`RELEASING.md`).
  The first-merge thanks comment now suggests two open, unassigned good first issues, of the other
  kind when it can (data or code and docs), and CodeRabbit asks less of first-time contributors:
  scoped test reviews and no automatic replies in its threads. Agent-assisted.
