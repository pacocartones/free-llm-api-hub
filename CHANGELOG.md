# Changelog

Notable changes to the dataset and the project. Format based on [Keep a Changelog](https://keepachangelog.com/); the project follows [Semantic Versioning](https://semver.org/) for the **dataset schema** (`version` in `data/providers.json`).

- **Data changes** (a provider's limits/terms) are recorded here when notable; every change is also visible in the git history of `data/providers.json`.
- **Schema changes** (a new field, a changed meaning) bump the dataset version and are always recorded.

## [2.2.0] — 2026-07-30

Schema minor bump (added the `ocr` modality) and a big multimodal expansion — the dataset now spans free LLM **and adjacent AI-model** APIs (image, speech, embeddings, rerank, OCR, vision) while text/LLM stays the core.

### Added
- **Round 2 discovery (15 new verified providers), by category:**
  - Image: **Pollinations.ai** (no-signup), **Runware** ($2, no card).
  - Embeddings/rerank: **Pinecone Inference** (5M tokens/mo), **Twelve Labs** (multimodal embeddings).
  - OCR/document: **OCR.space** (25k/mo), **LlamaParse** (~10k pages/mo), **Nanonets** ($50).
  - Vision: **Moondream** (OpenAI-compatible).
  - Speech: **Speechmatics** (50 hrs/mo STT), **Speechify**, **Hume AI**, **Unreal Speech**, **ElevenLabs**.
  - Plus **Ollama Cloud** and **AI Horde** (from aggregator mining). 47 providers, 100% verified.
- New `ocr` modality in the schema/validator.

### Data (Phase 1 backfill)
- Filled `best_for` for every entry; confirmed more tri-states against official docs (Cohere & IBM watsonx `openai_compatible`, HuggingFace & Alibaba `card_required: false`, NLP Cloud & Nebius policies). Unpublished fields left `null` rather than guessed.
- **SambaNova** corrected to a rate-limited ongoing free tier (its "$5 / 3-month" trial is no longer documented).
- **Cliff mitigation:** re-verified entries to stagger the 2026-07-11 cluster; `staleness.mjs` now warns when a same-date cluster nears the 90-day SLA.
- Held for review (not added): Chinese real-name-ID LLMs (iFlytek, Tencent Hunyuan, Baidu, ByteDance, StepFun), plus medium-confidence or card-gated-cloud offers (Google/Azure/IBM cloud tiers, Civitai, Roboflow, Cartesia, LMNT, etc.).

### Site
- **Full visual redesign** into one cohesive system (shared `styles.css`) across the landing page and every generated page: sticky header with logo + nav, a redesigned hero (hub logo + a live GitHub star count right below it), and a structured footer. Light/dark theme toggle (persisted).
- **Per-provider detail pages** (`/p/<slug>.html`) generated from the data — free tier, limits, the catch, modalities, a copy-ready quickstart, and links — a large, indexable SEO surface. Linked from the explorer and the sitemap.
- **Copy-ready OpenAI snippet** button per provider in the explorer; **click-to-copy** base URLs.
- **Shareable filter state** — the explorer reflects search/category/flags in the URL (`?cat=ongoing&nocard=1`), so a filtered view is a link.
- **Embeddable per-provider badges** (`/badges/<slug>.json`, shields endpoint) with a copy-paste snippet on each detail page.
- **Social preview image** (`og.svg`) plus OG/Twitter tags; sitemap now covers provider pages.

## [2.1.0] — 2026-07-30

Dataset schema minor bump (added `openai_base_url`), a verification sweep, and broader adjacent coverage.

### Added
- **`openai_base_url`** field — the drop-in OpenAI-compatible base URL, confirmed against official docs for **18** providers (via a parallel research + spot-check pass).
- **Runnable quickstart** on the OpenAI-compatible collection (Python + curl, using a real base URL and free model), plus an "OpenAI base URL" column on that page.
- **Six new verified providers**, broadening adjacent coverage: **Jina AI** and **Mixedbread** (embeddings/rerank), **Deepgram** ($200, speech) and **AssemblyAI** ($50, speech + OpenAI-compatible LLM gateway), **Clarifai**, and **Arli AI**.
- SEO: generated **`sitemap.xml`**, a static **`robots.txt`**, and **JSON-LD `Dataset`** structured data on the site.
- Interactive explorer now shows each provider's **modalities** and a **click-to-copy OpenAI base URL**; search matches base URLs and modalities.
- Validator enforces `openai_base_url` shape and that it's only set when `openai_compatible` isn't `false`.

### Removed
- **Upstage**, **Inference.net**, **Hyperbolic** — a deep re-verification confirmed none offer genuinely free *API* access (Solar API is pay-as-you-go; Inference.net's free tier is gateway-only, not model tokens; Hyperbolic requires a $5 minimum deposit). Removing them makes the list **100% verified** — trust over coverage.

### Changed
- TL;DR decision table gains embeddings, rerank and speech rows; the "biggest credit" row now reflects Deepgram's $200.

## [2.0.1] — 2026-07-30

### Added
- Weekly maintenance automation (`maintenance.yml` + `scripts/staleness.mjs`): badge refresh, link re-check, and a self-updating re-verification worklist issue, Mondays ~10:00 Madrid. Documented in [docs/update-playbook.md](docs/update-playbook.md).
- Six data-driven [collections](collections/README.md) (no-card, no-phone, commercial-use, OpenAI-compatible, always-free, multimodal) as repo markdown + live SEO pages.
- [docs/self-hosting-on-free-compute.md](docs/self-hosting-on-free-compute.md): an adjacent, clearly-separated companion reference salvaging the verified free-GPU/compute research from the retired `free-gpu-cloud-credits` project — kept out of the core dataset to protect focus.

### Data
- Re-verified against official docs. **Vercel AI Gateway** is now confirmed (a free tier with a monthly credit; the "$5/month" figure circulating in community posts is *not* in Vercel's own docs, so it's stated honestly instead). 25/28 entries now verified.
- **Upstage** and **Inference.net** corrected: the trial credits previously attributed to them couldn't be found on the providers' current pricing pages. Both remain flagged ⚠️ with exactly what was found instead.
- **Hyperbolic** remains ⚠️ — pricing not confirmable on public pages.

### Changed
- Link-checker no longer flags `401/403/405/429` as broken — those mean the server is alive but refusing the bot (fixes a recurring NLP Cloud false positive).

## [2.0.0] — 2026-07-30

Ground-up redesign into a data-first, continuously-verified open dataset.

### Added
- **Canonical dataset** at `data/providers.json`, validated against `data/schema.json` in CI.
- **Build pipeline** (`scripts/build.mjs`): README tables, the freshness badge, and CSV/YAML exports are now *generated* from the data — no more hand-mirroring.
- **Dataset validator** (`scripts/validate.mjs`): rejects any `verified: true` entry missing a date or a real source link.
- New builder-first fields: `slug`, `free_type`, `openai_compatible`, `modalities`, `expires`, `best_for`.
- Portable exports: `data/providers.csv`, `data/providers.yaml`.
- Redesigned interactive site (landing + explorer) with live stats and an OpenAI-compatible filter.
- Credibility docs: methodology, inclusion criteria, comparison dimensions, roadmap, governance, security, code of conduct, and a `CITATION.cff`.
- New-provider issue form and a pull-request template.

### Changed
- Split CI into `verify.yml` (validate + link-check + weekly badge refresh) and `pages.yml` (site deploy via GitHub Actions).
- Link-checking now reads `docs_url` straight from the dataset instead of scraping the README.
- README rebuilt around the trust story, with a "pick by what you actually need" decision table.
- Resolved a prior inconsistency: Groq is marked `phone_required: true`, matching its signup flow.

### Migration
- `providers.json` moved from the repo root to `data/providers.json`; the site moved to `site/`.
- The freshness badge stays at `badge-freshness.json` (root), so existing embed URLs keep working.

## [1.0.0]

- Initial curated list: README tables, a root `providers.json`, an interactive explorer, a freshness badge, and a weekly link-check workflow.
