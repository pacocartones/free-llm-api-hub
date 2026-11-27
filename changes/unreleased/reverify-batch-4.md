### Changed and fixed

- Re-verified Deepgram, AssemblyAI and Jina AI (agent-assisted, official pages
  only, read 2026-11-27): `last_verified` moves to 2026-11-27, and their
  data-policy sentences were re-read (#946).
- Deepgram: the no-expiry passage now quotes the current pricing FAQ; the no-card
  and commercial-use flags carry the providers' sentences; `phone_required` is
  `null` (`source_silent`) (#946).
- AssemblyAI: the free tier adds the pricing FAQ's 185 hours of pre-recorded or
  333 hours of streaming transcription; the no-card and commercial-use flags carry
  the providers' sentences; `phone_required` is `null` (`source_silent`) (#946).
- Jina AI: `commercial_ok` is now `conditional`: the hosted API is covered by the
  service terms, but jina-embeddings-v4 has no commercial option, through the API
  either. `card_required` and `phone_required` are `null` (`source_silent`) (#946).
