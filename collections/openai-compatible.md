<!-- Generated from data/providers.json by scripts/build.mjs — do not edit by hand. -->

# Free LLM APIs with an OpenAI-compatible endpoint

Free LLM APIs that expose an OpenAI-compatible endpoint — point the OpenAI SDK at a new base_url and you are done.

[← All collections](README.md) · [Interactive explorer ↗](https://pacocartones.github.io/free-llm-api-hub/) · [Main list](../README.md)

These providers expose an **OpenAI-compatible endpoint** (`openai_compatible: true`), so migrating is usually a one-line change: keep the OpenAI SDK, swap `base_url` and `api_key`. Grab each provider’s exact base URL from its linked docs.

**30 of 61 tracked providers** match.

| Provider | OpenAI base URL | What's free | The catch | Verified |
|---|---|---|---|---|
| **[Google Gemini API (AI Studio)](https://ai.google.dev/gemini-api/docs/rate-limits)**<br><sub>💳 no card · 📵 no phone · 🏢 commercial OK · 🔌 OpenAI-compat</sub> | `https://generativelanguage.googleapis.com/v1beta/openai/` | Gemini 2.5 Flash, 2.5 Flash-Lite, 2.5 Pro (limited), embeddings, TTS models | Free-tier prompts/outputs may be used by Google to improve its products when used outside the UK/CH/EEA/EU | ✅ 2026-07-11 |
| **[Groq](https://console.groq.com/docs/rate-limits)**<br><sub>💳 no card · 📱 phone · 🏢 commercial OK · 🔌 OpenAI-compat</sub> | `https://api.groq.com/openai/v1` | Open-weight models (Llama, Qwen, GPT-OSS) plus Whisper, no credit card required | Limits apply at the organization level, not per API key. Phone verification required at signup | ✅ 2026-07-11 |
| **[OpenRouter](https://openrouter.ai/docs/api-reference/limits)**<br><sub>💳 no card · 📵 no phone · 🏢 commercial OK · 🔌 OpenAI-compat</sub> | `https://openrouter.ai/api/v1` | 20+ models with a :free suffix, single API across many providers | ToS (Apr 2026) prohibits resale or building a competing service on the free models; a private proxy for personal use is fine | ✅ 2026-07-11 |
| **[Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/platform/pricing/)**<br><sub>💳 no card · 📵 no phone · 🏢 commercial OK · 🔌 OpenAI-compat</sub> | `https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1` | 10,000 Neurons/day, all account plans | Resets daily at 00:00 UTC; overage on a Workers Paid plan bills at $0.011/1,000 Neurons | ✅ 2026-07-11 |
| **[GitHub Models](https://docs.github.com/en/github-models/prototyping-with-ai-models)**<br><sub>💳 no card · 📵 no phone · 🔬 eval only · 🔌 OpenAI-compat</sub> | `https://models.github.ai/inference` | Included with any GitHub account via the Copilot tier | Scoped by GitHub to experimentation/prototyping, not production traffic | ✅ 2026-07-11 |
| **[Cohere](https://docs.cohere.com/docs/rate-limits)**<br><sub>💳 no card · 📵 no phone · 🔬 eval only · 🔌 OpenAI-compat</sub> | _see docs_ | Trial (evaluation) API keys covering chat, embed and rerank | Explicitly for evaluation only — Cohere's terms prohibit production/commercial use on a trial key | ✅ 2026-07-30 |
| **[Cerebras](https://inference-docs.cerebras.ai/support/rate-limits)**<br><sub>🔌 OpenAI-compat</sub> | `https://api.cerebras.ai/v1` | Access to all Cerebras-hosted models | Free tier includes community support (Discord) only; paid Developer tier gives "10x higher" rate limits | ✅ 2026-07-11 |
| **[HuggingFace](https://huggingface.co/docs/inference-providers/en/pricing)**<br><sub>💳 no card · 🔌 OpenAI-compat</sub> | `https://router.huggingface.co/v1` | Free CPU Basic + ZeroGPU for Spaces; Inference Providers has a monthly credit ($0.10/mo on Free plan, $2.00/mo on PRO/Team/Enterprise) | Credits only apply with "Routed by Hugging Face" billing, not with a Custom Provider Key | ✅ 2026-07-30 |
| **[SiliconFlow](https://docs.siliconflow.cn/en/userguide/rate-limits/rate-limit-and-upgradation)**<br><sub>📱 phone · 🔌 OpenAI-compat</sub> | `https://api.siliconflow.com/v1` | Several models permanently free (e.g. Qwen2.5-7B-Instruct and others) at $0 cost, plus a $1 welcome credit for paid models | Signup requires SMS phone verification. Full "real-name authentication" (needed for recharging/billing) requires a mainland China, Hong Kong/Macao, or Taiwan ID document — this may limit full access for users without one, though basic use of free models appears reachable with standard account verification | ✅ 2026-07-30 |
| **[Z.ai (Zhipu AI / GLM)](https://docs.z.ai/guides/overview/pricing)**<br><sub>📵 no phone · 🏢 commercial OK · 🔌 OpenAI-compat</sub> | `https://api.z.ai/api/paas/v4/` | GLM-4.5-Flash, GLM-4.7-Flash (text), and GLM-4.6V-Flash (vision) are officially listed as $0 cost (input, cached input, and output) on a permanent basis | Terms of Use prohibit using the service to "develop, train, or improve" competing algorithms or models — otherwise general use, including commercial, isn't restricted | ✅ 2026-07-30 |
| **[IBM watsonx.ai (Lite plan)](https://www.ibm.com/docs/en/watsonx/saas?topic=cloud-watsonxai-runtime-plans)**<br><sub>🔌 OpenAI-compat</sub> | _see docs_ | Lite plan: 300,000 tokens/month for foundation model inference, 20 CUH/month for ML tooling, 100 pages/month of document text extraction | Lite plan doesn't support fine-tuning of foundation or custom models; 1-day idle deployment timeout. Never expires or bills while inside quota, but a payment method (with a nominal ~$1 authorization hold) is required at signup | ✅ 2026-07-11 |
| **[OVHcloud AI Endpoints](https://www.ovhcloud.com/en/public-cloud/ai-endpoints/catalog/)**<br><sub>🔌 OpenAI-compat</sub> | `https://oai.endpoints.kepler.ai.cloud.ovh.net/v1` | Several open-weight models in the catalog (e.g. Qwen3Guard) listed as $0 per token, permanently, via two access modes: anonymous (no account) and authenticated (API key tied to a Public Cloud project) | European provider (France), relevant for EU data-sovereignty/GDPR-conscious use. The authenticated tier needs a valid payment method on the project (though "Free" models themselves don't charge); anonymous access needs neither an account nor a card. A separate general $200 Public Cloud trial voucher also exists but is unrelated to this permanent free-model tier | ✅ 2026-07-11 |
| **[Fireworks AI](https://docs.fireworks.ai/faq-new/billing-pricing/)**<br><sub>💳 no card · 🔌 OpenAI-compat</sub> | `https://api.fireworks.ai/inference/v1` | $1 trial credit | Default monthly spend cap of $50 for new accounts; no card needed to activate the $1 credit, card needed once it's spent | ✅ 2026-07-11 |
| **[Baseten](https://www.baseten.co/pricing/)**<br><sub>🔌 OpenAI-compat</sub> | `https://inference.baseten.co/v1` | $30 trial credit | No documented expiration date publicly | ✅ 2026-07-11 |
| **[Nebius AI Studio](https://docs.tokenfactory.nebius.com)**<br><sub>📵 no phone · 🏢 commercial OK · 🔌 OpenAI-compat</sub> | `https://api.tokenfactory.nebius.com/v1` | $1 trial credit, valid for 30 days | Product renamed to "Nebius Token Factory"; a bank card is required to set up billing | ✅ 2026-07-30 |
| **[Novita AI](https://novita.ai/pricing)**<br><sub>🔌 OpenAI-compat</sub> | _see docs_ | $1 free credit on signup | Corrected from a previously listed "$0.50/year" figure, which does not appear on any official Novita domain; a separate referral program ("Give $10, Earn $10") also exists | ✅ 2026-07-11 |
| **[Alibaba Cloud (Model Studio)](https://www.alibabacloud.com/help/en/model-studio/new-free-quota)**<br><sub>💳 no card · 🔌 OpenAI-compat</sub> | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` | 1,000,000 tokens (example figure, varies by model), international/Singapore region only | Excludes batch processing, context caching, fine-tuning, and dedicated deployment | ✅ 2026-07-30 |
| **[SambaNova Cloud](https://cloud.sambanova.ai/plans)**<br><sub>💳 no card · 🏢 commercial OK · 🔌 OpenAI-compat</sub> | `https://api.sambanova.ai/v1` | Rate-limited free tier (applies when no payment method is linked) across all models | Free Tier applies when no payment method is linked to the account; SambaCloud ToS grants a commercial license (no evaluation-only clause). The previously-listed "$5 / 3 months" trial could not be re-confirmed on official pages (2026-07-30). | ✅ 2026-07-30 |
| **[Scaleway Generative APIs](https://www.scaleway.com/en/pricing/model-as-a-service/)**<br><sub>🔌 OpenAI-compat</sub> | `https://api.scaleway.ai/v1` | 1,000,000 tokens free + 60 min Whisper transcription; billing starts at token 1,000,001 | European provider (France). Free allowance is a one-time token bucket, not time-limited | ✅ 2026-07-30 |
| **[NVIDIA NIM](https://build.nvidia.com/)**<br><sub>📱 phone · 🔬 eval only · 🔌 OpenAI-compat</sub> | `https://integrate.api.nvidia.com/v1` | Trial credit, phone verification required | "Evaluation only, not production" per NVIDIA's own Trial Terms of Service — NVIDIA may discontinue the trial at any time with no continuity obligation | ✅ 2026-07-11 |
| **[Vercel AI Gateway](https://vercel.com/docs/ai-gateway/pricing)**<br><sub>💳 no card · 🔌 OpenAI-compat</sub> | `https://ai-gateway.vercel.sh/v1` | Free tier with a monthly free credit covering a subset of models at lower rate limits | Free tier and its monthly-credit behaviour are confirmed in Vercel's own docs; the specific "$5/month" figure circulating in community posts is not stated there. Once you purchase credits, your account moves to the paid tier and the monthly free credit no longer applies. | ✅ 2026-07-30 |
| **[Jina AI](https://jina.ai/embeddings/)**<br><sub>💳 no card · 📵 no phone · 🏢 commercial OK · 🔌 OpenAI-compat</sub> | `https://api.jina.ai/v1` | 10M free tokens (one-time) across all models — embeddings (v3/v4), rerankers, classifier; plus a keyless Reader (r.jina.ai) for basic use | The 10M-token balance is a one-time grant that does not replenish; the keyless Reader is genuinely ongoing. Hosted API is commercial-OK and data is not used for training. No card required. | ✅ 2026-07-30 |
| **[AssemblyAI](https://www.assemblyai.com/pricing)**<br><sub>💳 no card · 📵 no phone · 🏢 commercial OK · 🔌 OpenAI-compat</sub> | `https://llm-gateway.assemblyai.com/v1` | $50 free credit on signup (no card) — pre-recorded & streaming speech-to-text, Speech Understanding, and an OpenAI-compatible LLM Gateway (25+ models) | One-time credit, not renewing. Catch: the default model differs between free and paid accounts — set speech_models explicitly to avoid cost jumps on upgrade. Only the LLM Gateway is OpenAI-compatible. | ✅ 2026-07-30 |
| **[Clarifai](https://docs.clarifai.com/control/account-billing/)**<br><sub>💳 no card · 📱 phone · 🔌 OpenAI-compat</sub> | `https://api.clarifai.com/v2/ext/openai/v1` | One-time $5 credit across serverless models (GPT-OSS-120B, Claude, Llama), vision, embeddings and image generation | Catch: SMS phone verification is required to claim the $5. Credit is one-time and expires 30 days after grant; a card is required to recharge afterward. | ✅ 2026-07-30 |
| **[Arli AI](https://www.arliai.com/pricing)**<br><sub>🔌 OpenAI-compat</sub> | `https://api.arliai.com/v1` | Free plan ($0): access to all text LLMs (Gemma, Qwen, etc.), capped at ~5 requests per 2-day window, 12K context, 1 request at a time | Free tier is for testing only — very restrictive. Provider advertises zero-log / no data retention. Card requirement for the free tier is not stated on the pricing page. | ✅ 2026-07-30 |
| **[Ollama Cloud](https://docs.ollama.com/cloud)**<br><sub>💳 no card · 📵 no phone · 🏢 commercial OK · 🔌 OpenAI-compat</sub> | `https://ollama.com/v1` | $0 Free plan: access to cloud-hosted open models (Qwen, GPT-OSS, DeepSeek, etc.) via API | First-party — Ollama hosts the cloud models. Requires an ollama.com account + API key (`ollama signin`); the free plan is for light usage, Pro ($20/mo) raises limits. No card required. | ✅ 2026-07-30 |
| **[ModelScope (API-Inference)](https://www.modelscope.cn/docs/model-service/API-Inference/intro)**<br><sub>💳 no card · 🔬 eval only · 🔌 OpenAI-compat</sub> | `https://api-inference.modelscope.cn/v1` | ~2,000 free API calls/day across open-weight models (Qwen3, DeepSeek, GLM, Llama, etc.) via API-Inference | Alibaba's model hub — a different product from Alibaba Model Studio. Requires a ModelScope account bound to an Alibaba Cloud account with real-name (ID) verification — a practical barrier for non-China users. Explicitly non-commercial ("for developers to experience"). No card. | ✅ 2026-07-30 |
| **[Moondream Cloud](https://moondream.ai/pricing)**<br><sub>🔌 OpenAI-compat</sub> | `https://api.moondream.ai/v1` | $5/month usage credits in every workspace (Free plan) for the Moondream vision model — caption, query (VQA), detect, point | Recurring $5/month credit; card requirement not stated on the pricing page; commercial terms not specified. OpenAI-compatible endpoint. | ✅ 2026-07-30 |
| **[Sarvam AI](https://docs.sarvam.ai/api/getting-started/pricing)**<br><sub>🔌 OpenAI-compat</sub> | `https://api.sarvam.ai/v1` | ₹100 in free credits on signup, usable across all APIs including the Sarvam-M chat/LLM API and speech (STT/TTS) | One-time signup credit shared across all APIs; card/phone requirement not stated on the docs. India-focused provider (pricing in INR), strong Indic-language models. | ✅ 2026-07-30 |
| **[Tencent Hunyuan](https://cloud.tencent.com/document/product/1729/97731)**<br><sub>🔌 OpenAI-compat</sub> | `https://api.hunyuan.cloud.tencent.com/v1` | 1,000,000 free tokens for Hunyuan text LLMs (hunyuan-a13b, turbos, translation & vision models), plus a separate 1,000,000-token allotment for hunyuan-embedding | Free resource package valid 1 year from activation; unused tokens expire. Tencent Cloud generally requires mainland-China real-name ID verification to activate — a practical barrier for non-China users. Commercial-use terms not stated on the free-quota page. | ✅ 2026-07-30 |

## Quickstart — reuse the OpenAI SDK

Most of these accept the OpenAI SDK with two changes: point `base_url` at the provider and use its free key. The base URLs are in the table above; grab a key from each provider's console.

### Python — example: Groq

```python
from openai import OpenAI

client = OpenAI(base_url="https://api.groq.com/openai/v1", api_key="<YOUR_FREE_API_KEY>")
resp = client.chat.completions.create(
    model="llama-3.1-8b-instant",
    messages=[{"role": "user", "content": "Hello!"}],
)
print(resp.choices[0].message.content)
```

### curl

```bash
curl https://api.groq.com/openai/v1/chat/completions \
  -H "Authorization: Bearer $YOUR_FREE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "llama-3.1-8b-instant", "messages": [{"role": "user", "content": "Hello!"}]}'
```

Swap the `base_url` (and a model that provider offers free) for any row above.

---

Other collections: [Free LLM APIs with no credit card](no-credit-card.md) · [Free LLM APIs with no phone verification](no-phone.md) · [Free LLM APIs for commercial use](commercial-use.md) · [OpenAI-compatible free LLM APIs](openai-compatible.md) · [Permanently free LLM APIs](always-free.md) · [Free multimodal LLM APIs](multimodal.md)

_Generated from [providers.json](../data/providers.json). Terms change without notice — always confirm against each provider's own docs._
