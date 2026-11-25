### Changed and fixed

- Weekly re-verification batch for the week of 2026-12-01 (agent-assisted,
  official pages only, run 2026-11-25), with `field_checks` for the flags
  checked. AI Horde, SiliconFlow, Baseten and Camb.ai move `last_verified` to
  2026-11-25. AI Horde's rate limits now follow its service reference: 2/second
  and 90/minute per address on ordinary submit routes, 60/minute for text/chat
  status polling and a default account concurrency of 30. The per-API-key
  limits and the 10/minute image polling figure are gone, because the cited
  reference does not state them. SiliconFlow's phone requirement is now
  sourced: its privacy policy asks for a mobile number and a verification code
  at registration. Camb.ai's Free plan allows 500 characters per generation and
  watermarks videos. Its card requirement is not stated, and Baseten's card
  and phone requirements are still not stated. Nothing else changed for Baseten.
- OVHcloud AI Endpoints' data policy and anonymous rate limit were re-read, but
  its catalog's Free labels could only be partly read, so it keeps its
  `last_verified`. Google Gemini could not be re-read, because its docs now
  redirect to aistudio.google.com, so nothing changed for Gemini.
- Upstage's terms now show a version effective 2026-11-30, in which the quoted
  Article 22(6) sentence continues past "(including training)". The quote and
  its register entry drop the final period. The promotional exception is
  unchanged, so `trains_on_prompts` stays unknown (#771).
