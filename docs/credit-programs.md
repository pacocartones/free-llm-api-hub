<!-- Tables generated from data/programs.json by scripts/build.mjs — edit the data, not the tables. -->

# Credit programs — apply to get (adjacent reference)

The [main list](../README.md) is **self-serve** free APIs you can call today. This companion reference covers the other kind of "free": **credit programs you apply for** — startup programs and student/research programs. There are live web pages too: **[for startups](https://freellmapihub.com/programs/startups)** · **[for students & researchers](https://freellmapihub.com/programs/research)**.

They're genuinely valuable, but different enough that they're kept **out of the [main dataset](../data/providers.json)** on purpose (so it stays verified, self-serve and start-now):

- They need an **application and eligibility** — you can't just get a key and call the API.
- They're **volatile** — amounts, tiers and terms change often; "up to $X" is usually a marketing maximum, not what a self-serve applicant gets.
- Most give **cloud-wide credits** (usable *for* LLM APIs, but not LLM-specific) rather than first-party model-API credits.

> Confirmed against each program's own page on **2026-07-30**. Always re-check the current terms before you rely on one.

**"Funds LLM API?"** — ✅ first-party LLM-API credits · ◐ cloud/compute credits usable for managed LLM APIs (Bedrock, Vertex AI, Azure OpenAI…) · ✖ training / perks only.

## For startups

<!-- AUTOGEN:startups:start -->
| Program | What you get | Funds LLM API? | Who qualifies |
|---|---|---|---|
| **[AWS Activate](https://aws.amazon.com/activate/)** | Up to $200k AWS credits (marketing max; self-serve tier far smaller); explicitly redeemable on Bedrock LLMs | ◐ via cloud | Any stage; top tiers need a referral from an approved AWS Activate provider |
| **[Microsoft for Startups Founders Hub](https://www.microsoft.com/en-us/startups)** | Up to $150k Azure credits (unlocked across tiers); covers Azure OpenAI | ◐ via cloud | Software startups; no stage/funding threshold; services-only firms excluded |
| **[Google for Startups Cloud](https://cloud.google.com/startup)** | Up to $200k GCP credits over 2 yr (up to $350k for AI-focused startups); covers Vertex AI / Gemini | ◐ via cloud | Equity-funded early-stage, no prior GCP credits; higher tiers via accelerator/VC |
| **[OVHcloud Startup](https://startup.ovhcloud.com/en/)** | €10k (Start) to €100k (Scale) cloud credits over 12 months + engineer time | ◐ via cloud | Early-stage / scale-up, by approval; EU (GPU-focused) |
| **[Anthropic — Claude for Startups](https://claude.com/programs/startups)** | Free Claude API credits + priority rate limits (amount not published) | ✅ LLM API | Equity-backed, founded &lt;4 yr ago, no prior Anthropic credits; first-party API only |
| **[OpenAI Startup Program](https://openai.com/business/why-openai/startups/)** | Free OpenAI API credits + rate-limit upgrades + SE time | ✅ LLM API | Backed by a partner-network VC; needs an investor referral code — not self-serve |
| **[Cohere Startup Program](https://cohere.com/blog/cohere-launches-startup-program)** | Reduced API pricing + support (discount % not on the official page) | ◐ via cloud | Early-stage AI startups; zero-equity; rolling applications |
| **[Together AI Startup Accelerator](https://www.together.ai/startup-accelerator)** | Up to $15k / $30k / $50k platform credits by funding tier (hosted open models + fine-tuning) | ✅ LLM API | AI-native, tiered by raise (&lt;$5M / $5–10M / &gt;$10M) |
| **[Fireworks AI Startup Program](https://fireworks.ai/startups)** | "Build credits" + higher rate limits (amount not published) | ✅ LLM API | Early-stage AI startups (apply) |
| **[Baseten AI Startup Program](https://www.baseten.co/startup-program/)** | Up to $27.5k credits ($25k dedicated + $2.5k Model APIs) + eng support | ✅ LLM API | Seed–Series A, &lt;5 yr, AI-central, new customer |
| **[Nebius for Startups](https://nebius.com/startups)** | $5k intro credits (~1,600 H100-hrs) + up to $100k discounts (GPU/compute) | ◐ via cloud | AI-native, &lt;7 yr, VC-backed, ~$5M+ raised; selective |
| **[Modal for Startups](https://modal.com/startups)** | "Thousands" of free GPU credits (serverless compute) | ◐ via cloud | Seed–B+, VC-backed or &gt;$1M raised, new customer |
| **[NVIDIA Inception](https://www.nvidia.com/en-us/startups/)** | Preferred hardware pricing, partner cloud credits, training, ecosystem access | ◐ via cloud | Incorporated, &lt;10 yr, ≥1 developer; pre-revenue OK |
| **[Scaleway Startup Program](https://www.scaleway.com/en/startup-program/)** | €1k / €9k / €36k credits by tier; covers Generative APIs | ◐ via cloud | &lt;5 yr, &lt;50 employees, going to market, not yet a client (EU) |
| **[Perplexity for Startups](https://www.perplexity.ai/startups)** | $5k Sonar API credits + 6 months Enterprise Pro (up to 50 seats) | ✅ LLM API | &lt;5 yr old, raised &lt;$20M, backed by an approved VC/accelerator partner |
| **[DigitalOcean Hatch](https://www.digitalocean.com/hatch)** | Up to ~$10k/mo credit limit over 12 mo (amount varies); base credits exclude GPU Droplets — select startups invited to apply for separate GPU credits | ◐ via cloud | AI-native startups that raised ≤$10M; business email required |
| **[Pinecone Startup Program](https://www.pinecone.io/startup-program/)** | Free Standard tier + Pro Support + usage credits (amount not published); vector DB / RAG infra, not model inference | ✖ perks only | &lt;100 employees, Series A or earlier; no VC referral required |
| **[Weaviate Startup Deal](https://weaviate.io/startup-deal)** | Discounted Weaviate Cloud access (terms not published); vector DB / RAG infra | ✖ perks only | Early-stage with a partner-program / VC affiliation (e.g. YC, Techstars) |
<!-- AUTOGEN:startups:end -->

## For students & researchers

<!-- AUTOGEN:research:start -->
| Program | Audience | What you get | Funds LLM API? | Who qualifies |
|---|---|---|---|---|
| **[Azure for Students](https://azure.microsoft.com/en-us/free/students/)** | Students | $100 Azure credit / 12 mo, no card; covers Azure OpenAI | ◐ via cloud | Full-time university students, verify with a school email |
| **[GitHub Student Developer Pack](https://education.github.com/pack)** | Students | GitHub Copilot access + $100 Azure credit + many dev tools | ◐ via cloud | Verified students (Azure offer 18+) |
| **[Cohere Labs — Catalyst Grants](https://cohere.com/research)** | Researchers | Free Cohere LLM API access for eligible projects | ✅ LLM API | Academic / civic / impact-focused AI projects |
| **[Google TPU Research Cloud](https://sites.research.google/trc/about/)** | Researchers | Free access to 1,000+ Cloud TPUs to train/run models | ◐ via cloud | ML researchers; apply; must share results publicly |
| **[AWS Cloud Credit for Research](https://aws.amazon.com/government-education/research-and-technical-computing/cloud-credit-for-research/)** | Both | Up to $5k (students) / uncapped (faculty) AWS credits; covers Bedrock | ◐ via cloud | Faculty, research staff or grad students at accredited institutions |
| **[Google Cloud Research Credits](https://edu.google.com/programs/credits/research/)** | Researchers | GCP credits (proposal-based); covers Vertex AI / Gemini; non-commercial | ◐ via cloud | Faculty / PhD / postdoc at accredited institutions |
| **[NVIDIA Academic Grant](https://www.nvidia.com/en-us/industries/higher-education-research/academic-grant-program/)** | Researchers | GPU-hours / hardware grants (e.g. up to 30k H100-hrs) | ◐ via cloud | Full-time faculty at PhD-granting institutions |
| **[Lambda Research Grants](https://lambda.ai/research)** | Researchers | Up to $5k Lambda GPU cloud credits | ◐ via cloud | Qualifying researchers; competitive |
| **[AWS Educate](https://aws.amazon.com/education/awseducate/)** | Students | Free training, labs and badges (no spendable credits) | ✖ perks only | Anyone 13+, email only, no card |
| **[Perplexity for Students](https://www.perplexity.ai/students)** | Students | Perplexity Pro for students — a free year unlocks when a campus reaches 500 signups; otherwise discounted Education Pro | ✖ perks only | Verified .edu students |
<!-- AUTOGEN:research:end -->

---

Looking for a key you can use *right now* with no application? That's the [main list](../README.md) — ![Verified](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/pacocartones/free-llm-api-hub/main/badge-verified.json) self-serve free APIs.

---

_[← Docs index](README.md) · [Main README](../README.md)_
