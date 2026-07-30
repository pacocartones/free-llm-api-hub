<!-- Generated from data/providers.json by scripts/build.mjs — do not edit by hand. -->

# Free LLM APIs with an OpenAI-compatible endpoint

Free LLM APIs that expose an OpenAI-compatible endpoint — point the OpenAI SDK at a new base_url and you are done.

[← All collections](README.md) · [Interactive explorer ↗](https://pacocartones.github.io/free-llm-api-hub/) · [Main list](../README.md)

These providers expose an **OpenAI-compatible endpoint** (`openai_compatible: true`), so migrating is usually a one-line change: keep the OpenAI SDK, swap `base_url` and `api_key`. Grab each provider’s exact base URL from its linked docs.

**19 of 28 tracked providers** match.

| Provider | Type | What's free | The catch | Verified |
|---|---|---|---|---|
| **[Google Gemini API (AI Studio)](https://ai.google.dev/gemini-api/docs/rate-limits)**<br><sub>💳 no card · 📵 no phone · 🏢 commercial OK · 🔌 OpenAI-compat</sub> | Ongoing | Gemini 2.5 Flash, 2.5 Flash-Lite, 2.5 Pro (limited), embeddings, TTS models | Free-tier prompts/outputs may be used by Google to improve its products when used outside the UK/CH/EEA/EU | ✅ 2026-07-11 |
| **[Groq](https://console.groq.com/docs/rate-limits)**<br><sub>💳 no card · 📱 phone · 🏢 commercial OK · 🔌 OpenAI-compat</sub> | Ongoing | Open-weight models (Llama, Qwen, GPT-OSS) plus Whisper, no credit card required | Limits apply at the organization level, not per API key. Phone verification required at signup | ✅ 2026-07-11 |
| **[OpenRouter](https://openrouter.ai/docs/api-reference/limits)**<br><sub>💳 no card · 📵 no phone · 🏢 commercial OK · 🔌 OpenAI-compat</sub> | Ongoing | 20+ models with a :free suffix, single API across many providers | ToS (Apr 2026) prohibits resale or building a competing service on the free models; a private proxy for personal use is fine | ✅ 2026-07-11 |
| **[Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/platform/pricing/)**<br><sub>💳 no card · 📵 no phone · 🏢 commercial OK · 🔌 OpenAI-compat</sub> | Ongoing | 10,000 Neurons/day, all account plans | Resets daily at 00:00 UTC; overage on a Workers Paid plan bills at $0.011/1,000 Neurons | ✅ 2026-07-11 |
| **[GitHub Models](https://docs.github.com/en/github-models/prototyping-with-ai-models)**<br><sub>💳 no card · 📵 no phone · 🔬 eval only · 🔌 OpenAI-compat</sub> | Ongoing | Included with any GitHub account via the Copilot tier | Scoped by GitHub to experimentation/prototyping, not production traffic | ✅ 2026-07-11 |
| **[Cerebras](https://inference-docs.cerebras.ai/support/rate-limits)**<br><sub>🔌 OpenAI-compat</sub> | Ongoing | Access to all Cerebras-hosted models | Free tier includes community support (Discord) only; paid Developer tier gives "10x higher" rate limits | ✅ 2026-07-11 |
| **[HuggingFace](https://huggingface.co/docs/inference-providers/en/pricing)**<br><sub>🔌 OpenAI-compat</sub> | Ongoing | Free CPU Basic + ZeroGPU for Spaces; Inference Providers has a monthly credit ($0.10/mo on Free plan, $2.00/mo on PRO/Team/Enterprise) | Credits only apply with "Routed by Hugging Face" billing, not with a Custom Provider Key | ✅ 2026-07-11 |
| **[SiliconFlow](https://docs.siliconflow.cn/en/userguide/rate-limits/rate-limit-and-upgradation)**<br><sub>📱 phone · 🔌 OpenAI-compat</sub> | Ongoing | Several models permanently free (e.g. Qwen2.5-7B-Instruct and others) at $0 cost, plus a $1 welcome credit for paid models | Signup requires SMS phone verification. Full "real-name authentication" (needed for recharging/billing) requires a mainland China, Hong Kong/Macao, or Taiwan ID document — this may limit full access for users without one, though basic use of free models appears reachable with standard account verification | ✅ 2026-07-11 |
| **[Z.ai (Zhipu AI / GLM)](https://docs.z.ai/guides/overview/pricing)**<br><sub>📵 no phone · 🏢 commercial OK · 🔌 OpenAI-compat</sub> | Ongoing | GLM-4.5-Flash, GLM-4.7-Flash (text), and GLM-4.6V-Flash (vision) are officially listed as $0 cost (input, cached input, and output) on a permanent basis | Terms of Use prohibit using the service to "develop, train, or improve" competing algorithms or models — otherwise general use, including commercial, isn't restricted | ✅ 2026-07-11 |
| **[OVHcloud AI Endpoints](https://www.ovhcloud.com/en/public-cloud/ai-endpoints/catalog/)**<br><sub>🔌 OpenAI-compat</sub> | Ongoing | Several open-weight models in the catalog (e.g. Qwen3Guard) listed as $0 per token, permanently, via two access modes: anonymous (no account) and authenticated (API key tied to a Public Cloud project) | European provider (France), relevant for EU data-sovereignty/GDPR-conscious use. The authenticated tier needs a valid payment method on the project (though "Free" models themselves don't charge); anonymous access needs neither an account nor a card. A separate general $200 Public Cloud trial voucher also exists but is unrelated to this permanent free-model tier | ✅ 2026-07-11 |
| **[Fireworks AI](https://docs.fireworks.ai/faq-new/billing-pricing/)**<br><sub>💳 no card · 🔌 OpenAI-compat</sub> | Trial | $1 trial credit | Default monthly spend cap of $50 for new accounts; no card needed to activate the $1 credit, card needed once it's spent | ✅ 2026-07-11 |
| **[Baseten](https://www.baseten.co/pricing/)**<br><sub>🔌 OpenAI-compat</sub> | Trial | $30 trial credit | No documented expiration date publicly | ✅ 2026-07-11 |
| **[Nebius AI Studio](https://docs.tokenfactory.nebius.com)**<br><sub>🔌 OpenAI-compat</sub> | Trial | $1 trial credit, valid for 30 days | Product renamed to "Nebius Token Factory"; a bank card is required to set up billing | ✅ 2026-07-11 |
| **[Novita AI](https://novita.ai/pricing)**<br><sub>🔌 OpenAI-compat</sub> | Trial | $1 free credit on signup | Corrected from a previously listed "$0.50/year" figure, which does not appear on any official Novita domain; a separate referral program ("Give $10, Earn $10") also exists | ✅ 2026-07-11 |
| **[Alibaba Cloud (Model Studio)](https://www.alibabacloud.com/help/en/model-studio/new-free-quota)**<br><sub>🔌 OpenAI-compat</sub> | Trial | 1,000,000 tokens (example figure, varies by model), international/Singapore region only | Excludes batch processing, context caching, fine-tuning, and dedicated deployment | ✅ 2026-07-11 |
| **[SambaNova Cloud](https://cloud.sambanova.ai/plans)**<br><sub>💳 no card · 🔌 OpenAI-compat</sub> | Trial | $5 trial credit, 3 months, plus a rate-limited free tier | Confirmed models: DeepSeek, Llama-3.3-70B, Gemma-3-31B, gpt-oss-120b | ✅ 2026-07-11 |
| **[Scaleway Generative APIs](https://www.scaleway.com/en/pricing/model-as-a-service/)**<br><sub>🔌 OpenAI-compat</sub> | Trial | 1,000,000 tokens free + 60 min Whisper transcription; billing starts at token 1,000,001 | European provider (France). Free allowance is a one-time token bucket, not time-limited | ✅ 2026-07-11 |
| **[NVIDIA NIM](https://build.nvidia.com/)**<br><sub>📱 phone · 🔬 eval only · 🔌 OpenAI-compat</sub> | Trial | Trial credit, phone verification required | "Evaluation only, not production" per NVIDIA's own Trial Terms of Service — NVIDIA may discontinue the trial at any time with no continuity obligation | ✅ 2026-07-11 |
| **[Vercel AI Gateway](https://vercel.com/docs/ai-gateway/pricing)**<br><sub>💳 no card · 🔌 OpenAI-compat</sub> | Trial | Free tier with a monthly free credit covering a subset of models at lower rate limits | Free tier and its monthly-credit behaviour are confirmed in Vercel's own docs; the specific "$5/month" figure circulating in community posts is not stated there. Once you purchase credits, your account moves to the paid tier and the monthly free credit no longer applies. | ✅ 2026-07-30 |

## Quickstart — reuse the OpenAI SDK

Most of these accept the OpenAI SDK with two changes: point `base_url` at the provider and use its key. Get the exact base URL from the provider's linked docs.

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://<provider-base-url>/v1",  # from the provider's docs
    api_key="<YOUR_FREE_API_KEY>",
)
resp = client.chat.completions.create(
    model="<a-free-model>",
    messages=[{"role": "user", "content": "Hello!"}],
)
print(resp.choices[0].message.content)
```

---

Other collections: [Free LLM APIs with no credit card](no-credit-card.md) · [Free LLM APIs with no phone verification](no-phone.md) · [Free LLM APIs for commercial use](commercial-use.md) · [OpenAI-compatible free LLM APIs](openai-compatible.md) · [Permanently free LLM APIs](always-free.md) · [Free multimodal LLM APIs](multimodal.md)

_Generated from [providers.json](../data/providers.json). Terms change without notice — always confirm against each provider's own docs._
