### Added

- Synap by Linkrra (`synap`): a free tier on `qwen3-coder-30b` with no card,
  100,000 tokens and 50 requests a day for the first 7 days after sign-up, then
  50,000 tokens and 10 requests a day (10 a minute per key, reset 00:00 UTC),
  through the OpenAI-compatible `https://synap402.com/v1`. The free tier page
  says that tier runs only on GPUs dedicated to the model in its
  independent-operator network and never falls back to an upstream or
  third-party model. The privacy policy's broader clause still lets a request
  go to a zero-data-retention upstream provider when capacity is short. The
  privacy policy says API prompts and completions are not retained or used for
  training. Commercial use is not stated in the terms. Checked 2026-11-27,
  agent-assisted (issue #694). Thanks @weare-linkrra.

With this addition, 30 of 95 providers (31.6%) list no `text` modality, under
the 35% non-text guardrail.
