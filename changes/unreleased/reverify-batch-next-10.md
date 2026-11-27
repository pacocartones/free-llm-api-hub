### Changed and fixed

- Re-verified the next ten oldest verifications (agent-assisted, official pages
  only, read 2026-11-26): Upstage, Fireworks AI, Smallest.ai, Veryfi, Voyage AI,
  NVIDIA NIM, W&B Inference, AI21 Labs and Novita AI move `last_verified` to
  2026-11-26. Poolside was re-checked but stays unverified (#939).
- Veryfi: numeric `free_limits` added (100 requests a month: the pricing FAQ
  counts one API request per document); the no-card and commercial-use flags now
  carry the providers' sentences (#939).
- Upstage: the FAQ no longer mentions sign-up free credits, so the free tier now
  says what the pages state (keyless testing from the docs and Playground, 10
  free runs per Studio agent) and records it as anonymous access;
  `commercial_ok` is `null` (`source_silent`) (#939).
- Voyage AI: the pricing page now agrees that rerank-3 and rerank-3-lite get
  200M free tokens and no longer lists voyage-code-2; `card_required` is `null`
  (`source_silent`) (#939).
- W&B Inference: `card_required` and `commercial_ok` are `null`
  (`source_silent`); the pricing page describes the Free plan as for personal
  development (#939).
- Poolside: `card_required` is `null` (`source_silent`); the Platform page no
  longer renders without scripts, so the October 31 shutdown notice could not be
  re-read (#939).
- Fireworks AI, AI21 Labs, Smallest.ai and Novita AI: card and commercial-use
  flags now carry the providers' sentences (#939).
