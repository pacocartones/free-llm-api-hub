<div align="center">

# Free LLM API Hub

**A continuously-verified dataset of free LLM & AI-model APIs you can build on.**

Free LLM APIs plus adjacent model APIs — image, speech, embeddings, rerank and OCR. Free tiers, trial credits and no-cost quotas, every entry dated, sourced, and machine-readable.
No hype, no dead links, no "generous limits" hand-waving. Just what's actually free, and the fine print that bites.

[![Verify](https://github.com/pacocartones/free-llm-api-hub/actions/workflows/verify.yml/badge.svg)](https://github.com/pacocartones/free-llm-api-hub/actions/workflows/verify.yml)
[![Freshness](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/pacocartones/free-llm-api-hub/main/badge-freshness.json)](#how-verification-works)
[![Dataset: JSON](https://img.shields.io/badge/dataset-JSON%20%2B%20schema-blue.svg)](data/providers.json)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

**[🔎 Interactive explorer](https://pacocartones.github.io/free-llm-api-hub/)** &nbsp;·&nbsp; **[📊 Dataset](data/providers.json)** &nbsp;·&nbsp; **[🧪 How we verify](docs/methodology.md)** &nbsp;·&nbsp; **[➕ Add a provider](CONTRIBUTING.md)**

<!-- AUTOGEN:stats:start -->
**51 providers** tracked · 29 ongoing free tiers · 22 trial credits · **51/51** independently verified against the provider's own docs
<!-- AUTOGEN:stats:end -->

</div>

---

## Why this exists

Most "free LLM API" lists are a snapshot someone took once and never touched again. Rate limits get cut, docs URLs move, "free forever" quietly becomes "free for 30 days" — and the list keeps recommending it, confidently, for another year.

This project treats the list as a **maintained open dataset**, not a blog post:

- **Every entry is dated and sourced.** No `Last verified` date and a link to the provider's *own* docs? It doesn't ship as verified.
- **Freshness is measured, not claimed.** The badge above is computed from the data — it counts how many entries were re-confirmed in the last 90 days. When it decays, you can see it.
- **Links are checked automatically.** A scheduled job re-checks every source link and opens an issue the moment one breaks — the earliest signal a provider changed something.
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
| **Text / LLM** | 40 | Google Gemini API, Groq, OpenRouter |
| **Speech (STT / TTS)** | 17 | Google Gemini API, Groq, Cloudflare Workers AI |
| **Embeddings** | 11 | Google Gemini API, Cloudflare Workers AI, Cohere |
| **Vision** | 9 | Google Gemini API, OpenRouter, Z.ai |
| **Image generation** | 8 | Cloudflare Workers AI, HuggingFace, Jina AI |
| **Rerank** | 4 | Cohere, Jina AI, Mixedbread |
| **OCR / documents** | 3 | OCR.space, LlamaParse, Nanonets |
<!-- AUTOGEN:coverage:end -->

Filter any category live in the [interactive explorer](https://pacocartones.github.io/free-llm-api-hub/) or the [multimodal collection](collections/multimodal.md).

## TL;DR — pick by what you actually need

Each pick links to the full row, where the real limits and catches live.

| I want… | Start with | Why |
|---|---|---|
| **The smartest model, free** | [Google Gemini](#ongoing-free-tiers) | The only genuinely frontier-class model with a real free tier here — not just open weights |
| **The fastest inference** | [Groq](#ongoing-free-tiers) or [Cerebras](#ongoing-free-tiers) | Purpose-built inference chips — far faster than typical GPU-served APIs |
| **The most free volume/day** | [Cloudflare Workers AI](#ongoing-free-tiers) (10k Neurons) or [OpenRouter](#ongoing-free-tiers) (1k req/day) | Highest ceilings for a side project with real traffic |
| **No card *and* no phone** | [OpenRouter](#ongoing-free-tiers) or [Google Gemini](#ongoing-free-tiers) | Groq, Mistral, SiliconFlow and NVIDIA all gate signup behind phone verification |
| **Open weights** (Llama, DeepSeek, Qwen, GLM) | [OpenRouter](#ongoing-free-tiers) or [Cloudflare Workers AI](#ongoing-free-tiers) | Widest open-model selection on an ongoing free tier |
| **Permanently free, no trial clock** | [Z.ai (GLM)](#ongoing-free-tiers) or [SiliconFlow](#ongoing-free-tiers) | Several models priced at $0 indefinitely, not just for a trial window |
| **An OpenAI-compatible endpoint** | [Groq](#ongoing-free-tiers), [Cerebras](#ongoing-free-tiers), [OpenRouter](#ongoing-free-tiers) | Point the OpenAI SDK at a new `base_url` and you're done |
| **EU / data-sovereignty hosting** | [OVHcloud](#ongoing-free-tiers) or [Scaleway](#one-time-trial-credits) | French/EU providers; OVHcloud even has an anonymous, no-account tier |
| **Free embeddings & rerank** | [Jina AI](#one-time-trial-credits) or [Cohere](#ongoing-free-tiers) | 10M free tokens (Jina, OpenAI-compatible) or 1,000 calls/mo (Cohere) |
| **Free speech-to-text / TTS** | [Deepgram](#one-time-trial-credits) or [AssemblyAI](#one-time-trial-credits) | $200 / $50 in no-card credit for Whisper-class STT and TTS |
| **A bigger one-time credit** | [Deepgram](#one-time-trial-credits) ($200, speech) or [Baseten](#one-time-trial-credits) ($30, LLMs) | Largest credits in the list |
| **Something safe to ship commercially** | [Cloudflare Workers AI](#ongoing-free-tiers) or [Groq](#ongoing-free-tiers) | Don't restrict the free tier to personal/eval use, the way Cohere and NVIDIA do |

Starting points, not guarantees — read the full row before you build on it.

## Browse by need

Focused, always-current collections — each is generated from the dataset and has a live web page too.

<!-- AUTOGEN:collections:start -->
- **[Free LLM APIs with no credit card](collections/no-credit-card.md)** (31) — start without a payment method · [live page ↗](https://pacocartones.github.io/free-llm-api-hub/collections/no-credit-card.html)
- **[Free LLM APIs with no phone verification](collections/no-phone.md)** (21) — no SMS/phone verification · [live page ↗](https://pacocartones.github.io/free-llm-api-hub/collections/no-phone.html)
- **[Free LLM APIs for commercial use](collections/commercial-use.md)** (20) — safe to ship, not eval-only · [live page ↗](https://pacocartones.github.io/free-llm-api-hub/collections/commercial-use.html)
- **[OpenAI-compatible free LLM APIs](collections/openai-compatible.md)** (30) — drop-in OpenAI SDK swap · [live page ↗](https://pacocartones.github.io/free-llm-api-hub/collections/openai-compatible.html)
- **[Permanently free LLM APIs](collections/always-free.md)** (5) — $0 models, no trial clock · [live page ↗](https://pacocartones.github.io/free-llm-api-hub/collections/always-free.html)
- **[Free multimodal LLM APIs](collections/multimodal.md)** (34) — vision, audio, embeddings · [live page ↗](https://pacocartones.github.io/free-llm-api-hub/collections/multimodal.html)
<!-- AUTOGEN:collections:end -->

Every provider also has its own page with the full details and a copy-ready quickstart — e.g. [Groq](https://pacocartones.github.io/free-llm-api-hub/p/groq.html), [Deepgram](https://pacocartones.github.io/free-llm-api-hub/p/deepgram.html), [Jina AI](https://pacocartones.github.io/free-llm-api-hub/p/jina-ai.html).

## Contents

- [What's covered](#whats-covered) — the categories, by the numbers
- [Browse by need](#browse-by-need) — curated collections by constraint
- [Ongoing free tiers](#ongoing-free-tiers) — recurring quotas that renew
- [One-time trial credits](#one-time-trial-credits) — a fixed balance, then pay-as-you-go
- [Notably NOT free](#notably-not-free) — so this list doesn't waste your time
- [How verification works](#how-verification-works) — the trust engine
- [Use the data](#use-the-data) — dataset, exports, badge
- [Contributing](#contributing) · [Project docs](#project-docs)

---

## Ongoing free tiers

Recurring (daily/monthly) quotas that renew — no expiry, but usually rate-limited and sometimes gated behind a phone number or restricted from commercial use.

<sub>💳 no card · 📵 no phone · 📱 phone required · 🏢 commercial OK · 🔬 eval only · 🔌 OpenAI-compatible</sub>

<!-- AUTOGEN:ongoing:start -->
| Provider | What's free | Rate limits | The catch | Verified |
|---|---|---|---|---|
| **[Google Gemini API (AI Studio)](https://ai.google.dev/gemini-api/docs/rate-limits)**<br><sub>💳 no card · 📵 no phone · 🏢 commercial OK · 🔌 OpenAI-compat</sub> | Gemini 2.5 Flash, 2.5 Flash-Lite, 2.5 Pro (limited), embeddings, TTS models | Varies by model, roughly 5-30 req/min and 20-500 req/day depending on model | Free-tier prompts/outputs may be used by Google to improve its products when used outside the UK/CH/EEA/EU | ✅ 2026-07-11 |
| **[Groq](https://console.groq.com/docs/rate-limits)**<br><sub>💳 no card · 📱 phone · 🏢 commercial OK · 🔌 OpenAI-compat</sub> | Open-weight models (Llama, Qwen, GPT-OSS) plus Whisper, no credit card required | e.g. llama-3.1-8b-instant: 30 RPM/14.4K RPD/6K TPM/500K TPD; llama-3.3-70b-versatile: 30 RPM/1K RPD/12K TPM/100K TPD; qwen3-32b: 60 RPM/1K RPD/6K TPM/500K TPD; similar for GPT-OSS and Whisper models | Limits apply at the organization level, not per API key. Phone verification required at signup | ✅ 2026-07-11 |
| **[OpenRouter](https://openrouter.ai/docs/api-reference/limits)**<br><sub>💳 no card · 📵 no phone · 🏢 commercial OK · 🔌 OpenAI-compat</sub> | 20+ models with a :free suffix, single API across many providers | 20 req/min; 50 req/day under 10 credits purchased lifetime, 1000 req/day once 10+ credits purchased (one-time, not a subscription) | ToS (Apr 2026) prohibits resale or building a competing service on the free models; a private proxy for personal use is fine | ✅ 2026-07-11 |
| **[Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/platform/pricing/)**<br><sub>💳 no card · 📵 no phone · 🏢 commercial OK · 🔌 OpenAI-compat</sub> | 10,000 Neurons/day, all account plans | 30+ models: LLMs (Llama, Mistral, DeepSeek, Qwen...), embeddings, image, audio | Resets daily at 00:00 UTC; overage on a Workers Paid plan bills at $0.011/1,000 Neurons | ✅ 2026-07-11 |
| **[GitHub Models](https://docs.github.com/en/github-models/prototyping-with-ai-models)**<br><sub>💳 no card · 📵 no phone · 🔬 eval only · 🔌 OpenAI-compat</sub> | Included with any GitHub account via the Copilot tier | Copilot Free: ~15 RPM / 150 RPD on "low" tier models, 8K input / 4K output tokens per request. Higher Copilot tiers raise the ceiling | Scoped by GitHub to experimentation/prototyping, not production traffic | ✅ 2026-07-11 |
| **[Cohere](https://docs.cohere.com/docs/rate-limits)**<br><sub>💳 no card · 📵 no phone · 🔬 eval only · 🔌 OpenAI-compat</sub> | Trial (evaluation) API keys covering chat, embed and rerank | 1,000 API calls/month total; 20 req/min chat; 2,000 inputs/min embed; 10 req/min rerank | Explicitly for evaluation only — Cohere's terms prohibit production/commercial use on a trial key | ✅ 2026-07-30 |
| **[Cerebras](https://inference-docs.cerebras.ai/support/rate-limits)**<br><sub>🔌 OpenAI-compat</sub> | Access to all Cerebras-hosted models | Officially published per-model: 5 RPM / 30,000 TPM / 1,000,000 TPH / 1,000,000 TPD (e.g. gpt-oss-120b, zai-glm-4.7, gemma-4-31b); limits vary by model | Free tier includes community support (Discord) only; paid Developer tier gives "10x higher" rate limits | ✅ 2026-07-11 |
| **[Mistral (La Plateforme)](https://docs.mistral.ai/admin/billing-usage/usage-limits)**<br><sub>📱 phone · 🔬 eval only</sub> | "Restrictive" free tier explicitly for "try and explore" — official docs say to upgrade for "actual projects and production use" | Not published publicly; exact caps only visible in-console after login (admin.mistral.ai) | Phone verification required to activate; free tier is opt-in for data training | ✅ 2026-07-12 |
| **[HuggingFace](https://huggingface.co/docs/inference-providers/en/pricing)**<br><sub>💳 no card · 🔌 OpenAI-compat</sub> | Free CPU Basic + ZeroGPU for Spaces; Inference Providers has a monthly credit ($0.10/mo on Free plan, $2.00/mo on PRO/Team/Enterprise) | No RPM/TPM published, only credit amounts | Credits only apply with "Routed by Hugging Face" billing, not with a Custom Provider Key | ✅ 2026-07-30 |
| **[SiliconFlow](https://docs.siliconflow.cn/en/userguide/rate-limits/rate-limit-and-upgradation)**<br><sub>📱 phone · 🔌 OpenAI-compat</sub> | Several models permanently free (e.g. Qwen2.5-7B-Instruct and others) at $0 cost, plus a $1 welcome credit for paid models | Fixed per-model limits for free models; generic docs cite ranges of 1,000-10,000 RPM and 50,000-5,000,000 TPM depending on model tier — exact limits shown in-account | Signup requires SMS phone verification. Full "real-name authentication" (needed for recharging/billing) requires a mainland China, Hong Kong/Macao, or Taiwan ID document — this may limit full access for users without one, though basic use of free models appears reachable with standard account verification | ✅ 2026-07-30 |
| **[Z.ai (Zhipu AI / GLM)](https://docs.z.ai/guides/overview/pricing)**<br><sub>📵 no phone · 🏢 commercial OK · 🔌 OpenAI-compat</sub> | GLM-4.5-Flash, GLM-4.7-Flash (text), and GLM-4.6V-Flash (vision) are officially listed as $0 cost (input, cached input, and output) on a permanent basis | Not specified with concrete RPM/TPM figures in public docs | Terms of Use prohibit using the service to "develop, train, or improve" competing algorithms or models — otherwise general use, including commercial, isn't restricted | ✅ 2026-07-30 |
| **[IBM watsonx.ai (Lite plan)](https://www.ibm.com/docs/en/watsonx/saas?topic=cloud-watsonxai-runtime-plans)**<br><sub>🔌 OpenAI-compat</sub> | Lite plan: 300,000 tokens/month for foundation model inference, 20 CUH/month for ML tooling, 100 pages/month of document text extraction | 2 inference requests per second (explicitly documented for the Lite plan) | Lite plan doesn't support fine-tuning of foundation or custom models; 1-day idle deployment timeout. Never expires or bills while inside quota, but a payment method (with a nominal ~$1 authorization hold) is required at signup | ✅ 2026-07-11 |
| **[OVHcloud AI Endpoints](https://www.ovhcloud.com/en/public-cloud/ai-endpoints/catalog/)**<br><sub>🔌 OpenAI-compat</sub> | Several open-weight models in the catalog (e.g. Qwen3Guard) listed as $0 per token, permanently, via two access modes: anonymous (no account) and authenticated (API key tied to a Public Cloud project) | Anonymous access: 2 requests/min per IP per model. Authenticated (API key): 400 requests/min per project per model. Exceeding either returns HTTP 429 | European provider (France), relevant for EU data-sovereignty/GDPR-conscious use. The authenticated tier needs a valid payment method on the project (though "Free" models themselves don't charge); anonymous access needs neither an account nor a card. A separate general $200 Public Cloud trial voucher also exists but is unrelated to this permanent free-model tier | ✅ 2026-07-11 |
| **[SambaNova Cloud](https://cloud.sambanova.ai/plans)**<br><sub>💳 no card · 🏢 commercial OK · 🔌 OpenAI-compat</sub> | Rate-limited free tier (applies when no payment method is linked) across all models | Free Tier: 20 RPM / 20 RPD / 200,000 TPD across all models; Developer Tier (card required): 60-240 RPM depending on model | Free Tier applies when no payment method is linked to the account; SambaCloud ToS grants a commercial license (no evaluation-only clause). The previously-listed "$5 / 3 months" trial could not be re-confirmed on official pages (2026-07-30). | ✅ 2026-07-30 |
| **[Arli AI](https://www.arliai.com/pricing)**<br><sub>🔌 OpenAI-compat</sub> | Free plan ($0): access to all text LLMs (Gemma, Qwen, etc.), capped at ~5 requests per 2-day window, 12K context, 1 request at a time | 1 request at a time; ~5 requests per 2 days across all models; max 12K context; delayed responses | Free tier is for testing only — very restrictive. Provider advertises zero-log / no data retention. Card requirement for the free tier is not stated on the pricing page. | ✅ 2026-07-30 |
| **[Ollama Cloud](https://docs.ollama.com/cloud)**<br><sub>💳 no card · 📵 no phone · 🏢 commercial OK · 🔌 OpenAI-compat</sub> | $0 Free plan: access to cloud-hosted open models (Qwen, GPT-OSS, DeepSeek, etc.) via API | Session limits reset every 5 hours and weekly limits every 7 days; 1 concurrent cloud model on the free plan (exact token caps not published) | First-party — Ollama hosts the cloud models. Requires an ollama.com account + API key (`ollama signin`); the free plan is for light usage, Pro ($20/mo) raises limits. No card required. | ✅ 2026-07-30 |
| **[AI Horde](https://aihorde.net/)**<br><sub>💳 no card · 📵 no phone</sub> | Free crowdsourced text & image generation; anonymous API key '0000000000' (no registration), or register to earn kudos for priority | Queue-based priority via kudos (no fixed quota); anonymous requests get lowest priority under load | Community-powered volunteer network — model availability and speed vary with worker supply, so it is not a fixed-SLA service. No card, no phone. Kudos never expire and cannot be sold. | ✅ 2026-07-30 |
| **[ModelScope (API-Inference)](https://www.modelscope.cn/docs/model-service/API-Inference/intro)**<br><sub>💳 no card · 🔬 eval only · 🔌 OpenAI-compat</sub> | ~2,000 free API calls/day across open-weight models (Qwen3, DeepSeek, GLM, Llama, etc.) via API-Inference | ~2,000 calls/day; concurrency/QPS caps applied and dynamically adjusted | Alibaba's model hub — a different product from Alibaba Model Studio. Requires a ModelScope account bound to an Alibaba Cloud account with real-name (ID) verification — a practical barrier for non-China users. Explicitly non-commercial ("for developers to experience"). No card. | ✅ 2026-07-30 |
| **[Pollinations.ai](https://github.com/pollinations/pollinations/blob/master/APIDOCS.md)**<br><sub>💳 no card · 📵 no phone</sub> | Free hosted image models (Flux, Turbo, Stable Diffusion) via a simple GET URL; also text and audio. No signup required to start | Anonymous ~1 request / 15s; free registration (Seed tier) ~1 request / 5s | Anonymous free images may carry a watermark (since 2025); free registration removes it via the nologo parameter. No card, no phone. Commercial use is not explicitly guaranteed in the docs. | ✅ 2026-07-30 |
| **[Pinecone Inference](https://www.pinecone.io/pricing/)**<br><sub>💳 no card</sub> | Starter (free) plan: 5M tokens/mo for embedding models (llama-text-embed-v2, multilingual-e5-large) and 500 requests/mo for the bge-reranker-v2-m3 rerank model | 5M embedding tokens/mo; 500 rerank requests/mo on Starter | Free rerank limited to bge-reranker-v2-m3; overages are pay-as-you-go. Not OpenAI-compatible. No card required. | ✅ 2026-07-30 |
| **[Twelve Labs (Marengo Embed)](https://www.twelvelabs.io/pricing)**<br><sub>💳 no card</sub> | Free plan: the Marengo Embed API for all input types (video, audio, image, text) at no cost, plus ~600 min indexing | Embed video/audio: 3,000 RPD, 25 RPM; embed text/image: 3,000 RPD, 600 RPM | No credit card for the Free plan, but indexed data expires after 90 days unless upgraded. Marengo produces multimodal embeddings. Not OpenAI-compatible. | ✅ 2026-07-30 |
| **[OCR.space](https://ocr.space/OCRAPI)**<br><sub>💳 no card · 📵 no phone · 🏢 commercial OK</sub> | 25,000 conversions/month (Engine 1 & 2) plus 2,500 Engine 3 conversions/month; max 1 MB file, PDFs up to 3 pages | 500 requests per day per IP address | Free searchable-PDF output carries a watermark (raw text extraction is unrestricted); the free key needs only an email, no card. Commercial use permitted. | ✅ 2026-07-30 |
| **[LlamaParse (LlamaCloud)](https://www.llamaindex.ai/pricing)**<br><sub>💳 no card · 📵 no phone · 🏢 commercial OK</sub> | Free plan: 10,000 credits/month (~10,000 pages in balanced parse mode at 1 credit/page) | 5 concurrent jobs; 1 project; 5 indexes on the free plan | Credit-based (1,000 credits = $1.25); premium parse modes consume more credits per page. No card required. Document parsing for RAG (LlamaIndex). | ✅ 2026-07-30 |
| **[Moondream Cloud](https://moondream.ai/pricing)**<br><sub>🔌 OpenAI-compat</sub> | $5/month usage credits in every workspace (Free plan) for the Moondream vision model — caption, query (VQA), detect, point | Bounded by the $5/month credit | Recurring $5/month credit; card requirement not stated on the pricing page; commercial terms not specified. OpenAI-compatible endpoint. | ✅ 2026-07-30 |
| **[Speechmatics](https://www.speechmatics.com/pricing)**<br><sub>💳 no card</sub> | 3,000 minutes (50 hours)/month speech-to-text + 1,000,000 characters (~20 hrs)/month text-to-speech | 2 concurrent real-time sessions on the free plan | No credit card required to start; add a card only when you exceed the free limit. Recurring monthly allowance covering both STT and TTS. Commercial-use permission not explicitly stated on the pricing page. | ✅ 2026-07-30 |
| **[Speechify API](https://speechify.ai/pricing)**<br><sub>💳 no card · 📵 no phone · 🏢 commercial OK</sub> | 50,000 characters/month TTS (hard cap) + 60 min/month voice agents | 3 concurrent calls; hard cap pauses at the limit (no overages) | Commercial use is allowed on the free tier. No credit card required. Hard monthly cap that pauses at the limit. | ✅ 2026-07-30 |
| **[Hume AI (Octave TTS)](https://www.hume.ai/pricing)**<br><sub>💳 no card · 🏢 commercial OK</sub> | 10,000 characters/month TTS (~10 minutes) on the Free plan | 15 requests per minute | The free plan includes a commercial license; overage billed at $0.15/1,000 chars. No card stated as required to start. Not OpenAI-compatible. | ✅ 2026-07-30 |
| **[Unreal Speech](https://unrealspeech.com/pricing)**<br><sub>🏢 commercial OK</sub> | 250,000 characters/month TTS (~6 hours of audio) | Tiered endpoints for different text lengths; specific caps not documented | Commercial use allowed, but free-plan users must attribute Unreal Speech with a link when publishing audio. First-party REST endpoints. Card requirement not stated. | ✅ 2026-07-30 |
| **[ElevenLabs](https://elevenlabs.io/pricing)**<br><sub>💳 no card · 📵 no phone · 🔬 eval only</sub> | 10,000 credits/month shared across Text-to-Speech, Speech-to-Text and more (~10 min TTS/month) | Concurrency tied to the Free plan (not numerically published) | The free tier is NON-COMMERCIAL only per the Terms of Use (a commercial license begins on paid Starter, $6/mo), and historically required attribution. API access is available on the free plan. No credit card to sign up. | ✅ 2026-07-30 |
<!-- AUTOGEN:ongoing:end -->

## One-time trial credits

A fixed credit balance on signup. Once it's spent (or the clock runs out), you're on pay-as-you-go. Entries marked ⚠️ couldn't be confirmed against accessible official sources and are flagged for follow-up rather than presented with false confidence.

<!-- AUTOGEN:trial:start -->
| Provider | Credit | Models / notes | Expires | Verified |
|---|---|---|---|---|
| **[Fireworks AI](https://docs.fireworks.ai/faq-new/billing-pricing/)**<br><sub>💳 no card · 🔌 OpenAI-compat</sub> | $1 trial credit | Default monthly spend cap of $50 for new accounts; no card needed to activate the $1 credit, card needed once it's spent | — | ✅ 2026-07-11 |
| **[Baseten](https://www.baseten.co/pricing/)**<br><sub>🔌 OpenAI-compat</sub> | $30 trial credit | No documented expiration date publicly | — | ✅ 2026-07-11 |
| **[Nebius AI Studio](https://docs.tokenfactory.nebius.com)**<br><sub>📵 no phone · 🏢 commercial OK · 🔌 OpenAI-compat</sub> | $1 trial credit, valid for 30 days | Product renamed to "Nebius Token Factory"; a bank card is required to set up billing | 30 days | ✅ 2026-07-30 |
| **[Novita AI](https://novita.ai/pricing)**<br><sub>🔌 OpenAI-compat</sub> | $1 free credit on signup | Corrected from a previously listed "$0.50/year" figure, which does not appear on any official Novita domain; a separate referral program ("Give $10, Earn $10") also exists | — | ✅ 2026-07-11 |
| **[AI21 Labs](https://docs.ai21.com/docs/usage-cost)**<br><sub>💳 no card</sub> | $10 trial credit, valid 3 months | Card not required for the trial credit itself, required once it expires | 3 months | ✅ 2026-07-11 |
| **[NLP Cloud](https://nlpcloud.com/pricing.html)**<br><sub>📵 no phone · 🏢 commercial OK</sub> | $15 trial credit | Corrected: the official registration page does not ask for a phone number, contradicting the earlier listing | — | ✅ 2026-07-30 |
| **[Alibaba Cloud (Model Studio)](https://www.alibabacloud.com/help/en/model-studio/new-free-quota)**<br><sub>💳 no card · 🔌 OpenAI-compat</sub> | 1,000,000 tokens (example figure, varies by model), international/Singapore region only | Excludes batch processing, context caching, fine-tuning, and dedicated deployment | 30-90 days | ✅ 2026-07-30 |
| **[Modal](https://modal.com/pricing)** | $30/month recurring credit (Starter plan) | Corrected from a previously listed "$5-30/month" range; this is a recurring monthly credit, not a one-time trial. Modal is serverless compute you deploy models on, not a hosted model API | — | ✅ 2026-07-30 |
| **[Scaleway Generative APIs](https://www.scaleway.com/en/pricing/model-as-a-service/)**<br><sub>🔌 OpenAI-compat</sub> | 1,000,000 tokens free + 60 min Whisper transcription; billing starts at token 1,000,001 | European provider (France). Free allowance is a one-time token bucket, not time-limited | — | ✅ 2026-07-30 |
| **[NVIDIA NIM](https://build.nvidia.com/)**<br><sub>📱 phone · 🔬 eval only · 🔌 OpenAI-compat</sub> | Trial credit, phone verification required | "Evaluation only, not production" per NVIDIA's own Trial Terms of Service — NVIDIA may discontinue the trial at any time with no continuity obligation | — | ✅ 2026-07-11 |
| **[Vercel AI Gateway](https://vercel.com/docs/ai-gateway/pricing)**<br><sub>💳 no card · 🔌 OpenAI-compat</sub> | Free tier with a monthly free credit covering a subset of models at lower rate limits | Free tier and its monthly-credit behaviour are confirmed in Vercel's own docs; the specific "$5/month" figure circulating in community posts is not stated there. Once you purchase credits, your account moves to the paid tier and the monthly free credit no longer applies. | — | ✅ 2026-07-30 |
| **[Jina AI](https://jina.ai/embeddings/)**<br><sub>💳 no card · 📵 no phone · 🏢 commercial OK · 🔌 OpenAI-compat</sub> | 10M free tokens (one-time) across all models — embeddings (v3/v4), rerankers, classifier; plus a keyless Reader (r.jina.ai) for basic use | The 10M-token balance is a one-time grant that does not replenish; the keyless Reader is genuinely ongoing. Hosted API is commercial-OK and data is not used for training. No card required. | — | ✅ 2026-07-30 |
| **[Deepgram](https://deepgram.com/pricing)**<br><sub>💳 no card · 📵 no phone · 🏢 commercial OK</sub> | $200 free credit on signup (no card, no expiration) — Nova speech-to-text and Aura text-to-speech at pay-as-you-go rates | No card and no expiration on the credit. Data catch: the Model Improvement Program is opt-OUT — send mip_opt_out=true per request to keep your data out of training. Native REST/WebSocket API, not OpenAI-compatible. | — | ✅ 2026-07-30 |
| **[AssemblyAI](https://www.assemblyai.com/pricing)**<br><sub>💳 no card · 📵 no phone · 🏢 commercial OK · 🔌 OpenAI-compat</sub> | $50 free credit on signup (no card) — pre-recorded & streaming speech-to-text, Speech Understanding, and an OpenAI-compatible LLM Gateway (25+ models) | One-time credit, not renewing. Catch: the default model differs between free and paid accounts — set speech_models explicitly to avoid cost jumps on upgrade. Only the LLM Gateway is OpenAI-compatible. | — | ✅ 2026-07-30 |
| **[Mixedbread](https://www.mixedbread.com/pricing)**<br><sub>💳 no card · 📵 no phone · 🏢 commercial OK</sub> | Starter plan: $5 one-time credit (no card) — embeddings (mxbai-embed-large-v1), reranking, and multimodal search over PDF/image/doc/code | Free credit is usage-based and non-renewing; usage-based pricing applies afterward. Native REST API, not documented as OpenAI-compatible. No card required. | — | ✅ 2026-07-30 |
| **[Clarifai](https://docs.clarifai.com/control/account-billing/)**<br><sub>💳 no card · 📱 phone · 🔌 OpenAI-compat</sub> | One-time $5 credit across serverless models (GPT-OSS-120B, Claude, Llama), vision, embeddings and image generation | Catch: SMS phone verification is required to claim the $5. Credit is one-time and expires 30 days after grant; a card is required to recharge afterward. | 30 days | ✅ 2026-07-30 |
| **[Runware](https://runware.ai/pricing)**<br><sub>💳 no card · 📵 no phone · 🏢 commercial OK</sub> | $2 in signup credits across first-party image models (FLUX.1/FLUX.2, Stable Diffusion 3, SDXL) on the Sonic Inference Engine — hundreds to thousands of generations | The $2 requires signup with a business email (personal/free-mail domains may be rejected); one-time, non-renewing. No watermark, no card, commercial use allowed. The OpenAI-compatible endpoint is chat-only, not for images. | — | ✅ 2026-07-30 |
| **[Nanonets](https://nanonets.com/pricing)**<br><sub>💳 no card · 📵 no phone · 🏢 commercial OK</sub> | $50 in free credits on signup (one-time) across data-extraction / OCR workflows | One-time signup credit, not renewing; no credit card required to start. Paid plans start at $100/month afterwards. | — | ✅ 2026-07-30 |
| **[Sarvam AI](https://docs.sarvam.ai/api/getting-started/pricing)**<br><sub>🔌 OpenAI-compat</sub> | ₹100 in free credits on signup, usable across all APIs including the Sarvam-M chat/LLM API and speech (STT/TTS) | One-time signup credit shared across all APIs; card/phone requirement not stated on the docs. India-focused provider (pricing in INR), strong Indic-language models. | — | ✅ 2026-07-30 |
| **[Gladia](https://www.gladia.io/pricing)** | €50 in free credits on signup for speech-to-text (~80+ hrs pre-recorded or 60+ hrs real-time at current rates) | One-time grant with no monthly reset; prepaid model — top up once the credit is consumed. Card requirement not explicitly stated on the pricing page. | — | ✅ 2026-07-30 |
| **[Rime](https://rime.ai/pricing)** | 3,000 free TTS minutes for every new account (Starter plan) | One-time allotment on signup; card requirement and commercial-use terms for the free minutes are not stated on the pricing page. | — | ✅ 2026-07-30 |
| **[Tencent Hunyuan](https://cloud.tencent.com/document/product/1729/97731)**<br><sub>🔌 OpenAI-compat</sub> | 1,000,000 free tokens for Hunyuan text LLMs (hunyuan-a13b, turbos, translation & vision models), plus a separate 1,000,000-token allotment for hunyuan-embedding | Free resource package valid 1 year from activation; unused tokens expire. Tencent Cloud generally requires mainland-China real-name ID verification to activate — a practical barrier for non-China users. Commercial-use terms not stated on the free-quota page. | 1 year | ✅ 2026-07-30 |
<!-- AUTOGEN:trial:end -->

## Notably NOT free

Worth saying plainly. As of the last verification pass, **OpenAI, Anthropic and xAI do not offer an ongoing free API tier.** Several providers people *assume* are free — **Together AI, DeepInfra, Perplexity's API, Replicate, Featherless AI** — currently require a card or prepayment before any API use, per their own docs. Some have handed out small one-time trial credits at various points, but that's changed repeatedly; check each provider's billing page before assuming anything.

For genuinely free access to strong models, your best bets here are **Gemini** (frontier-class) and the free open-weight models on **Groq, Cerebras, OpenRouter, Cloudflare, SiliconFlow and Z.ai**.

Removed after re-verification (their free *API* access couldn't be confirmed): **Upstage** (Solar API is pay-as-you-go; the "free runs" are for document agents), **Inference.net** (the free tier is gateway/observability only, not free model tokens), and **Hyperbolic** (requires a $5 minimum deposit before any use).

## How verification works

Free-tier terms move fast, and most lists go stale silently. This one is built to surface drift instead of hiding it. Full details in **[docs/methodology.md](docs/methodology.md)**; the short version:

1. **Every verified entry carries a `last_verified` date** and a link to the provider's *own* docs. No date + primary source → it ships as ⚠️ unverified, not as fact.
2. **A scheduled GitHub Action** ([`verify.yml`](.github/workflows/verify.yml)) re-checks every source link weekly and opens/updates a tracking issue if any break — an early warning that a provider changed something.
3. **The freshness badge is computed from the data,** not written by hand: the share of entries re-confirmed within 90 days, straight from [`providers.json`](data/providers.json). When it decays, it's visible.
4. **The dataset is schema-validated in CI.** A verified entry that's missing its date or source link fails the build — the honesty rule is enforced by machine, not by good intentions.
5. **Reporting a stale entry takes under a minute** via a [structured form](../../issues/new?template=inaccuracy.yml) that asks for the provider, what changed and a source link.

What "verified" covers and where its limits are: [docs/methodology.md](docs/methodology.md) · what earns a spot on the list: [docs/inclusion-criteria.md](docs/inclusion-criteria.md).

## Use the data

This is meant to be consumed by machines as much as by humans.

- **[`data/providers.json`](data/providers.json)** — canonical dataset, validated against [`data/schema.json`](data/schema.json). Every field explained in [docs/comparison-dimensions.md](docs/comparison-dimensions.md).
- **Portable exports** — [`providers.csv`](data/providers.csv) and [`providers.yaml`](data/providers.yaml), regenerated on every change. The [explorer](https://pacocartones.github.io/free-llm-api-hub/) can also export your current filter.

```bash
# Every ongoing free tier that needs neither a card nor a phone number:
curl -s https://raw.githubusercontent.com/pacocartones/free-llm-api-hub/main/data/providers.json \
  | jq -r '.providers[]
      | select(.category=="ongoing" and .card_required==false and .phone_required==false)
      | .name'
```

**Vouch for the data from your own README** — embed the live freshness badge:

```markdown
[![Free LLM API Hub](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/pacocartones/free-llm-api-hub/main/badge-freshness.json)](https://github.com/pacocartones/free-llm-api-hub)
```

It renders the real, auditable freshness count — not a static "as of some date I forgot to update" number.

## Contributing

Found an outdated limit, a dead link, or a provider that belongs here? You'll keep this useful for everyone.

- **Fastest:** the [structured issue form](../../issues/new?template=inaccuracy.yml) — provider, what changed, a source link.
- **Or open a PR** editing only [`data/providers.json`](data/providers.json). Run `npm run build` to regenerate the README and badge, and `npm test` to validate. Never hand-edit the tables — they're generated.

Full guidelines, including what counts as an acceptable source: **[CONTRIBUTING.md](CONTRIBUTING.md)**.

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
