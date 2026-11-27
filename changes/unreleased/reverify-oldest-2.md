### Changed and fixed

- Re-verified the next six of the oldest verifications (agent-assisted, official
  pages only, read 2026-11-27): Speechify API, Twelve Labs, Unreal Speech,
  Unstructured, Alibaba Cloud (Model Studio) and Cerebras move `last_verified` to
  2026-11-27. Their data policies, published speeds and flag quotes were re-read.
- Unstructured: the pricing page now gives the Personal plan "$150 in credit,
  one time" with no card, instead of 10,000 free pages. Documents then bill per
  page, from $0.002 (Fast) and $0.010 (Balanced) to $0.030 (VLM). The Transform
  page still says the first 10,000 pages are free, and the notes say so. The
  limits (100 MB per document, 50 MB for MCP clients, one document per request)
  were re-read on the Transform limits page.
- Unreal Speech: the API docs, labelled Text-to-Speech API v7, list a Free rate
  limit of 2 requests per second, so `rate_limits` now gives it. The "no credit
  card" note is removed, because no page read states it (`card_required` stays
  `null`, `source_silent`). `best_for` no longer calls the 250K characters
  monthly, because the pricing page does not say so.
- Twelve Labs: the "no credit card", "indexed data expires after 90 days" and
  "not OpenAI-compatible" notes are removed, because no page read states them.
  `free_limits` now cites the new-billing rate-limit page.
- Speechify: Simba 3.5's 333K-character Free allowance is in force, so
  `free_tier` states it as current. The note on voice agents is removed,
  because no page read mentions them.
