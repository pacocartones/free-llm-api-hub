### Changed and fixed

- Re-verified the eight oldest verifications (agent-assisted, official pages
  only, read 2026-11-26): Z.ai, OCR.space, Typhoon, Rime, Rev AI, Vercel AI
  Gateway, Sarvam AI and Photoroom move `last_verified` to 2026-11-26 (#925).
- Vercel AI Gateway: the free tier is now stated as a $5/month credit, and the
  getting-started page says free credits need a valid payment method on the
  team, so `card_required` is `true` (#925).
- Photoroom: `card_required` is `null` (`sources_disagree`): the API pricing
  FAQ says no card is needed, the terms say a Free Account must provide a
  payment method (#925).
- Typhoon: the API models page now lists four models (adds
  typhoon-v2.1-12b-instruct, drops five ids it no longer lists), and its
  rate-limit table adds typhoon-v2.1-12b-instruct. `commercial_ok`,
  `card_required` and `phone_required` are `null` (`source_silent`) (#925).
- Z.ai: `card_required` and `phone_required` are `null` (`source_silent`);
  `commercial_ok` keeps `true` with the terms' sentence recorded (#925).
- Rev AI: `card_required` is `null` (`source_silent`); a data policy is
  recorded (the terms allow training on speech-to-text Customer Content); the
  key page is linked (#925).
- OCR.space: card, phone and commercial-use flags now carry the providers'
  sentences, and a data policy is recorded (uploads deleted after processing) (#925).
- Sarvam AI: `commercial_ok` is now backed by the commercial licensing page;
  the unsupported "commercial production rights for Output" wording is replaced (#925).
- Rime and Photoroom: the API key pages are linked (#925).
