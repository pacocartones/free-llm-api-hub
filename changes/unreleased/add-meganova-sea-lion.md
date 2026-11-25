### Added

- MegaNova AI (`meganova`): an ongoing daily free quota of 50 requests per
  model at Tier 1 (free registration, no card) on selected models, among them
  its Manta Mini and Flash, Mistral Small 3.2, community roleplay fine-tunes,
  Qwen3 embeddings and the BGE reranker. Tier 1 allows 60 requests and 200,000
  tokens per minute, through an OpenAI-compatible API. `commercial_ok` stays
  unknown, recorded as `sources_disagree`: the site terms limit free modules
  to evaluation and interactive use, while the free-quota page mentions
  lightweight production use. Checked 2026-11-25, agent-assisted (#750).
- SEA-LION API (`sea-lion`): AI Singapore's free proof-of-concept API for its
  Southeast Asian-language models (instruct, reasoning, guard and embeddings),
  rate-limited to 10 requests per minute per user, through an
  OpenAI-compatible API. Its FAQ says the free API is not designed for
  production workloads, so `commercial_ok` is `false`. Checked 2026-11-25,
  agent-assisted (#750).
