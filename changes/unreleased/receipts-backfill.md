### Changed and fixed

- Receipts backfill for the four yes/no flags (`card_required`,
  `phone_required`, `commercial_ok`, `openai_compatible`): every flag that
  holds a value now has a `field_checks` entry, and all but eight carry the
  provider's own sentence, registered in `data/quotes.json` with its page and
  date. The eight are official pages that render only with JavaScript or
  refuse non-browser clients; they stay `stated` without a quote. The 13
  providers that had no `field_checks` now have them. Where no official
  sentence supports a value, the flag is now unknown with its reason
  (`source_silent`) instead of an unsupported answer: most `openai_compatible:
  false` values, and several `card_required: false` and `phone_required: false`
  values, including Groq's `card_required`. Corrections from the providers'
  own pages: Alibaba Model Studio and Scaleway need a payment method
  (`card_required: true`), Cerebras' free Developer credit is not for
  production (`commercial_ok: false`), Gemini's unpaid quota may not serve
  users in the EEA, Switzerland or the UK (`commercial_ok: "conditional"`),
  and Mixedbread, Fish Audio, AI Horde, Runware and Modal now document an
  OpenAI-compatible API (`openai_compatible: true`). Checked 2026-11-26 and
  2026-11-27, agent-assisted.
