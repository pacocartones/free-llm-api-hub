### Changed and fixed

- Maintenance: the derived files of a pull request, as a patch. When a
  pull request's derived files differ from a fresh build, the "Dataset
  integrity" check lists them in its run summary and uploads them as the
  `regen-preview-patch` artifact, so they can be applied with
  `git apply --binary` without a local build. It started as a separate
  `regenerate-preview.yml` workflow while the regeneration bot was in
  shadow mode (#742), and now runs inside `verify.yml` instead of a
  second full build of every pull request. See `docs/regeneration-bot.md`.
