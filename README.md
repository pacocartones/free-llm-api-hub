<div align="center">

<img src="assets/logo-full.svg" alt="Free LLM API Hub" width="240">

**A continuously-verified dataset of free LLM & AI-model APIs you can build on.**

Free LLM APIs plus adjacent model APIs — image, speech, embeddings, rerank and OCR. Free tiers, trial credits and no-cost quotas, every entry dated, sourced, and machine-readable.
No hype, no dead links, no "generous limits" hand-waving. Just what's actually free, and the fine print that bites.

<img src="assets/demo.svg" alt="Terminal demo: curl freellmapihub.com/api/v1/no-card.json returns Google Gemini, Groq, Cloudflare Workers AI, OpenRouter and Mistral AI" width="740">

[![Verify](https://github.com/pacocartones/free-llm-api-hub/actions/workflows/verify.yml/badge.svg)](https://github.com/pacocartones/free-llm-api-hub/actions/workflows/verify.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/pacocartones/free-llm-api-hub/badge)](https://scorecard.dev/viewer/?uri=github.com/pacocartones/free-llm-api-hub)
[![Freshness](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/pacocartones/free-llm-api-hub/main/badge-freshness.json)](#how-verification-works)
[![Verified providers](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/pacocartones/free-llm-api-hub/main/badge-verified.json)](docs/methodology.md)
[![Website](https://img.shields.io/badge/explorer-freellmapihub.com-0b7285.svg)](https://freellmapihub.com/)
[![Dataset: JSON](https://img.shields.io/badge/dataset-JSON%20%2B%20schema-blue.svg)](data/providers.json)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Contributors](https://img.shields.io/github/contributors/pacocartones/free-llm-api-hub)](https://github.com/pacocartones/free-llm-api-hub/graphs/contributors)
[![Hacktoberfest](https://img.shields.io/badge/contribute-good%20first%20issues-9c4668.svg)](https://github.com/pacocartones/free-llm-api-hub/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)

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
| **Image generation** | 11 | Cloudflare Workers AI, HuggingFace, OVHcloud AI Endpoints |
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
| **Permanently free, no trial clock** | [Z.ai (GLM)](https://freellmapihub.com/p/zai-glm), or [SiliconFlow](https://freellmapihub.com/p/siliconflow) if you can pass China real-name verification | Several models priced at $0 indefinitely, not just for a trial window |
| **An OpenAI-compatible endpoint** | [Groq](https://freellmapihub.com/p/groq), [OpenRouter](https://freellmapihub.com/p/openrouter), [Cloudflare Workers AI](https://freellmapihub.com/p/cloudflare-workers-ai) | Point the OpenAI SDK at a new `base_url` and you're done |
| **EU / data-sovereignty hosting** | [OVHcloud](https://freellmapihub.com/p/ovhcloud-ai-endpoints) or [Scaleway](https://freellmapihub.com/p/scaleway) | French/EU providers; OVHcloud even has an anonymous, no-account tier |
| **Free embeddings & rerank** | [Jina AI](https://freellmapihub.com/p/jina-ai) or [Cohere](https://freellmapihub.com/p/cohere) | 10M free tokens (Jina, OpenAI-compatible) or 1,000 calls/mo (Cohere) |
| **Free speech-to-text / TTS** | [Deepgram](https://freellmapihub.com/p/deepgram) or [AssemblyAI](https://freellmapihub.com/p/assemblyai) | $200 / $50 in no-card credit for Whisper-class STT and TTS |
| **A bigger one-time credit** | [Deepgram](https://freellmapihub.com/p/deepgram) ($200, speech) or [AI21 Labs](https://freellmapihub.com/p/ai21) ($10 for 3 months, LLMs) | Large one-time credits that start without a card |
| **Something safe to ship commercially** | [Cloudflare Workers AI](https://freellmapihub.com/p/cloudflare-workers-ai) or [Groq](https://freellmapihub.com/p/groq) | Don't restrict the free tier to personal/eval use, the way Cohere and NVIDIA do |

Starting points, not guarantees — read the full profile before you build on it.

## Browse by need

Focused, always-current collections — each is generated from the dataset and has a live web page too.

<!-- AUTOGEN:collections:start -->
- **[Free LLM APIs with no credit card](collections/no-credit-card.md)** (56) — start without a payment method · [live page ↗](https://freellmapihub.com/collections/no-credit-card)
- **[Free LLM APIs with no phone verification](collections/no-phone.md)** (22) — no SMS/phone verification · [live page ↗](https://freellmapihub.com/collections/no-phone)
- **[Free LLM APIs for commercial use](collections/commercial-use.md)** (25) — safe to ship, not eval-only · [live page ↗](https://freellmapihub.com/collections/commercial-use)
- **[OpenAI-compatible free LLM APIs](collections/openai-compatible.md)** (36) — drop-in OpenAI SDK swap · [live page ↗](https://freellmapihub.com/collections/openai-compatible)
- **[Permanently free LLM APIs](collections/always-free.md)** (5) — $0 models, no trial clock · [live page ↗](https://freellmapihub.com/collections/always-free)
- **[Free multimodal LLM APIs](collections/multimodal.md)** (52) — vision, audio, embeddings · [live page ↗](https://freellmapihub.com/collections/multimodal)
- **[Free LLM APIs that say they do not train on your prompts](collections/no-training.md)** (13) — says it does not train on your prompts (some only without opt-in) · [live page ↗](https://freellmapihub.com/collections/no-training)
<!-- AUTOGEN:collections:end -->

Every provider also has its own page with the full details and a copy-ready quickstart — e.g. [Groq](https://freellmapihub.com/p/groq), [Deepgram](https://freellmapihub.com/p/deepgram), [Jina AI](https://freellmapihub.com/p/jina-ai).

## Contents

- [What's covered](#whats-covered) — the categories, by the numbers
- [Browse by need](#browse-by-need) — curated collections by constraint
- [The best free LLM APIs](#the-best-free-llm-apis) — our top 10 by score
- [Notably NOT free](#notably-not-free) — so this list doesn't waste your time
- [How verification works](#how-verification-works) — the trust engine
- [How this project is maintained](#how-this-project-is-maintained) — agents under human oversight
- [Use the data](#use-the-data) — dataset, exports, badge
- [Contributing](#contributing) · [Project docs](#project-docs)

---

## The best free LLM APIs

Our top 10 by score — computed from the [<!-- FIG:verified -->67<!-- /FIG --> verified providers](data/providers.json) every time the site is built, never hand-ordered and never padded to ten. The three best form the podium. Being a partner adds nothing to the score. Every row links to its full verified profile: free tier, rate limits and the catch are checked against the provider's own docs. The podium and the method are on the [**/best page ↗**](https://freellmapihub.com/best/) and in [how the score works ↗](https://freellmapihub.com/best/methodology/).

<sub>💳 no card · 📵 no phone · 📱 phone required · 🏢 commercial OK · 🔬 eval only · 🔌 OpenAI-compatible</sub>

<!-- AUTOGEN:best:start -->
| # | Provider | Score | What's free | The catch | Verified |
|---|---|---|---|---|---|
| 1 | **[OpenRouter](https://openrouter.ai/docs/api-reference/limits)**<br><sub>💳 no card · 📵 no phone · 🏢 commercial OK · 🔌 OpenAI-compat</sub> | 67.2<br><sub>5 of 6 inputs</sub> | A rotating set of models with a :free suffix (16 on 2026-10-08; count fluctuates), single API across many providers | ToS (Jul 2026) prohibits reselling API access or building a competing service — platform-wide, not just the free models; per-model terms still apply. OpenRouter says it does not use inputs or outputs for training, but some upstream model providers may; an account setting (separate for free models) can exclude providers that train (openrouter.ai/privacy and docs/features/privacy-and-logging, read 2026-10-13). | ✅ 2026-10-08 |
| 2 | **[Groq](https://console.groq.com/docs/rate-limits)**<br><sub>💳 no card · 📱 phone · 🏢 commercial OK · 🔌 OpenAI-compat</sub> | 64.3<br><sub>5 of 6 inputs</sub> | Open-weight models (GPT-OSS, Qwen) plus Whisper, no credit card required | Limits apply at the organization level, not per API key. Phone verification required at signup | ✅ 2026-10-08 |
| 3 | **[SambaNova Cloud](https://cloud.sambanova.ai/plans)**<br><sub>🏢 commercial OK · 🔌 OpenAI-compat</sub> | 58.8<br><sub>4 of 6 inputs</sub> | Rate-limited free tier (applies when no payment method is linked) across the models listed in the Free Tier table | Free Tier applies when no payment method is linked to the account; SambaCloud ToS grants a commercial license (no evaluation-only clause). The previously-listed "$5 / 3 months" trial could not be re-confirmed on official pages (2026-07-30). card_required is unconfirmed because SambaNova's own pages disagree (read 2026-10-08): the rate-limits doc (https://docs.sambanova.ai/docs/en/models/rate-limits) says "Free Tier: Applied when there is no payment method linked with your account", while the plans page (https://cloud.sambanova.ai/plans) says "Add a payment method and purchase credits to run your first requests". Settling it needs a real signup, which has not been done. The rate-limits doc (read 2026-10-09) also lists two preview models on the Free Tier at the same 20 RPM / 20 RPD / 200,000 TPD (DeepSeek-V3.2, gemma-4-31B-it), described there as having limited capacity and removable at short notice; they are not in models_free. | ✅ 2026-10-09 |
| 4 | **[Google Gemini API (AI Studio)](https://ai.google.dev/gemini-api/docs/rate-limits)**<br><sub>💳 no card · 📵 no phone · 🏢 commercial OK · 🔌 OpenAI-compat</sub> | 57.5<br><sub>4 of 6 inputs</sub> | Gemini 2.5 Flash, 2.5 Flash-Lite, 2.5 Pro (limited), embeddings, TTS models | Free-tier prompts/outputs may be used by Google to improve its products outside the UK/CH/EEA/EU. Since the 2026-03-23 terms, only Paid Services may serve API clients to end users in the EEA/CH/UK | ✅ 2026-10-08 |
| 5 | **[Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/platform/pricing/)**<br><sub>💳 no card · 📵 no phone · 🏢 commercial OK · 🔌 OpenAI-compat</sub> | 52.0<br><sub>4 of 6 inputs</sub> | 10,000 Neurons/day, all account plans | Resets daily at 00:00 UTC; overage on a Workers Paid plan bills at $0.011/1,000 Neurons. A few models (e.g. Kimi K2.6/K2.7-code, GLM-5.2) now require a Workers Paid plan | ✅ 2026-10-08 |
| 6 | **[Z.ai (Zhipu AI / GLM)](https://docs.z.ai/guides/overview/pricing)**<br><sub>💳 no card · 📵 no phone · 🏢 commercial OK · 🔌 OpenAI-compat</sub> | 52.0<br><sub>4 of 6 inputs</sub> | GLM-4.5-Flash, GLM-4.7-Flash (text), and GLM-4.6V-Flash (vision) are officially listed as $0 cost (input, cached input, and output) on a permanent basis | Terms of Use prohibit using Z.ai to "develop, train, or enhance any algorithms, models, or technologies that directly or indirectly compete with us" — otherwise general use, including commercial, isn't restricted | ✅ 2026-10-08 |
| 7 | **[ModelScope (API-Inference)](https://www.modelscope.cn/docs/model-service/API-Inference/intro)**<br><sub>💳 no card · 🔬 eval only · 🔌 OpenAI-compat</sub> | 51.4<br><sub>4 of 6 inputs</sub> | Free API-Inference calls paid with daily 'Magicubes': 200/day for signing in + 50/day after linking an Alibaba Cloud account (do not roll over); calls cost ~0.5 / 1 / 2 Magicubes for lightweight / standard / flagship models | Alibaba's model hub — a different product from Alibaba Model Studio. Requires a ModelScope account bound to an Alibaba Cloud account with real-name (ID) verification — a practical barrier for non-China users. Explicitly non-commercial ("for developers to experience"). No card. | ✅ 2026-10-08 |
| 8 | **[Cohere](https://docs.cohere.com/docs/rate-limits)**<br><sub>💳 no card · 📵 no phone · 🔬 eval only · 🔌 OpenAI-compat</sub> | 46.1<br><sub>5 of 6 inputs</sub> | Trial (evaluation) API keys covering chat, embed and rerank | Explicitly for evaluation only — Cohere's terms prohibit production/commercial use on a trial key | ✅ 2026-10-08 |
<!-- AUTOGEN:best:end -->

That's the shortlist. The full dataset — all <!-- FIG:providers -->68<!-- /FIG --> providers, every ongoing tier and one-time credit, filterable and machine-readable — lives in [**data/providers.json**](data/providers.json) and the [interactive explorer ↗](https://freellmapihub.com/).

## Notably NOT free

Worth saying plainly. As of the last verification pass, **OpenAI, Anthropic and xAI do not offer an ongoing free API tier.** Several providers people *assume* are free — **Together AI, DeepInfra, Perplexity's API, Replicate, Featherless AI** — currently require a card or prepayment before any API use, per their own docs. Some have handed out small one-time trial credits at various points, but that's changed repeatedly; check each provider's billing page before assuming anything.

For genuinely free access to strong models, your best bets here are **Gemini** (frontier-class) and the free open-weight models on **Groq, OpenRouter, Cloudflare and Z.ai** (SiliconFlow's free models are on its China platform and need real-name verification).

Retired or removed after re-verification: **GitHub Models** (fully retired by GitHub on 2026-07-30 — playground, catalog and inference API shut down for all customers), **Cerebras** (now listed as a trial credit: the ongoing free tier became a payment-method-gated $5/30-day trial), **Inference.net** (the free tier is gateway/observability only, not free model tokens), and **Hyperbolic** (requires a $5 minimum deposit before any use).

## How verification works

Free-tier terms move fast, and most lists go stale silently. This one is built to surface drift instead of hiding it. Full details in **[docs/methodology.md](docs/methodology.md)**; the short version:

1. **Every verified entry carries a `last_verified` date** and a link to the provider's *own* docs. No date + primary source → it ships as ⚠️ unverified, not as fact.
2. **A local re-verification pass** ([docs/update-playbook.md](docs/update-playbook.md)) re-checks each provider's own docs on a rolling basis — a dead or changed source is an early warning that a provider changed something.
3. **The freshness badge is computed from the data,** not written by hand: it is graded on the **oldest** verification in the list, straight from [`providers.json`](data/providers.json). Green while every entry is under 60 days old, amber once any entry is due for re-verification, red once any entry breaches the 90-day SLA. One forgotten row is enough to move it — which is the point.
4. **The dataset is schema-validated in CI.** A verified entry that's missing its date or source link fails the build — the honesty rule is enforced by machine, not by good intentions.
5. **Reporting a stale entry takes under a minute** via a [structured form](../../issues/new?template=inaccuracy.yml) that asks for the provider, what changed and a source link.

What "verified" covers and where its limits are: [docs/methodology.md](docs/methodology.md) · what earns a spot on the list: [docs/inclusion-criteria.md](docs/inclusion-criteria.md).

## How this project is maintained

Much of the routine maintenance of this repository is done by AI agents working under human oversight: they re-check provider sources, prepare data updates, triage issues and draft code. Every change still goes through a pull request, a human maintainer reviews it and is responsible for every merge, and every data change carries a link to the provider's own page and the date it was checked. Commit messages carry no AI signature or trailer; this section is where we say it.

## Use the data

This is meant to be consumed by machines as much as by humans.

- **[`data/providers.json`](data/providers.json)** — canonical dataset, validated against [`data/schema.json`](data/schema.json). Every field explained in [docs/comparison-dimensions.md](docs/comparison-dimensions.md).
- **Static JSON API** — [the public JSON dataset](https://freellmapihub.com/providers.json) and the versioned [JSON API](https://freellmapihub.com/api/) are generated from the canonical dataset for programmatic use.

```bash
# Every ongoing free tier that needs neither a card nor a phone number:
curl -s https://raw.githubusercontent.com/pacocartones/free-llm-api-hub/main/data/providers.json \
  | jq -r '.providers[]
      | select(.category=="ongoing" and .card_required==false and .phone_required==false)
      | .name'
```

**Pin a snapshot for reproducible builds.** `main` moves; depend on an immutable tag instead:

```bash
curl -s https://raw.githubusercontent.com/pacocartones/free-llm-api-hub/v2.9.1/data/providers.json
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

Self-contained (inline styles, no CSS conflicts). All attributes are optional: `data-count` (1-20, default 6), `data-modality` (`text`, `audio`, `embeddings`, `image`, `vision`, `ocr`, `rerank`), `data-category` (`ongoing` or `trial`; default both), `data-sort` (an explorer sort key - `recommended` (default), `name`, `category`, `free_tier`, `notes`, `verified`).

**Follow changes** — [updates page](https://freellmapihub.com/updates) or the [RSS feed](https://freellmapihub.com/feed.xml).

## Contributing

Found an outdated limit, a dead link, or a provider that belongs here? You'll keep this useful for everyone.

- **Fastest:** the [structured issue form](../../issues/new?template=inaccuracy.yml) — provider, what changed, a source link.
- **Or open a PR** editing only [`data/providers.json`](data/providers.json). Run `npm run build` to regenerate the README and badge, and `npm test` to validate. Never hand-edit the tables — they're generated.

Full guidelines, including what counts as an acceptable source: **[CONTRIBUTING.md](CONTRIBUTING.md)**.

### AI-assisted contributions are welcome

Use AI tools if they help you — we do too. We ask for good judgement: understand and test what you send, and check every fact at its source. See [AI_POLICY.md](AI_POLICY.md).

## 🙋 Contributions wanted right now

This dataset is only as good as it is trustworthy, and right now there are `null` fields (= "nobody has confirmed it yet") waiting for a source. Three concrete ways to help, from smallest to biggest:

1. Grab a [*good first issue*](https://github.com/pacocartones/free-llm-api-hub/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) and confirm **a single fact** about one provider (e.g. *"does Cerebras require a phone?"*) from its official site, with today's date. It's a one-line diff in [`data/providers.json`](data/providers.json).
2. Pick a provider from the umbrella issue [**confirm `phone_required`**](https://github.com/pacocartones/free-llm-api-hub/issues/7).
3. Do the same for [**confirm `commercial_ok`**](https://github.com/pacocartones/free-llm-api-hub/issues/8), reading the provider's terms.

The rule is simple and honest: primary source (the provider's own docs) + `last_verified` with a real date, and if you're not sure, leave it `null` and say so. Comment on an issue to claim it and a maintainer will assign it to you.

**October:** help us verify, in the open, which AI APIs are really free. Contributions are welcome all year; Hacktoberfest 2026 no longer rewards pull requests, so none is promised here. One sourced fact beats ten cosmetic edits; see [CONTRIBUTING.md](CONTRIBUTING.md#hacktoberfest).

## Contributors

Thanks to everyone who has verified an entry, fixed a link, or improved the project:

<!-- AUTOGEN:contributors:start -->
- [Jhansi Oruganti](https://github.com/JhansiOruganti-43) — data: confirm Novita AI free tier is not commercial-use allowed ([PR #27](https://github.com/pacocartones/free-llm-api-hub/pull/27))
- [Victoria Odalo](https://github.com/OdaloV) — docs: verify Clarifai commercial_ok status ([PR #112](https://github.com/pacocartones/free-llm-api-hub/pull/112))
- [MikeGatsby](https://github.com/MikeGatsby) — data: verify Datalab hosted-API commercial-use terms (no explicit statement found) ([PR #117](https://github.com/pacocartones/free-llm-api-hub/pull/117))
- [bcabreraike-cmyk](https://github.com/bcabreraike-cmyk) — docs: explain paced re-verification batches ([PR #169](https://github.com/pacocartones/free-llm-api-hub/pull/169))
- [Swarnabha Nandi](https://github.com/Swarnabha753) — fix: show clear button when sort is changed ([PR #183](https://github.com/pacocartones/free-llm-api-hub/pull/183))
- [Manan Bharti](https://github.com/mananbharti) — test: check serializer ORDER against the provider schema ([PR #201](https://github.com/pacocartones/free-llm-api-hub/pull/201))
- [Piyush](https://github.com/piyusshhjangid) — data: verify Datalab phone requirement and free-tier rate limit ([PR #198](https://github.com/pacocartones/free-llm-api-hub/pull/198))
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
| [AI policy](AI_POLICY.md) | AI-assisted contributions are welcome; what we ask in return |
| [Changelog](CHANGELOG.md) | What changed, when |
| [Governance](GOVERNANCE.md) | How decisions get made |
| [Security](SECURITY.md) · [Code of Conduct](CODE_OF_CONDUCT.md) | Reporting & community norms |

## License

[MIT](LICENSE) — free to reuse, fork, and adapt, including the dataset. A link back is appreciated but not required.

