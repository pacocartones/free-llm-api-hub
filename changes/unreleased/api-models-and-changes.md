### Added

- `/api/v1/models.json`, the free-model matrix: one record per model (the
  same keys and groups as the model pages `/models/<key>/`), with one row per
  provider that lists the model in its free-model sample. Each row carries the
  exact model ID, the plan, the card, phone, commercial-use and
  OpenAI-compatibility flags (projected to v1 types), the base URL, the data
  policy, the limits that apply to that model (`limits_scope`: published for
  that exact ID, provider-wide, none published or not recorded) and its
  provenance: the page to check it on and the day the entry was last verified.
  Only recorded values; `null` is never "no". Described by
  `/api/v1/models.schema.json`, listed in `/api/v1/index.json` and documented
  in `docs/api.md`. Agent-assisted.
- `/api/v1/changes.json` gains fields, all additive to v1: `schema`
  (`/api/v1/changes.schema.json`, new), `page`, `feed`, `fields` (the tracked
  fields and their labels), `window_weeks` and `count`; on each week `title`,
  `summary` and `guid`, the same as the matching item of `/changes.xml`, and
  `providers`; on each change `label` and `commit` (the git commit of the
  change). The existing fields keep their names, order and meaning.
  Agent-assisted.
- `free_limits.per_model` (optional, dataset schema): numbers a provider
  publishes for one model of its `models_free`, from the same page and reading
  day as the provider-wide limits. The validator requires the ID exactly as
  listed in `models_free`, once, with at least one number. Provider pages show
  the per-model numbers in their own table, and a model page shows the numbers
  for its exact ID, falling back to the provider-wide ones, marked as such. No
  provider carries it yet: it is filled only when an official page gives
  limits per model. `free_limits` stays one object, so v1 clients are
  unaffected. Agent-assisted.
