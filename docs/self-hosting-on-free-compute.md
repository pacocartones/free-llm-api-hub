# Self-hosting on free compute (adjacent reference)

Sometimes no free *API* fits: you need a specific open model, full control, or an OpenAI-compatible server you run yourself. Then the question isn't "which API is free?" but "where do I get free **compute** to host a model?"

This is a **companion reference**, deliberately kept separate from the main [dataset](../data/providers.json). These are compute platforms and notebook environments, not hosted model APIs — so they're **not** counted as providers in `providers.json`, which stays focused on free *LLM APIs*. If you want a hosted endpoint instead, start with the [main list](../README.md); several entries there (Modal, Hugging Face, Groq, Cerebras, Baseten, Novita) also appear below for their compute angle.

> Notes below were confirmed against each platform's own docs on **2026-07-12** (inherited from a sibling project) and aren't on this repo's weekly re-verification cadence — treat them as a strong starting point and confirm the specifics before you build. The most useful part of each row is **the catch**.

## Notebook & serverless GPU (run a model, no server to manage)

| Platform | What's free | Card? | The catch | Docs |
|---|---|---|---|---|
| **Google Colab** | Cloud Jupyter notebooks with free GPU/TPU access | Not required | No SLA on GPU availability/type; crypto mining, SSH/remote-desktop and limit-evasion are banned. Sessions are ephemeral. | [FAQ](https://research.google.com/colaboratory/faq.html) |
| **Kaggle Notebooks** | Free GPU/TPU notebooks with a fixed **weekly** quota | Not required | Phone/SMS verification to enable GPU + internet is widely reported (not stated in official docs). | [GPU usage](https://www.kaggle.com/docs/efficient-gpu-usage) |
| **Hugging Face Spaces (ZeroGPU)** | Free serverless GPU inside Spaces, daily quota resetting every 24h | Not required to *use* | Gradio SDK only (no Streamlit/Docker), needs PyTorch 2.8+. Creating your *own* ZeroGPU Space needs PRO ($9/mo). | [ZeroGPU](https://huggingface.co/docs/hub/en/spaces-zerogpu) |
| **Modal** | Starter plan: **$30/mo** recurring compute credit | Likely required | Billing docs say "you must have a payment method on file" with no stated Starter exception. Also in the [main list](../README.md) as a serverless host. | [Pricing](https://modal.com/pricing) |
| **Lightning AI (Studios)** | **15 monthly credits**, 1 free Studio (resets every 4h) — "No credit card. No commitments." | Not required | The headline "80 free GPU hours" doesn't match the detailed per-GPU table; go by the table. | [Pricing](https://lightning.ai/pricing) |
| **Paperspace Gradient (DigitalOcean)** | Free notebooks with an M4000 GPU on the Free plan | Unconfirmed | More free GPU types unlock only on paid plans. Card requirement not confirmed in official docs. | [Docs](https://docs.digitalocean.com/products/paperspace/notebooks/details/features/) |
| **AWS SageMaker Studio Lab** | Free Jupyter environment — **no AWS account or card**, access by request | Not required | ⚠️ **New-customer access closes 2026-07-30** per AWS's own docs — likely unavailable to new signups now. | [Overview](https://docs.aws.amazon.com/sagemaker/latest/dg/studio-lab-overview.html) |

## General cloud trials (useful for managed LLM APIs, *not* free GPUs)

These grant a large credit but come with a critical, easy-to-miss restriction: **the free trial does not give you GPU VMs.** They're still useful for LLM work if you spend the credit on the provider's *managed* model API (Vertex AI, Azure OpenAI) rather than trying to self-host on a GPU instance.

| Platform | Credit | The catch (verified) | Docs |
|---|---|---|---|
| **Google Cloud Free Trial** | **$300**, 90 days | Official docs: "you can't add GPUs to your VM instances" while in Free Trial, and "GPUs and TPUs are not included in the Free Tier." Spend it on **Vertex AI (Gemini)** instead. Card required. | [Free features](https://docs.cloud.google.com/free/docs/free-cloud-features) |
| **Microsoft Azure Free Account** | **$200**, 30 days | Trial subscriptions "aren't eligible for limit or quota increases" — GPU VM families (NC/ND/NV) default to quota 0 with no increase. Spend it on **Azure OpenAI** instead. Card required. | [Account](https://azure.microsoft.com/en-us/pricing/purchase-options/azure-account) |

## Adjacent media/model APIs with signup credit

| Platform | What's free | The catch | Docs |
|---|---|---|---|
| **fal.ai** | Welcome credits officially confirmed | The exact USD amount isn't published anywhere official; third-party "$10/$20" figures are unconfirmed. Mostly image/video/audio generation, not text LLMs. | [FAQ](https://fal.ai/docs/documentation/model-apis/faq) |

---

Want a hosted, ready-to-call endpoint instead of running your own? See the [main list of free LLM APIs](../README.md) and the [collections](../collections/README.md).
