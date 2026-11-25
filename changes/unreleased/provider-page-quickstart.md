### Changed and fixed

- Provider pages put the quickstart snippet right after the free limits, before the speed figures, the data policy
  and the provider's own description: on `/p/groq` on a phone it moves from ~4,500px down the page to the second
  screen. Agent-assisted.
- The change history shows one entry per day and field: the commits of one day merge into one entry with the value
  before the day's first commit and after its last, and a field that ended the day where it started is left out.
  `/p/groq` listed "Updated the catch" ten times on 2026-11-24; it now lists it once. Limits and flag changes show
  before → after. The same history feeds `/changes/`, the monthly reports and `api/v1/history.json`, so November
  2026 counts 170 field changes instead of 362.
- A provider page suggests comparisons with providers of the same main modality (Groq: SambaNova Cloud, Sarvam AI,
  Scaleway; no longer Jina AI, an embeddings API), with the published compare page when there is one and the
  interactive view otherwise. No compare page is added or removed.
- Provider pages with published numeric limits lead their meta description with them, e.g. "Groq free tier: 30 RPM,
  1,000 RPD, 200K TPD, no card. Verified 24 Nov 2026 with source."; the others cut the free tier at a word.
- The score reads as a place ("#1 of 69 by score") with a bar of its six inputs, unknowns in grey, and the note that
  unknowns lower the score on purpose. The formula is unchanged.
- The 404 page has a search box that opens the explorer with the query and links six popular providers.
