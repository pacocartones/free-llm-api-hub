### Added

- A post-merge regeneration workflow, `regenerate.yml`, in shadow mode and
  off by default (`REGEN_MODE` unset). After a push to `main` that changes
  canonical inputs it rebuilds the derived files from `main`, checks that
  every changed path is a generated target and that a second build changes
  nothing, then opens a draft pull request from `chore/regenerate-derived`
  through a dedicated GitHub App, or only reports the diff while no App is configured.
  Pull requests still ship their regenerated files until the switch to direct
  push; see `docs/regeneration-bot.md`.
