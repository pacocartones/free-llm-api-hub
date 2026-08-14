<div align="center">

<img src="assets/logo-full.svg" alt="Free LLM API Hub" width="240">

**A continuously-verified dataset of free LLM & AI-model APIs you can build on.**

Free LLM APIs plus adjacent model APIs — image, speech, embeddings, rerank and OCR. Free tiers, trial credits and no-cost quotas, every entry dated, sourced, and machine-readable.
No hype, no dead links, no "generous limits" hand-waving. Just what's actually free, and the fine print that bites.

<img src="assets/demo.svg" alt="Terminal demo: curl freellmapihub.com/api/v1/no-card.json returns Google Gemini, Groq, Cloudflare Workers AI, OpenRouter and Mistral AI" width="740">

[![Verify](https://github.com/pacocartones/free-llm-api-hub/actions/workflows/verify.yml/badge.svg)](https://github.com/pacocartones/free-llm-api-hub/actions/workflows/verify.yml)
[![Freshness](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/pacocartones/free-llm-api-hub/main/badge-freshness.json)](#how-verification-works)
[![Dataset: JSON](https://img.shields.io/badge/dataset-JSON%20%2B%20schema-blue.svg)](data/providers.json)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Contributors](https://img.shields.io/github/contributors/pacocartones/free-llm-api-hub)](https://github.com/pacocartones/free-llm-api-hub/graphs/contributors)

**[🔎 Interactive explorer](https://freellmapihub.com/)** &nbsp;·&nbsp; **[📊 Dataset](data/providers.json)** &nbsp;·&nbsp; **[🧪 How we verify](docs/methodology.md)** &nbsp;·&nbsp; **[➕ Add a provider](CONTRIBUTING.md)**


</div>

---

## Why this exists

Most "free LLM API" lists are a snapshot someone took once and never touched again. Rate limits get cut, docs URLs move, "free forever" quietly becomes "free for 30 days" — and the list keeps recommending it, confidently, for another year.

This project treats the list as a **maintained open dataset**, not a blog post:

- **Every entry is dated and sourced.** No `Last verified` date and a link to the provider's *own* docs? It doesn't ship as verified.
- **Freshness is measured, not claimed.** The badge above is computed from the data — it grades the *oldest* re-verification against the 90-day SLA, so it decays the moment maintenance stops. When it decays, you can see it.
- **Links are checked, not scheduled.** Every change runs the integrity gate, and each re-verification pass opens the provider's own docs — a dead source link is the earliest signal a provider changed something.
- **Uncertainty is labelled, not hidden.** Entries we couldn't independently confirm are marked ⚠️ and say exactly what's unconfirmed, instead of being dressed up as fact.
- **The data is the source of truth.** [`data/providers.json`](data/providers.json) is validated against a [schema](data/schema.json); this README, the badge and the site are all *generated* from it, so they can never silently drift apart.

If you're picking an API to prototype on this afternoon, you want the fine print more than the marketing. That's the whole point of this repo.

> [!WARNING]
> Independent, community-maintained list — **not affiliated with, endorsed by, or sponsored by any provider below.** Free-tier terms change without notice. Always confirm against the provider's own docs (linked in every row) before you rely on anything here. Entries marked ⚠️ are sourced from community tracking and not yet independently re-confirmed — treat them as indicative.

## What's covered

Primarily **free LLM (text) APIs** — plus the adjacent model APIs a builder reaches for next: **image generation, speech (STT/TTS), embeddings, rerank and OCR**. Every category is held to the same verification bar. Breakdown is generated from the data:

<!-- AUTOGEN:coverage:start -->
| Category | Providers | Examples |
|---|---|---|
| **Text / LLM** | 45 | Google Gemini API, Groq, OpenRouter |
| **Speech (STT / TTS)** | 26 | Google Gemini API, Groq, Cloudflare Workers AI |
| **Embeddings** | 13 | Google Gemini API, Cloudflare Workers AI, Cohere |
| **Image generation** | 10 | Cloudflare Workers AI, HuggingFace, Jina AI |
| **Vision** | 10 | Google Gemini API, OpenRouter, Z.ai |
| **OCR / documents** | 8 | OCR.space, LlamaParse, Nanonets |
| **Rerank** | 6 | Cohere, Jina AI, Mixedbread |
<!-- AUTOGEN:coverage:end -->

Filter any category live in the [interactive explorer](https://freellmapihub.com/) or the [multimodal collection](collections/multimodal.md).

## TL;DR — pick by what you actually need

Each pick links to its full verified profile on the live site.

| I want… | Start with | Why |
|---|---|---|
| **The smartest model, free** | [Google Gemini](https://freellmapihub.com/p/google-gemini) | The only genuinely frontier-class model with a real free tier here — not just open weights |
| **The fastest inference** | [Groq](https://freellmapihub.com/p/groq) or [SambaNova](https://freellmapihub.com/p/sambanova) | Purpose-built inference chips — far faster than typical GPU-served APIs |
| **The most free volume/day** | [Cloudflare Workers AI](https://freellmapihub.com/p/cloudflare-workers-ai) (10k Neurons) or [OpenRouter](https://freellmapihub.com/p/openrouter) (1k req/day) | Highest ceilings for a side project with real traffic |
| **No card *and* no phone** | [OpenRouter](https://freellmapihub.com/p/openrouter) or [Google Gemini](https://freellmapihub.com/p/google-gemini) | Groq, Mistral, SiliconFlow and NVIDIA all gate signup behind phone verification |
| **Open weights** (Llama, DeepSeek, Qwen, GLM) | [OpenRouter](https://freellmapihub.com/p/openrouter) or [Cloudflare Workers AI](https://freellmapihub.com/p/cloudflare-workers-ai) | Widest open-model selection on an ongoing free tier |
| **Permanently free, no trial clock** | [Z.ai (GLM)](https://freellmapihub.com/p/zai-glm) or [SiliconFlow](https://freellmapihub.com/p/siliconflow) | Several models priced at $0 indefinitely, not just for a trial window |
| **An OpenAI-compatible endpoint** | [Groq](https://freellmapihub.com/p/groq), [OpenRouter](https://freellmapihub.com/p/openrouter), [Cloudflare Workers AI](https://freellmapihub.com/p/cloudflare-workers-ai) | Point the OpenAI SDK at a new `base_url` and you're done |
| **EU / data-sovereignty hosting** | [OVHcloud](https://freellmapihub.com/p/ovhcloud-ai-endpoints) or [Scaleway](https://freellmapihub.com/p/scaleway) | French/EU providers; OVHcloud even has an anonymous, no-account tier |
| **Free embeddings & rerank** | [Jina AI](https://freellmapihub.com/p/jina-ai) or [Cohere](https://freellmapihub.com/p/cohere) | 10M free tokens (Jina, OpenAI-compatible) or 1,000 calls/mo (Cohere) |
| **Free speech-to-text / TTS** | [Deepgram](https://freellmapihub.com/p/deepgram) or [AssemblyAI](https://freellmapihub.com/p/assemblyai) | $200 / $50 in no-card credit for Whisper-class STT and TTS |
| **A bigger one-time credit** | [Deepgram](https://freellmapihub.com/p/deepgram) ($200, speech) or [Baseten](https://freellmapihub.com/p/baseten) ($30, LLMs) | Largest credits in the list |
| **Something safe to ship commercially** | [Cloudflare Workers AI](https://freellmapihub.com/p/cloudflare-workers-ai) or [Groq](https://freellmapihub.com/p/groq) | Don't restrict the free tier to personal/eval use, the way Cohere and NVIDIA do |

Starting points, not guarantees — read the full profile before you build on it.

## Browse by need

Focused, always-current collections — each is generated from the dataset and has a live web page too.

<!-- AUTOGEN:collections:start -->
- **[Free LLM APIs with no credit card](collections/no-credit-card.md)** (59) — start without a payment method · [live page ↗](https://freellmapihub.com/collections/no-credit-card)
- **[Free LLM APIs with no phone verification](collections/no-phone.md)** (21) — no SMS/phone verification · [live page ↗](https://freellmapihub.com/collections/no-phone)
- **[Free LLM APIs for commercial use](collections/commercial-use.md)** (25) — safe to ship, not eval-only · [live page ↗](https://freellmapihub.com/collections/commercial-use)
- **[OpenAI-compatible free LLM APIs](collections/openai-compatible.md)** (35) — drop-in OpenAI SDK swap · [live page ↗](https://freellmapihub.com/collections/openai-compatible)
- **[Permanently free LLM APIs](collections/always-free.md)** (6) — $0 models, no trial clock · [live page ↗](https://freellmapihub.com/collections/always-free)
- **[Free multimodal LLM APIs](collections/multimodal.md)** (52) — vision, audio, embeddings · [live page ↗](https://freellmapihub.com/collections/multimodal)
<!-- AUTOGEN:collections:end -->

Every provider also has its own page with the full details and a copy-ready quickstart — e.g. [Groq](https://freellmapihub.com/p/groq), [Deepgram](https://freellmapihub.com/p/deepgram), [Jina AI](https://freellmapihub.com/p/jina-ai).

## Contents

- [What's covered](#whats-covered) — the categories, by the numbers
- [Browse by need](#browse-by-need) — curated collections by constraint
- [The best free LLM APIs](#the-best-free-llm-apis) — our editorial top 20
- [Notably NOT free](#notably-not-free) — so this list doesn't waste your time
- [How verification works](#how-verification-works) — the trust engine
- [Use the data](#use-the-data) — dataset, exports, badge
- [Contributing](#contributing) · [Project docs](#project-docs)

---

## The best free LLM APIs

Our editorial top 20 — hand-picked from the [69 verified providers](data/providers.json), ranked for real-world usefulness, not an automatic filter. Every row links to its full verified profile: free tier, rate limits and the catch are checked against the provider's own docs. The full editorial write-up is on the [**/best page ↗**](https://freellmapihub.com/best/).

<sub>💳 no card · 📵 no phone · 📱 phone required · 🏢 commercial OK · 🔬 eval only · 🔌 OpenAI-compatible</sub>

<!-- AUTOGEN:best:start -->
| Provider | What's free | The catch | Verified |
|---|---|---|---|
| **[Typhoon (SCB 10X)](https://docs.opentyphoon.ai/en/faq/)**<br><sub>🏆 Editor's pick</sub><br><sub>💳 no card · 📵 no phone · 🏢 commercial OK · 🔌 OpenAI-compat</sub> | Free to use research showcase API — all Typhoon models at $0 | By SCB 10X, the venture arm of Siam Commercial Bank, focused on Thai-language models. The free catalog spans LLMs (typhoon-v2.5-30b-a3b-instruct), OCR (typhoon-ocr family) and realtime Thai ASR (typhoon-asr-realtime, typhoon-isan-asr-realtime) — the hosted API is OpenAI-compatible, including audio transcriptions. Beta, provided as-is with no formal support; usage data is collected to improve the model; SCB claims no rights in outputs. Sign up for a free API key at opentyphoon.ai. | ✅ 2026-08-14 |
| **[Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/platform/pricing/)**<br><sub>🏆 Best free quota</sub><br><sub>💳 no card · 📵 no phone · 🏢 commercial OK · 🔌 OpenAI-compat</sub> | 10,000 Neurons/day, all account plans | Resets daily at 00:00 UTC; overage on a Workers Paid plan bills at $0.011/1,000 Neurons. A few models (e.g. Kimi K2.6/K2.7-code, GLM-5.2) now require a Workers Paid plan | ✅ 2026-08-02 |
| **[Google Gemini API (AI Studio)](https://ai.google.dev/gemini-api/docs/rate-limits)**<br><sub>🏆 Frontier quality</sub><br><sub>💳 no card · 📵 no phone · 🏢 commercial OK · 🔌 OpenAI-compat</sub> | Gemini 2.5 Flash, 2.5 Flash-Lite, 2.5 Pro (limited), embeddings, TTS models | Free-tier prompts/outputs may be used by Google to improve its products outside the UK/CH/EEA/EU. Since the 2026-03-23 terms, only Paid Services may serve API clients to end users in the EEA/CH/UK | ✅ 2026-08-02 |
| **[Ollama Cloud](https://docs.ollama.com/cloud)**<br><sub>🏆 Best on-ramp</sub><br><sub>💳 no card · 📵 no phone · 🏢 commercial OK · 🔌 OpenAI-compat</sub> | $0 Free plan: access to cloud-hosted open models (Qwen, GPT-OSS, DeepSeek, etc.) via API | First-party — Ollama hosts the cloud models. Requires an ollama.com account + API key (`ollama signin`); the free plan is for light usage, Pro ($20/mo) raises limits. No card required. | ✅ 2026-08-14 |
| **[OpenRouter](https://openrouter.ai/docs/api-reference/limits)**<br><sub>🏆 Best gateway</sub><br><sub>💳 no card · 📵 no phone · 🏢 commercial OK · 🔌 OpenAI-compat</sub> | A rotating set of models with a :free suffix (~14 today; count fluctuates), single API across many providers | ToS (Jul 2026) prohibits reselling API access or building a competing service — platform-wide, not just the free models; per-model terms still apply | ✅ 2026-08-02 |
| **[AI Horde](https://aihorde.net/)**<br><sub>🏆 No account needed</sub><br><sub>💳 no card · 📵 no phone</sub> | Free crowdsourced text & image generation; anonymous API key '0000000000' (no registration), or register to earn kudos for priority | Community-powered volunteer network — model availability and speed vary with worker supply, so it is not a fixed-SLA service. No card, no phone. Kudos never expire and cannot be sold. | ✅ 2026-08-14 |
| **[LlamaParse (LlamaCloud)](https://www.llamaindex.ai/pricing)**<br><sub>🏆 Best for RAG</sub><br><sub>💳 no card · 📵 no phone · 🏢 commercial OK</sub> | Free plan: 10,000 credits/month (~10,000 pages in balanced parse mode at 1 credit/page) | Credit-based (1,000 credits = $1.25); premium parse modes consume more credits per page. No card required. Document parsing for RAG (LlamaIndex). | ✅ 2026-08-14 |
| **[OCR.space](https://ocr.space/OCRAPI)**<br><sub>🏆 Reliable utility</sub><br><sub>💳 no card · 📵 no phone · 🏢 commercial OK</sub> | 25,000 conversions/month (Engine 1 & 2) plus 2,500 Engine 3 conversions/month; max 1 MB file, PDFs up to 3 pages | Free searchable-PDF output carries a watermark (raw text extraction is unrestricted); the free key needs only an email, no card. Commercial use permitted. | ✅ 2026-08-14 |
| **[Speechify API](https://speechify.ai/pricing)**<br><sub>🏆 Best for TTS</sub><br><sub>💳 no card · 📵 no phone · 🏢 commercial OK</sub> | 50,000 characters/month TTS (hard cap) + 60 min/month voice agents | Commercial use is allowed on the free tier. No credit card required. Hard monthly cap that pauses at the limit. | ✅ 2026-08-14 |
| **[Jina AI](https://jina.ai/embeddings/)**<br><sub>🏆 Best for embeddings</sub><br><sub>💳 no card · 📵 no phone · 🏢 commercial OK · 🔌 OpenAI-compat</sub> | 10M free tokens (one-time) across all models — embeddings, rerankers, classifier; plus a keyless Reader (r.jina.ai) for basic use | The 10M-token balance is a one-time grant that does not replenish; the keyless Reader is genuinely ongoing. Hosted API is commercial-OK and data is not used for training. No card required. | ✅ 2026-08-14 |
| **[Deepgram](https://deepgram.com/pricing)**<br><sub>🏆 Best STT credit</sub><br><sub>💳 no card · 📵 no phone · 🏢 commercial OK</sub> | $200 free credit on signup (no card, no expiration) — Nova speech-to-text and Aura text-to-speech at pay-as-you-go rates | No card and no expiration on the credit. Data catch: the Model Improvement Program is opt-OUT — send mip_opt_out=true per request to keep your data out of training. Native REST/WebSocket API, not OpenAI-compatible. | ✅ 2026-08-14 |
| **[Groq](https://console.groq.com/docs/rate-limits)**<br><sub>🏆 Fastest inference</sub><br><sub>💳 no card · 📱 phone · 🏢 commercial OK · 🔌 OpenAI-compat</sub> | Open-weight models (Llama, Qwen, GPT-OSS) plus Whisper, no credit card required | Limits apply at the organization level, not per API key. Phone verification required at signup | ✅ 2026-08-02 |
| **[SambaNova Cloud](https://cloud.sambanova.ai/plans)**<br><sub>🏆 Fast, no card</sub><br><sub>💳 no card · 🏢 commercial OK · 🔌 OpenAI-compat</sub> | Rate-limited free tier (applies when no payment method is linked) across all models | Free Tier applies when no payment method is linked to the account; SambaCloud ToS grants a commercial license (no evaluation-only clause). The previously-listed "$5 / 3 months" trial could not be re-confirmed on official pages (2026-07-30). | ✅ 2026-08-13 |
| **[W&B Inference](https://docs.wandb.ai/inference/usage-limits)**<br><sub>🏆 Best monthly frontier credits</sub><br><sub>💳 no card · 🏢 commercial OK · 🔌 OpenAI-compat</sub> | $100/month of Serverless Inference credits on the Free plan (default spending cap; offer for a limited time) | Serverless Inference credits come with Free, Pro and Academic plans for a limited time; when credits run out, Free accounts must activate pay-as-you-go on the Billing tab or upgrade. OpenAI-compatible endpoint at api.inference.wandb.ai/v1 with any W&B API key. | ✅ 2026-08-14 |
| **[Voyage AI](https://docs.voyageai.com/docs/pricing)**<br><sub>🏆 Best embedding allotment</sub><br><sub>💳 no card</sub> | 200M free tokens on current embedding models (voyage-4-large, voyage-4, voyage-4-lite, voyage-context-4, voyage-code-4) and on rerankers (rerank-2.5 family); voyage-multimodal-3.5 and voyage-multimodal-3 get 200M text tokens + 150B pixels — a large one-time complimentary allotment per model | The allotment is a one-time complimentary balance per model, not a renewing monthly quota. No credit card required to claim. Owned by MongoDB — a first-party model provider, not a proxy. | ✅ 2026-08-14 |
| **[Pinecone Inference](https://www.pinecone.io/pricing/)**<br><sub>🏆 Best managed embeddings</sub><br><sub>💳 no card</sub> | Starter (free) plan: 5M tokens/mo for embedding models (llama-text-embed-v2, multilingual-e5-large) and 500 requests/mo for the bge-reranker-v2-m3 rerank model | Free rerank limited to bge-reranker-v2-m3; overages are pay-as-you-go. Not OpenAI-compatible. No card required. | ✅ 2026-08-14 |
| **[Pollinations.ai](https://github.com/pollinations/pollinations/blob/master/APIDOCS.md)**<br><sub>🏆 Free images, no signup</sub><br><sub>💳 no card · 📵 no phone</sub> | Free hosted image models (Flux, Turbo, Stable Diffusion) via a simple GET URL; also text and audio. No signup required to start | Anonymous free images may carry a watermark (since 2025); free registration removes it via the nologo parameter. No card, no phone. Commercial use is not explicitly guaranteed in the docs. | ✅ 2026-08-14 |
| **[Moondream Cloud](https://moondream.ai/pricing)**<br><sub>🏆 Best tiny vision</sub><br><sub>💳 no card · 🔌 OpenAI-compat</sub> | $5/month usage credits in every workspace (Free plan) for the Moondream vision model — caption, query (VQA), detect, point | Recurring $5/month credit, no credit card required (stated on the pricing page/blog). Commercial terms not specified. OpenAI-compatible endpoint. | ✅ 2026-08-14 |
| **[Unstructured](https://unstructured.io/pricing)**<br><sub>🏆 Best doc pipeline</sub><br><sub>💳 no card</sub> | 15,000 pages/month, resets monthly — document parsing/OCR across 50+ file types (layout, tables, generative OCR enrichment) | No credit card required. Purpose-built to turn documents into clean, structured input for RAG/LLM pipelines. Commercial terms not stated on the pricing page. | ✅ 2026-08-14 |
| **[Scaleway Generative APIs](https://www.scaleway.com/en/pricing/model-as-a-service/)**<br><sub>🏆 Best EU open models</sub><br><sub>💳 no card · 🔌 OpenAI-compat</sub> | 1,000,000 tokens free + 60 min Whisper transcription; billing starts at token 1,000,001 | European provider (France). Free allowance is a one-time token bucket, not time-limited. The 1M free tokens need no card; adding a card + passing KYC unlocks the official rate limits. | ✅ 2026-08-13 |
<!-- AUTOGEN:best:end -->

That's the shortlist. The full dataset — all 69 providers, every ongoing tier and one-time credit, filterable and machine-readable — lives in [**data/providers.json**](data/providers.json) and the [interactive explorer ↗](https://freellmapihub.com/).

## Notably NOT free

Worth saying plainly. As of the last verification pass, **OpenAI, Anthropic and xAI do not offer an ongoing free API tier.** Several providers people *assume* are free — **Together AI, DeepInfra, Perplexity's API, Replicate, Featherless AI** — currently require a card or prepayment before any API use, per their own docs. Some have handed out small one-time trial credits at various points, but that's changed repeatedly; check each provider's billing page before assuming anything.

For genuinely free access to strong models, your best bets here are **Gemini** (frontier-class) and the free open-weight models on **Groq, OpenRouter, Cloudflare, SiliconFlow and Z.ai**.

Retired or removed after re-verification: **GitHub Models** (fully retired by GitHub on 2026-07-30 — playground, catalog and inference API shut down for all customers), **Cerebras** (now listed as a trial credit: the ongoing free tier became a payment-method-gated $5/30-day trial), **Inference.net** (the free tier is gateway/observability only, not free model tokens), and **Hyperbolic** (requires a $5 minimum deposit before any use).

## How verification works

Free-tier terms move fast, and most lists go stale silently. This one is built to surface drift instead of hiding it. Full details in **[docs/methodology.md](docs/methodology.md)**; the short version:

1. **Every verified entry carries a `last_verified` date** and a link to the provider's *own* docs. No date + primary source → it ships as ⚠️ unverified, not as fact.
2. **A local re-verification pass** ([docs/update-playbook.md](docs/update-playbook.md)) re-checks each provider's own docs on a rolling basis — a dead or changed source is an early warning that a provider changed something.
3. **The freshness badge is computed from the data,** not written by hand: it is graded on the **oldest** verification in the list, straight from [`providers.json`](data/providers.json). Green while every entry is under 60 days old, amber once any entry is due for re-verification, red once any entry breaches the 90-day SLA. One forgotten row is enough to move it — which is the point.
4. **The dataset is schema-validated in CI.** A verified entry that's missing its date or source link fails the build — the honesty rule is enforced by machine, not by good intentions.
5. **Reporting a stale entry takes under a minute** via a [structured form](../../issues/new?template=inaccuracy.yml) that asks for the provider, what changed and a source link.

What "verified" covers and where its limits are: [docs/methodology.md](docs/methodology.md) · what earns a spot on the list: [docs/inclusion-criteria.md](docs/inclusion-criteria.md).

## Use the data

This is meant to be consumed by machines as much as by humans.

- **[`data/providers.json`](data/providers.json)** — canonical dataset, validated against [`data/schema.json`](data/schema.json). Every field explained in [docs/comparison-dimensions.md](docs/comparison-dimensions.md).
- **Portable exports** — [`providers.csv`](data/providers.csv) and [`providers.yaml`](data/providers.yaml), regenerated on every change. The [explorer](https://freellmapihub.com/) can also export your current filter.

```bash
# Every ongoing free tier that needs neither a card nor a phone number:
curl -s https://raw.githubusercontent.com/pacocartones/free-llm-api-hub/main/data/providers.json \
  | jq -r '.providers[]
      | select(.category=="ongoing" and .card_required==false and .phone_required==false)
      | .name'
```

**Pin a snapshot for reproducible builds.** `main` moves; depend on an immutable tag instead:

```bash
curl -s https://raw.githubusercontent.com/pacocartones/free-llm-api-hub/v2.9.0/data/providers.json
```

Tags track the dataset `version` in [`data/providers.json`](data/providers.json) (see [CHANGELOG.md](CHANGELOG.md)) — pin `vX.Y.Z` and bump deliberately. The [live JSON API](https://freellmapihub.com/api/v1/providers.json) always serves the latest `main`.

**Vouch for the data from your own README** — embed the live freshness badge:

```markdown
[![Free LLM API Hub](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/pacocartones/free-llm-api-hub/main/badge-freshness.json)](https://github.com/pacocartones/free-llm-api-hub)
```

It renders the real, auditable age of the oldest entry in the list — not a static "as of some date I forgot to update" number, and not a share that only moves after the project has been dead for a season.

**Embed a live widget** on any site — a compact, always-current list of the top verified free APIs:

```html
<div id="flh-widget" data-count="6" data-modality="text"></div>
<script src="https://freellmapihub.com/widget.js" async></script>
```

Self-contained (inline styles, no CSS conflicts). `data-modality` is optional (`text`, `audio`, `embeddings`, `image`, `vision`, `ocr`, `rerank`).

**Follow changes** — [updates page](https://freellmapihub.com/updates) or the [RSS feed](https://freellmapihub.com/feed.xml).

## Contributing

Found an outdated limit, a dead link, or a provider that belongs here? You'll keep this useful for everyone.

- **Fastest:** the [structured issue form](../../issues/new?template=inaccuracy.yml) — provider, what changed, a source link.
- **Or open a PR** editing only [`data/providers.json`](data/providers.json). Run `npm run build` to regenerate the README and badge, and `npm test` to validate. Never hand-edit the tables — they're generated.

Full guidelines, including what counts as an acceptable source: **[CONTRIBUTING.md](CONTRIBUTING.md)**.

## 🙋 Contributions wanted right now

This dataset is only as good as it is trustworthy, and right now there are `null` fields (= "nobody has confirmed it yet") waiting for a source. Three concrete ways to help, from smallest to biggest: **(1)** grab a [*good first issue*](https://github.com/pacocartones/free-llm-api-hub/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) and confirm **a single fact** about one provider — e.g. *"does Cerebras require a phone?"* — using its official site and today's date; it's a one-line diff in [`data/providers.json`](data/providers.json). **(2)** Tackle the umbrella issue [**confirm `phone_required`** (43 entries)](https://github.com/pacocartones/free-llm-api-hub/issues?q=is%3Aissue+is%3Aopen+label%3Amaintenance+phone_required) by claiming a provider from the checklist. **(3)** Do the same with [**confirm `commercial_ok`** (35 entries)](https://github.com/pacocartones/free-llm-api-hub/issues?q=is%3Aissue+is%3Aopen+label%3Amaintenance+commercial_ok), reading the provider's ToS. The rule is simple and honest: primary source (the provider's own docs) + `last_verified` with a real date, and if you're not sure, leave it `null` and say so. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Contributors

Thanks to everyone who has verified an entry, fixed a link, or improved the project:

<!-- AUTOGEN:contributors:start -->
- [Jhansi Oruganti](https://github.com/JhansiOruganti-43) — data: confirm Novita AI free tier is not commercial-use allowed ([PR #27](https://github.com/pacocartones/free-llm-api-hub/pull/27))
- [Victoria Odalo](https://github.com/OdaloV) — docs: verify Clarifai commercial_ok status ([PR #112](https://github.com/pacocartones/free-llm-api-hub/pull/112))
- [MikeGatsby](https://github.com/MikeGatsby) — data: verify Datalab hosted-API commercial-use terms (no explicit statement found) ([PR #117](https://github.com/pacocartones/free-llm-api-hub/pull/117))
- [bcabreraike-cmyk](https://github.com/bcabreraike-cmyk) — docs: explain paced re-verification batches ([PR #169](https://github.com/pacocartones/free-llm-api-hub/pull/169))
- [Swarnabha Nandi](https://github.com/Swarnabha753) — fix: show clear button when sort is changed ([PR #183](https://github.com/pacocartones/free-llm-api-hub/pull/183))
<!-- AUTOGEN:contributors:end -->

## Project docs

| Doc | What it covers |
|---|---|
| [Methodology](docs/methodology.md) | How each entry is verified; what "verified" does and doesn't mean |
| [Update playbook](docs/update-playbook.md) | The weekly routine that keeps the badge green |
| [Inclusion criteria](docs/inclusion-criteria.md) | What earns a spot — and what gets rejected |
| [Comparison dimensions](docs/comparison-dimensions.md) | Every field and flag in the dataset, defined |
| [Self-hosting on free compute](docs/self-hosting-on-free-compute.md) | Adjacent: free GPU/compute when no hosted API fits |
| [Credit programs (apply to get)](docs/credit-programs.md) | Adjacent: startup & student/research credit programs |
| [Roadmap](docs/roadmap.md) | Where this is going next |
| [Changelog](CHANGELOG.md) | What changed, when |
| [Governance](GOVERNANCE.md) | How decisions get made |
| [Security](SECURITY.md) · [Code of Conduct](CODE_OF_CONDUCT.md) | Reporting & community norms |

## License

[MIT](LICENSE) — free to reuse, fork, and adapt, including the dataset. A link back is appreciated but not required.
