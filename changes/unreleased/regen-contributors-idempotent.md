### Changed and fixed

- The regeneration bot runs again. `derived-fingerprints.json` now pins the
  gitignored build outputs under `site/` instead of every output git does not
  track, so it no longer depends on the git index. The never-committed
  `/contributors/` page was pinned by the bot's first build and dropped by its
  second (after `git add -A` staged it), which failed the idempotence check on
  every push to main since #953 and held back the site deploy.
  `scripts/regen-idempotence.test.mjs` pins it (#926).
