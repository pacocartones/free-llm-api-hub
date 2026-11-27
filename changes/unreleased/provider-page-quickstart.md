### Changed and fixed

- Provider pages put the quickstart snippet right after the free limits, before the speed figures, the data policy
  and the provider's own description: on `/p/groq` it moves from 4,540px to 2,349px down the page on a phone and
  from 2,769px to 1,431px on a desktop. Agent-assisted (#789).
- A provider page suggests comparisons with providers of the same main modality (Groq: SambaNova Cloud, Sarvam AI,
  Scaleway; no longer Jina AI, an embeddings API), with the published compare page when there is one and the
  interactive view otherwise. No compare page is added or removed (#789).
- Provider pages with published numeric limits lead their meta description with them, e.g. "Groq free tier: 30 RPM,
  1,000 RPD, 200K TPD, no card. Verified 24 Nov 2026 with source."; the others cut the free tier at a word (#789).
- The score reads as a place ("#N of M scored") with a bar of its six inputs, unknowns in grey, and the note that
  unknowns lower the score on purpose. The formula is unchanged (#789, #891).
- The 404 page has a search box that opens the explorer with the query and links six popular providers (#789).
