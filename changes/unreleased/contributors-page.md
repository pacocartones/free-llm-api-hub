### Added

- `/contributors/`: everyone whose work was merged, credited from the git
  history by GitHub handle (commit authors and co-authors, including commits
  carried over from forks), with their number of merged contributions, first
  contribution and kinds of work (data, site, docs, tests, CI). First-time
  contributors since the latest release are listed first, and the page points
  to good first issues and the contributing guide. `npm run contributors` now
  writes `data/contributors.json` and `CONTRIBUTORS.md` from the git history;
  the page builds from the committed file, without network. Linked from the
  footer, the sitemap, `llms.txt` and the README (#953).
