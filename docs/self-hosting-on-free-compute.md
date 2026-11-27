# Self-hosting on free compute (adjacent reference)

Sometimes no free *API* fits: you need a specific open model, full control, or an OpenAI-compatible server you run yourself. Then the question isn't "which API is free?" but "where do I get free **compute** to host a model?"

This is a **companion reference**, deliberately kept separate from the main [dataset](../data/providers.json). These are compute platforms and notebook environments, not hosted model APIs — so they're **not** counted as providers in `providers.json`, which stays focused on free *LLM APIs*.

> **Receipts live in [`data/gpu-compute.json`](../data/gpu-compute.json)**, rendered as the [Free GPU compute page](https://freellmapihub.com/free-gpu/): each value there carries the provider's own sentence, its page and the day it was read, and a value no page states reads "Not stated". This page is a short guide to that data; when the two differ, the data file wins. Platforms that are also hosted LLM APIs (Modal, Lightning AI, Groq, Cerebras, Baseten, Novita) are covered, with their own quotes, in the [main list](../README.md) rather than here.

## Notebook & serverless GPU (run a model, no server to manage)

| Platform | What's free (per the provider's page) | The catch | Docs |
|---|---|---|---|
| **Google Colab** | Free-of-charge access to GPUs and TPUs in hosted notebooks | Resources are not guaranteed and limits fluctuate; Colab does not publish them. Free notebooks run for at most 12 hours, depending on availability. Card requirement not stated. | [FAQ](https://research.google.com/colaboratory/faq.html) |
| **Kaggle Notebooks** | A single NVIDIA Tesla P100, or a TPU v3-8, added to a notebook for free | Sessions run up to 12 hours (9 for TPU), 20 minutes of idle time while editing, and you may be queued at busy times. The weekly hour quota is shown in account settings; the docs page read does not state it. | [Notebooks docs](https://www.kaggle.com/docs/notebooks) |
| **Hugging Face Spaces (ZeroGPU)** | Free serverless GPU inside Spaces: 2 minutes/day unauthenticated, 5 minutes/day with a free account | The quota resets 24 hours after your first GPU use; PRO gets 40 minutes and can buy more. | [ZeroGPU](https://huggingface.co/docs/hub/en/spaces-zerogpu) |
| **Paperspace Gradient Notebooks (DigitalOcean)** | A free GPU plan for Notebooks in private workspaces | Free machines shut down after at most 6 hours, and only one free notebook may run at a time. | [Features](https://docs.digitalocean.com/products/paperspace/notebooks/details/features/) |

## General cloud trials (useful for managed LLM APIs, *not* free GPUs)

These grant a large credit but come with an easy-to-miss restriction for GPU work. They can still be useful if you spend the credit on the provider's *managed* model API (Vertex AI, Azure OpenAI) rather than a GPU instance.

| Platform | Credit | The catch | Docs |
|---|---|---|---|
| **Google Cloud Free Trial** | $300 over 90 days | While the billing account is a Free trial account you can't add GPUs to VM instances. | [Free features](https://docs.cloud.google.com/free/docs/free-cloud-features) |
| **Microsoft Azure free account** | $200 within 30 days | Free trial subscriptions aren't eligible for limit or quota increases, so GPU VM quota can't be raised without moving to pay-as-you-go. | [Account](https://azure.microsoft.com/en-us/pricing/purchase-options/azure-account) · [Limits](https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/azure-subscription-service-limits) |

## Not a free GPU option

- **Amazon SageMaker Studio Lab** — no longer open to new customers (existing customers keep access).
- **SaladCloud** — the pricing FAQ answers "Is there a free trial?" with "No."
- **Oracle Cloud Always Free** — the list of Always Free services includes AMD and Arm (Ampere A1) compute and no GPU compute.
- **fal.ai** — free or promotional credits exist, but no amount is published, and the two official pages give different expiry rules. See its entry on the [Free GPU compute page](https://freellmapihub.com/free-gpu/).

Apply-to-get credit programs (startup, research, student) are in [credit programs](credit-programs.md).

---

Want a hosted, ready-to-call endpoint instead of running your own? See the [main dataset of free LLM APIs](../README.md) and the [collections](../collections/README.md).

---

_[← Docs index](README.md) · [Main README](../README.md)_
