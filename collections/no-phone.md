<!-- Generated from data/providers.json by scripts/build.mjs — do not edit by hand. -->

# Free LLM APIs with no phone number required

LLM APIs whose signup needs no SMS/phone verification — a live slice of a continuously-verified dataset.

[← All collections](README.md) · [Interactive explorer ↗](https://freellmapihub.com/) · [Main list](../README.md)

Providers you can sign up for **without phone verification** (`phone_required: false`). Providers that gate signup behind a phone number, or whose rule is not known, are left out.

**4 of 94 tracked providers** match.

| Provider | Type | What's free | The catch | Verified |
|---|---|---|---|---|
| **[OVHcloud AI Endpoints](https://www.ovhcloud.com/en/public-cloud/ai-endpoints/catalog/)**<br><sub>💳 no card · 📵 no phone · 🔌 OpenAI-compat</sub> | Ongoing | Ten models are currently listed as Free: three Olala-v1.0 text models (mini-7A1B, summarise, translate), two Qwen3Guard moderation models, Stable Diffusion XL (being retired, end of life 2027-02-10) and four NVIDIA Riva TTS voices; access is available anonymously or with an API key tied to a Public Cloud project | Anonymous access uses no account, API key or signup phone; the 2 requests/min limit is per IP and model. Authenticated API keys require a Public Cloud project with a valid payment method. Commercial permission for the hosted free-model tier is not confirmed; individual model licences are separate. Sources: https://docs.ovhcloud.com/en/guides/public-cloud/ai-machine-learning/ai-endpoints-capabilities and https://docs.ovhcloud.com/en/guides/public-cloud/ai-machine-learning/ai-endpoints-getting-started (read 2026-11-25). | ✅ 25 Nov 2026 |
| **[Scaleway Generative APIs](https://www.scaleway.com/en/pricing/model-as-a-service/)**<br><sub>💳 card required · 📵 no phone · 🔌 OpenAI-compat</sub> | Trial | 1,000,000 tokens free + 60 min Whisper transcription; billing starts at token 1,000,001 | European provider (France). Free allowance is a one-time token bucket, not time-limited. Official rate limits apply once a valid payment method is registered; identity verification raises them. Free tier and limits read on 2026-11-27: the pricing page ("free tier: 1 million tokens and 60 minutes of audio transcription") and the Organization quotas docs (300 RPM / 200k TPM with a validated payment method, 600 RPM and higher TPM once identity is validated). | ✅ 27 Nov 2026 |
| **[AI Horde](https://aihorde.net/)**<br><sub>💳 no card · 📵 no phone · 🏢 commercial OK (conditional) · 🔌 OpenAI-compat</sub> | Ongoing | Free crowdsourced text & image generation; anonymous API key '0000000000' (no registration), or register to earn kudos for priority | Community-powered volunteer network — model availability and speed vary with worker supply, so it is not a fixed-SLA service. No card, no phone. Kudos never expire and cannot be sold. Commercial use is conditional: each model carries its own licence (aihorde.net UI displays 'Commercial use: allowed' or 'Pick something else if you plan to sell what you make or use it in a business'), and the official AI Horde FAQ (https://aihorde.net/faq/) says paid services built on the API must give back to the Horde at least as much as they take. | ✅ 25 Nov 2026 |
| **[OCR.space](https://ocr.space/OCRAPI)**<br><sub>💳 no card · 📵 no phone · 🏢 commercial OK</sub> | Ongoing | 25,000 conversions/month (Engine 1 & 2) plus 1,000 Engine 3 conversions/month; max 1 MB file, PDFs up to 3 pages | Free searchable-PDF output carries a watermark (raw text extraction is unrestricted); the free key needs only an email, no card. Commercial use permitted, with no uptime guarantee on the free plan (FAQ). Engine 1 is retired; calls to it are redirected to Engine 2 (OCR API page, 2026-11-26). | ✅ 26 Nov 2026 |

---

Other collections: [Free LLM APIs with no credit card](no-credit-card.md) · [Free LLM APIs with no phone verification](no-phone.md) · [Free AI APIs with no account needed](anonymous-access.md) · [Free LLM APIs for commercial use](commercial-use.md) · [OpenAI-compatible free LLM APIs](openai-compatible.md) · [Permanently free LLM APIs](always-free.md) · [Free multimodal LLM APIs](multimodal.md) · [Free LLM APIs that say they do not train on your prompts](no-training.md) · [Free LLM APIs whose free tier renews](renewing-free-tier.md) · [Free LLM APIs with a free signup credit](free-signup-credit.md)

_Generated from [providers.json](../data/providers.json). Terms change without notice — always confirm against each provider's own docs._
