### Changed and fixed

- The published API schema `/api/v1/schema.json` now sets
  `additionalProperties: true` on every object (envelope, provider and nested
  objects such as `field_checks`), so a strict validator no longer rejects
  fields added within v1, such as `field_checks`, `published_speed` and
  `anonymous_access`. Listed fields keep their types, enums and required rules.
  The canonical `data/schema.json` stays closed, so `scripts/validate.mjs`
  still rejects a misspelt or undeclared field in the dataset. Clients holding
  an older copy of the schema should refresh it (`docs/api.md`).
  Agent-assisted (#760).
