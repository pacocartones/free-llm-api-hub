# Roadmap

Direction, not dated promises. The north star: stay the **most trustworthy, current and builder-useful reference for free LLM APIs** — without drifting into a generic "AI tools" directory.

## Principles that won't change

- **Builder-first.** Every field earns its place by helping someone choose an API to build on.
- **Trust over coverage.** A smaller, verified, honestly-flagged list beats an exhaustive stale one.
- **Data is the product.** Docs and site stay generated from `data/providers.json`.
- **Narrow scope.** Free *developer* model APIs and directly adjacent ones — not consumer chatbots, not every SaaS with a free plan.

## Now

- Keep the 90-day freshness bar green; re-verify entries as their dates age.
- Clear the ⚠️ backlog — confirm or correct the currently-unverified entries.
- Backfill `openai_compatible` and `modalities` across all entries.

## Next

- **Editorial cuts** as their own linkable pages, generated from the data — each expands practical utility and search surface:
  - Free LLM APIs with no credit card
  - Free LLM APIs with no phone verification
  - Free LLM APIs for commercial use
  - Fastest free LLM APIs
  - OpenAI-compatible free LLM APIs
  - Free multimodal APIs (vision, speech, embeddings)
- **Per-provider quickstart snippets** (curl + OpenAI SDK `base_url`) for OpenAI-compatible entries.
- **A stable release tag per dataset version** so downstream consumers can pin a snapshot.

## Later (under consideration)

- **History / diffs:** track how a provider's free tier changed over time, not just its current state.
- **Sibling scope, kept separate:** free AI coding tools, and startup credit programs — valuable but volatile, so they'd live as clearly-separated sections or a sibling repo rather than diluting the core list. (The [self-hosting on free compute](self-hosting-on-free-compute.md) companion reference is a first example of this pattern.)
- **A small, documented public API** over the dataset (a hosted JSON endpoint with query params).

## Explicitly out of scope

- Becoming a generic directory of consumer "AI tools."
- Affiliate/referral monetization that would compromise neutrality.
- Listing anything we can't cite to a provider's own docs.

Have an idea? Open a [discussion](https://github.com/pacocartones/free-llm-api-hub/discussions) or see [CONTRIBUTING.md](../CONTRIBUTING.md).
