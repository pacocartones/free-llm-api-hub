### Changed and fixed

- Weekly re-verification (agent-assisted, official pages only) of five entries
  last verified 2026-11-14, with `field_checks` for the flags checked. Cerebras,
  Pinecone Inference and Datalab move `last_verified` to 2026-11-24. Datalab now
  gives new accounts a one-time credit that does not expire ($10 at signup plus
  $10 with a card on a work email, $5 plus $5 on a personal one) instead of a
  monthly allowance, so it moves to `trial` / `trial-credit` with a sourced
  `no_expiry`; its free rate limits are 25 requests/min and 25 concurrent, and
  its phone requirement is now unknown (needs an account). Pinecone's card
  requirement is not stated by Pinecone, so `card_required` becomes unknown.
  Google Gemini's notes add that API access to the 2.5 models is limited to
  existing users and that 2.5 Pro TTS has no free tier. OVHcloud AI Endpoints'
  data policy was re-read; its Free model labels could not be read, so OVHcloud
  and Gemini keep their `last_verified`.
