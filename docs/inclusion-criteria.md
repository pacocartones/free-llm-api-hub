# Inclusion criteria

What earns a spot in the dataset — and what gets rejected. The scope is deliberately narrow: **this is a reference for developers choosing a free LLM API to build on**, not a directory of every AI product with a free plan.

## A provider qualifies if it meets all of these

1. **It exposes a programmatic API.** A REST/HTTP or SDK endpoint you can call from code. A chat website or IDE plugin with no API does not qualify.
2. **It serves LLMs or directly adjacent model APIs** — text generation (the core), plus vision, embeddings, rerank, speech-to-text, TTS, image generation and OCR / document AI *when offered as a developer API that runs a model.* (Content/data APIs that don't run a model — stock photos, weather, dictionaries — are out of scope.)
3. **There is genuine no-cost access:** an ongoing free tier (a quota that renews), a permanently-free model, or a trial credit you can activate to make real API calls.
4. **The offer is documented by the provider.** We can point to the provider's own pricing or rate-limit page. Dashboard-only figures with no public doc are flagged ⚠️, not presented as fact.

## Categories

- **Ongoing free tier** — a recurring quota that renews (daily/monthly), a permanently-free model, or a recurring credit. Lives in the "Ongoing free tiers" table.
- **One-time trial credit** — a fixed balance granted on signup; once spent (or expired), you're on pay-as-you-go. Lives in the "Trial credits" table.

`free_type` records the finer shape: `perpetual`, `renewing-quota`, `recurring-credit`, `trial-credit`. See [comparison-dimensions.md](comparison-dimensions.md).

## What gets rejected

- **Consumer chat UIs** (a free web chatbot) with no developer API.
- **"Free" that requires a card charge to use** — a card *on file* is fine and noted; a tier you can't call without being billed is not free.
- **Resellers and unofficial proxies** re-exposing another provider's models without authorization.
- **Vaporware / waitlists** — the free access must be reachable today, not "coming soon."
- **Pure infra with no model access** — general cloud credits (unless they specifically fund model inference, e.g. self-hosting on free GPU credit, which is noted as such).
- **Offers with no citable source** — if the only "evidence" is a Reddit thread or another list, it's a research lead, not an entry.

## Borderline cases, handled explicitly

- **Eval-only / non-commercial tiers** (e.g. Cohere trial keys, NVIDIA NIM) are **included** but flagged `commercial_ok: false` — they're useful for prototyping, and the restriction is exactly the kind of fine print builders need.
- **Phone- or card-gated tiers** are **included** with `phone_required` / `card_required` set true, so they can be filtered out by anyone who needs to avoid them.
- **Region-locked offers** are included with the restriction stated in `notes`.
- **Startup / promo credit programs** are treated with caution: they change often and mix stable offers with campaigns. They're only added when independently confirmed, and marked ⚠️ otherwise.

## Removal

An entry is removed (not silently left to rot) when the provider ends the free access entirely. Notable removals are recorded in [CHANGELOG.md](../CHANGELOG.md) so the history stays honest. Providers that people *assume* are free but aren't live in the README's "Notably NOT free" section, on purpose — saying what isn't free saves builders time too.

---

_[← Docs index](README.md) · [Main README](../README.md)_
