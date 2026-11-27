### Changed and fixed

- `npm run validate` now enforces the receipts rule: a `card_required`,
  `phone_required`, `commercial_ok` or `openai_compatible` value (true, false
  or `"conditional"`) needs a `stated` `field_checks` entry with the
  provider's own sentence, registered in `data/quotes.json`. Otherwise the
  flag must be `null` with its reason. Eight official pages that
  `quotes:add` cannot read are listed in a time-boxed allowlist (until
  2026-12-31) in `scripts/lib/field-checks.mjs`. An entry fails once its day
  has passed or once it is no longer needed. See `docs/quotes.md` (#950).
