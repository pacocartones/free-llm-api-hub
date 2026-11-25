### Changed and fixed

- Maintenance: a pull-request preview for the regeneration bot,
  `regenerate-preview.yml`. It rebuilds the derived files on each pull
  request that touches data, scripts, docs or derived files, lists what a
  fresh build changes in the run summary, uploads the patch as the
  `regen-preview-patch` artifact, and reports what the drift gate planned
  for the switch to direct push would decide. It needs no GitHub App or
  secret, has a read-only token, never fails on drift, and is not a
  required check; the blocking gate in `verify.yml` is unchanged. See
  `docs/regeneration-bot.md` (#742).
