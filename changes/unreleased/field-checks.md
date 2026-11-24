### Added

- **`field_checks`: why a yes/no flag holds its value.** A new optional
  object on a provider records, for `phone_required`, `card_required`,
  `commercial_ok` and `openai_compatible`, the official pages read, the day,
  and either the provider's sentence (`stated`) or why the flag stays `null`:
  the pages do not say it (`source_silent`), only an account would tell
  (`needs_account`), or two official pages disagree (`sources_disagree`). A
  flag with no entry has no recorded check, which is never "no". It is
  additive in `/api/v1/` (documented in `docs/api.md`); the CSV does not
  carry it. Provider pages and comparisons show the reason and the day where
  they said "not confirmed", `/coverage/` splits each flag into open tasks
  and nulls resolved without an answer, and the MCP server adds
  `unconfirmed_reasons` and `excluded_unconfirmed_by_reason`. Stated quotes
  are registered in `data/quotes.json` as `field_sentence` entries
  (`npm run quotes:add -- <slug> --field <flag>`).

### Changed and fixed

- Flag values seeded on 2026-07-30 (and Tencent's card flag of 2026-08-14)
  with no recorded source, which no official page states on 2026-11-24
  (agent-assisted reading), are now `null` with their reason: Groq
  `phone_required` and `commercial_ok`; OpenRouter `phone_required`,
  `commercial_ok` and `card_required` (its terms say credits must be
  purchased to make API calls, its FAQ gives new users a free allowance);
  Cloudflare Workers AI `phone_required` and `commercial_ok`; Cohere
  `phone_required`; Tencent Hunyuan `card_required`. Cloudflare's
  `card_required: false` ("Start building for free — no credit card
  required.") and Cohere's `card_required: false` and `commercial_ok: false`
  now carry the provider's sentence. Tencent Hunyuan `phone_required` becomes
  `true`: Tencent Cloud's sign-up guide binds a mainland China phone number
  by SMS code. These five entries move `last_verified` to 2026-11-24.
- First recorded reasons for 22 more null flags, all read 2026-11-24, among
  them Modal and Alibaba Cloud Model Studio commercial use (not stated),
  Hugging Face phone (needs an account, #12) and SambaNova card (pages
  disagree).
