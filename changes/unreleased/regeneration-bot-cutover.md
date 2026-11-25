### Changed and fixed

- Regeneration bot cut-over, ready for `REGEN_MODE=push` and inert until then:
  in push mode a data pull request no longer regenerates or commits derived
  files. The required "Dataset integrity" check regenerates before its checks
  and blocks only derived files a pull request edits by hand, release pull
  requests that are not regenerated and drift outside the bot's allowlist; the
  site deploys after "Regenerate derived files" finishes on `main`; Lighthouse
  performance skips the bot's pushes. With any other mode every workflow
  behaves as before. See `docs/regeneration-bot.md` (#809).
