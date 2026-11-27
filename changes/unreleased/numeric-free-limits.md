### Changed and fixed

- Numeric `free_limits` for four more providers, each read on the provider's
  own limits or pricing page on 2026-11-26 (agent-assisted):
  - Google Gemini (`google-gemini`): 200 RPM and 10,000 RPD on the Free tier,
    for Gemini Decision 1 on the Decisions API only. That is the one Free-tier
    table the page publishes; it says other models' limits are shown in AI
    Studio.
  - Bytez (`bytez`): 10 requests per second on closed models on the Free plan.
  - Photoroom (`photoroom`): 1,000 sandbox calls a month on the Image Editing
    API.
  - Azure Speech (`azure-speech`): 20 requests per minute for F0 real-time
    text to speech, which the page words as "20 transactions per 60 seconds" (#941).
