# Free LLM API Hub

![Link check](https://github.com/pacocartones/free-llm-api-hub/actions/workflows/check-freshness.yml/badge.svg)
![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)

A curated, actively-verified list of LLM API providers offering a free tier, free trial credits, or a generous no-cost quota — for developers who want to build, prototype, or run side projects without paying up front.

**What makes this list different:** every entry carries a `Last verified` date, and a [scheduled GitHub Action](.github/workflows/check-freshness.yml) checks the documentation links referenced below on a weekly basis and opens an issue automatically if something breaks. Free-tier terms change constantly and most curated lists in this space go stale within months — this one is built to surface that drift instead of hiding it. See [How we keep this updated](#how-we-keep-this-updated).

> ⚠️ **Disclaimer:** this is an independent, community-maintained list. It is not affiliated with, endorsed by, or sponsored by any of the providers below. Terms, limits, and pricing can and do change without notice — always confirm against the provider's own docs (linked in each row) before relying on a free tier for anything important. Entries marked ⚠️ have not yet been independently re-verified against the provider's official docs and are sourced from community tracking; treat their numbers as indicative, not authoritative, until confirmed.

## Quick picks by use case

Not sure where to start? Here's the fast answer for the most common asks — each links down to the full row for the exact limits and fine print.

| I want... | Go with | Why |
|---|---|---|
| The smartest model, free | **[Google Gemini API](#ongoing-free-tiers)** (2.5 Pro, limited) | The only entry here with genuinely frontier-class model access, not just open-weight models |
| The fastest inference, free | **[Groq](#ongoing-free-tiers)** or **[Cerebras](#ongoing-free-tiers)** | Both run on purpose-built inference chips — dramatically faster than typical GPU-served APIs |
| The highest daily volume, free | **[Cloudflare Workers AI](#ongoing-free-tiers)** (10,000 Neurons/day) or **[OpenRouter](#ongoing-free-tiers)** (1,000 req/day with a $10 one-time topup) | Best ceiling here for a side project with real traffic |
| No credit card and no phone number, just an API key | **[OpenRouter](#ongoing-free-tiers)** or **[Google Gemini API](#ongoing-free-tiers)** | Groq, Mistral, and NLP Cloud all gate signup behind phone verification |
| To try open-weight models (Llama, DeepSeek, Qwen, Gemma) | **[OpenRouter](#ongoing-free-tiers)** or **[Cloudflare Workers AI](#ongoing-free-tiers)** | Widest model selection among the ongoing-free-tier providers |
| A larger one-time credit to build something bigger | **[Baseten](#one-time-trial-credits)** ($30) | Largest trial credit in this list |
| Something safe to build a commercial side project on | **[Cloudflare Workers AI](#ongoing-free-tiers)** or **[Groq](#ongoing-free-tiers)** | Neither restricts the free tier to personal/evaluation use the way Cohere's trial keys or NVIDIA NIM do |

These are starting points, not guarantees — always check the full row before you build on top of any of these.

## Contents

- [Quick picks by use case](#quick-picks-by-use-case)
- [Ongoing free tiers](#ongoing-free-tiers)
- [One-time trial credits](#one-time-trial-credits)
- [Notably NOT free](#notably-not-free)
- [How we keep this updated](#how-we-keep-this-updated)
- [Contributing](#contributing)

---

## Ongoing free tiers

Providers with a recurring (daily/monthly) free quota that renews — no expiration, but usually rate-limited and sometimes gated behind a phone number or restricted from commercial/production use.

| Provider | Free tier | Rate limits | Notes | Last verified | Docs |
|---|---|---|---|---|---|
| **Google Gemini API (AI Studio)** | Gemini 2.5 Flash, 2.5 Flash-Lite, 2.5 Pro (limited), embeddings, TTS models | Varies by model, roughly 5–30 req/min and 20–500 req/day depending on model | Free-tier prompts/outputs may be used by Google to improve its products when used outside the UK/CH/EEA/EU | 2026-07-11 | [Rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) |
| **Groq** | No credit card required | e.g. `llama-3.1-8b-instant`: 30 RPM / 14.4K RPD / 6K TPM / 500K TPD · `llama-3.3-70b-versatile`: 30 RPM / 1K RPD / 12K TPM / 100K TPD · `qwen3-32b`: 60 RPM / 1K RPD / 6K TPM / 500K TPD · similar limits for GPT-OSS and Whisper models | Limits apply at the organization level, not per API key | 2026-07-11 | [Rate limits](https://console.groq.com/docs/rate-limits) |
| **OpenRouter** | 20+ models with a `:free` suffix | 20 req/min · 50 req/day if you've purchased under 10 credits lifetime, 1000 req/day once you've purchased 10+ credits (one-time, not a subscription) | ToS (Apr 2026) prohibits resale or building a competing service on the free models; running a private proxy for personal use is fine | 2026-07-11 | [Limits](https://openrouter.ai/docs/api-reference/limits) |
| **Cloudflare Workers AI** | 10,000 Neurons/day, all account plans | 30+ models: LLMs (Llama, Mistral, DeepSeek, Qwen…), embeddings, image, audio | Resets daily at 00:00 UTC; overage on a Workers Paid plan bills at $0.011/1,000 Neurons | 2026-07-11 | [Pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) |
| **GitHub Models** | Included with any GitHub account via Copilot tier | Copilot Free: ~15 RPM / 150 RPD on "low" tier models, 8K input / 4K output tokens per request. Higher Copilot tiers raise the ceiling; some models (o1-preview, DeepSeek-R1) require Copilot Pro+ | Scoped by GitHub to experimentation/prototyping, not production traffic | 2026-07-11 | [Docs](https://docs.github.com/en/github-models/prototyping-with-ai-models) |
| **Cohere** | Trial (evaluation) API keys | 1,000 API calls/month total · 20 req/min chat · 2,000 inputs/min embed · 10 req/min rerank | Explicitly for evaluation only — Cohere's terms prohibit production/commercial use on a trial key | 2026-07-11 | [Rate limits](https://docs.cohere.com/docs/rate-limits) |
| **Cerebras** | Access to all Cerebras-hosted models | Official pricing page does not publish exact numbers; the paid Developer tier is described only as "10x higher" than free | ⚠️ Rate limit figures below are community-reported (~30 RPM / 60K TPM / 1M TPD), not confirmed on Cerebras' own docs — needs direct verification | 2026-07-11 | [Pricing](https://www.cerebras.ai/pricing) |
| **Mistral (La Plateforme)** | "Restrictive" free tier, exact caps only visible after login | Not published publicly; community tracking (⚠️ unverified) reports ~1 req/sec, 500K tokens/min, 1B tokens/month | Phone verification required to activate; free tier is opt-in for data training | 2026-07-11 | [Tiers](https://docs.mistral.ai/deployment/laplateforme/tier/) |
| **HuggingFace** | Free CPU Basic + ZeroGPU for Spaces | ⚠️ Older community sources describe a small monthly Inference API credit (~$0.10/month) for models under 10GB, but this is no longer clearly documented on HuggingFace's current pricing page — flagged for re-verification | Treat serverless Inference API free access as unconfirmed until checked directly in-account | 2026-07-11 | [Pricing](https://huggingface.co/pricing) |

## One-time trial credits

Providers that hand you a fixed credit balance on signup. Once it's spent (or the clock runs out), you're on pay-as-you-go. ⚠️ **The entries in this section are sourced from community tracking and have not yet been independently re-verified against each provider's own current pricing page in this pass** — that re-verification is the first item queued for this repo's maintenance (see below). Treat amounts as indicative until confirmed.

| Provider | Credit | Models / notes |
|---|---|---|
| Fireworks AI | $1 | Various open-weight models |
| Baseten | $30 | Any supported model, compute-based pricing |
| Nebius AI Studio | $1 | Various open-weight models |
| Novita AI | $0.50/year | Various open-weight models |
| AI21 Labs | $10 / 3 months | Jamba model family |
| Upstage | $10 / 3 months | Solar Pro / Solar Mini |
| NLP Cloud | $15 | Various open-weight models; phone verification required |
| Alibaba Cloud (Model Studio) | 1M tokens per model | Qwen open & proprietary models |
| Modal | $5–30/month | Any supported model, compute-based pricing |
| Inference.net | $1 (up to $25 after completing a survey) | Various open-weight models |
| Hyperbolic | $1 | DeepSeek, Llama, Qwen variants |
| SambaNova Cloud | $5 / 3 months | DeepSeek, Llama, Gemma variants |
| Scaleway Generative APIs | 1M tokens | Gemma, Llama, Mistral, Qwen |
| NVIDIA NIM | Trial credit, phone verification required | "Evaluation only, not production" per NVIDIA's own terms; some models have reduced context windows on the free trial |
| Vercel AI Gateway | $5/month allocation | Routes to multiple supported providers rather than being a model host itself |

## Notably NOT free

Worth stating plainly so this list doesn't waste your time: as of this writing, **OpenAI, Anthropic, and xAI do not offer an ongoing free API tier.** New accounts have, at various points, received a small one-time trial credit, but this has changed repeatedly over time and should not be relied on — check each provider's own billing page before assuming anything is free. If you're looking for genuinely free access to frontier-class models, your best options in this list are Gemini (Google AI Studio) and the free-tier open-weight models on Groq, Cerebras, and OpenRouter.

## How we keep this updated

Free-tier terms in this space change fast, and most curated lists like this one go stale silently — a rate limit gets cut, a docs URL moves, and nobody notices for a year. This repo takes a different approach:

1. **Every entry carries a `Last verified` date.** No date, no entry.
2. **A weekly GitHub Action** ([`.github/workflows/check-freshness.yml`](.github/workflows/check-freshness.yml)) checks every documentation link in this README and automatically opens (or updates) a tracking issue if any of them return an error — a strong signal that the provider changed something.
3. **Entries marked ⚠️** are known to need direct re-verification and are called out honestly rather than presented with false confidence.

Planned next step: extend the automation to flag entries whose `Last verified` date is more than ~90 days old, not just broken links, so silent numeric drift (a limit that quietly changed, not just a dead link) gets caught too.

## Contributing

Found an outdated limit, a broken link, or a provider that should be on this list? Please open an issue or a pull request. When submitting a new entry or updating an existing one, please:

- Link directly to the provider's own official pricing/rate-limit docs (not a third-party summary)
- Include the date you checked it, so we can keep the `Last verified` column honest
- Note any catch — phone verification requirements, "evaluation only" clauses, data-training opt-ins, restrictions on commercial use — the fine print is often the most useful part of an entry

## License

[MIT](LICENSE) — this list is free to reuse, fork, and adapt.
