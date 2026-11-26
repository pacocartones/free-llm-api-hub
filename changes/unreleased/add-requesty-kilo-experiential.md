### Added

- Requesty (`requesty`): a UK AI gateway whose free plan gives the models it
  lists as free at $0 per token, 200 requests a day and 20 a minute per
  organization, with no credit card, through the OpenAI-compatible
  `https://router.requesty.ai/v1`. On the free plan Requesty may train its own
  routing models on requests to models it labels Training Permitted Models,
  whose providers train on them too. Checked 2026-11-26, agent-assisted.
- Kilo Gateway (`kilo-gateway`): the API gateway behind Kilo Code serves its
  `:free` models at no cost, even without an account (200 requests an hour per
  IP address), through the OpenAI-compatible
  `https://ai-gateway.kilo.ai/api/v1`. Kilo warns that its Auto Free router may
  send prompts to providers that log them and use them to improve their
  services. Checked 2026-11-26, agent-assisted.
- Experiential Labs (`experiential-labs`): the Free plan of a US AI gateway
  gives 1M tokens a day shared across GPT-6 Luna, DeepSeek V4.1 Flash and the
  Clef decision endpoint (10 requests a minute), after a refunded $1 card
  verification. Free-plan prompts and outputs go into its Data Licensing
  Program: after de-identification they can be used to train AI models and
  sold to third parties. Checked 2026-11-26, agent-assisted.

With these additions, 25 of 82 providers (30.5%) list no `text` modality, under
the 35% non-text guardrail.
