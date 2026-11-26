### Added

- Berget AI (`berget-ai`): a one-time €5 starting credit on the Trial plan of a
  Swedish, OpenAI-compatible open-model API. A card is required at sign-up but
  nothing is charged, and continued access needs a plan from €25 a month.
  Berget says it keeps no prompt data and does not train on it. Checked
  2026-11-26, agent-assisted (#903).
- Netlify AI Gateway (`netlify-ai-gateway`): the Free plan's 300 monthly
  Netlify credits can pay for model calls through the gateway at 180 credits
  per $1 of usage (at most about $1.67 a month), with a 90-credit-per-minute
  limit. Keys and base URLs are injected into Netlify Functions, and a
  production deploy is needed first. The gateway does not store prompts or
  outputs. Checked 2026-11-26, agent-assisted (#903).

With these additions, 25 of 79 providers (31.6%) list no `text` modality, under
the 35% non-text guardrail.
