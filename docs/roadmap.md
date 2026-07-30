# Roadmap

Direction, not dated promises. The north star: stay the **most trustworthy, current and builder-useful reference for free LLM APIs** — without drifting into a generic "AI tools" directory.

## Principles that won't change

- **Builder-first.** Every field earns its place by helping someone choose an API to build on.
- **Trust over coverage.** A smaller, verified, honestly-flagged list beats an exhaustive stale one.
- **Data is the product.** Docs and site stay generated from `data/providers.json`.
- **Narrow scope.** Free *developer* model APIs and directly adjacent ones — not consumer chatbots, not every SaaS with a free plan.

## Now

- Keep the 90-day freshness bar green; re-verify entries as their dates age.
- Backfill `openai_base_url` for the remaining OpenAI-compatible entries (most done).
- Consider a `speed_tier` field so a "fastest free APIs" collection can be generated honestly from data.

## Done recently

- ✅ Cleared the ⚠️ backlog — the three entries whose free API access couldn't be confirmed were removed (see the changelog); the list is now 100% verified.
- ✅ Backfilled `openai_compatible`, `modalities`, and `openai_base_url` (18 confirmed base URLs).
- ✅ Shipped editorial [collections](../collections/README.md) generated from the data: no-card, no-phone, commercial-use, OpenAI-compatible, permanently-free, multimodal.
- ✅ Per-provider OpenAI base URLs + a runnable quickstart (curl + OpenAI SDK) on the OpenAI-compatible page.
- ✅ Broadened adjacent coverage: embeddings/rerank (Jina, Mixedbread) and speech (Deepgram, AssemblyAI).
- ✅ **`models_free`** sampled model IDs with an automated live refresh from providers' own `/models` endpoints, a searchable [model index](../../models/), and intent-matched [SEO guides](../../guides/).

## Next

- **A stable release tag per dataset version** so downstream consumers can pin a snapshot.
- **A "fastest free LLM APIs" collection**, once a defensible speed dimension exists in the data.
- **Complete the `models_free` backfill** for the key-gated providers — see the [backlog](backlog.md) for the concrete checklist.

## Later (under consideration)

- **History / diffs:** track how a provider's free tier changed over time, not just its current state.
- **Sibling scope, kept separate:** free AI coding tools — valuable but volatile, so it would live as a clearly-separated section rather than diluting the core list. (The [self-hosting on free compute](self-hosting-on-free-compute.md) and [credit programs](credit-programs.md) companion references already follow this pattern: apply-to-get and compute offers are documented adjacent to, but outside, the verified self-serve dataset.)
- **A small, documented public API** over the dataset (a hosted JSON endpoint with query params).

## Explicitly out of scope

- Becoming a generic directory of consumer "AI tools."
- Affiliate/referral monetization that would compromise neutrality.
- Listing anything we can't cite to a provider's own docs.

Have an idea? Open a [discussion](https://github.com/pacocartones/free-llm-api-hub/discussions) or see [CONTRIBUTING.md](../CONTRIBUTING.md).

---

_[← Docs index](README.md) · [Main README](../README.md)_
