### Changed and fixed

- Re-verified five of the oldest verifications (agent-assisted, official pages
  only, read 2026-11-27): Contextual AI, Fish Audio, ModelScope, Pollinations.ai
  and Scaleway Generative APIs move `last_verified` from 2026-11-20 to
  2026-11-27. Their free tiers, limits and catches match the providers' own
  pages, and the quotes behind their flags were re-read.
- Pollinations.ai updated its Terms of Service on 2026-11-26. The commercial-use
  clause ("Model licences vary; verify before commercial use.") is unchanged.
  Its card and OpenAI-compatibility quotes now point at the README file on the
  default branch.
- Contextual AI: the billing guide cited for `card_required` now answers 404,
  so the check cites the pricing page and FAQ. The card requirement is still
  not stated.
- Fish Audio: the note on the free API model s2.1-pro-free now follows its
  launch post. It is built for experimentation and prototyping, with no SLA,
  uptime or TTFA guarantees, and requests may be used to improve model quality.
  The post does not support the earlier "smaller businesses" and "DPA" wording.
- Scaleway: the data policy was re-read (`data_policy.checked` 2026-11-27), and
  the flag checks now list only the pages read for them.
- NLP Cloud was re-checked but could not be read: nlpcloud.com answers HTTP 403
  to scripts and to a headless browser, so it keeps its `last_verified`
  (2026-11-20) and needs a reading in a normal browser.
