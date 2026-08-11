# Changelog

Notable changes to the dataset and the project. Format based on [Keep a Changelog](https://keepachangelog.com/); the project follows [Semantic Versioning](https://semver.org/) for the **dataset schema** (`version` in `data/providers.json`).

- **Data changes** (a provider's limits/terms) are recorded here when notable; every change is also visible in the git history of `data/providers.json`.
- **Schema changes** (a new field, a changed meaning) bump the dataset version and are always recorded.

## [Unreleased]

## [2.8.0] — 2026-08-11

First external contribution, and the plumbing that lets the project live past one person: Novita AI's commercial-use terms resolved by the first outside pull request, a computed contributor count on the README, and a CI pipeline that regenerates derived files without a maintainer in the loop.

### Data
- **Novita AI — `commercial_ok: false` (first external contribution).** The Novita Terms of Service clause covering commercial exploitation was found, quoted in `notes` and dated (verified 2026-08-10): the free tier is not commercial-use allowed. Sourced and submitted by the project's first external contributor, [@JhansiOruganti-43](https://github.com/JhansiOruganti-43) — see [#27](https://github.com/pacocartones/free-llm-api-hub/pull/27).

### Fixed
- **The freshness badge can now actually decay.** It was graded on the share of entries inside the 90-day SLA. Because the list is re-verified in sweeps, that share could not leave bright green until ~21 of 67 entries had gone overdue — roughly four months of total silence. It reported whether the project was alive, not whether the data was fresh. The badge is now graded on the **oldest verification in the list**, in the same three buckets the re-verification worklist already prints: green under 60 days, amber past 60 (due soon), red past 90 (SLA breached). One forgotten row moves it. Message goes from `67/67 verified <90d` to `67/67 verified · oldest 27d`, so the coverage number is still there.
- **The per-provider embed badges (`/badges/<slug>.json`) decay too.** They were bright green for any verified entry regardless of age — an embed placed in someone else's README stayed green forever. Same colour rule as the repo badge now.
- **The README stopped hiding confirmed card walls.** `card_required: true` rendered no pill in the README tables while the provider pages and the explorer both showed one, so on the project's most-read surface a confirmed payment gate looked identical to an unconfirmed one. Affected Cerebras, IBM watsonx.ai, Nebius, NLP Cloud and OVHcloud AI Endpoints — four of the five otherwise showing an all-positive flag row. Now rendered as `💳 card required`.
- **`null` no longer ranks as a confirmed "no" in the "Recommended" order.** `card_required: true` and `phone_required: true` scored zero, exactly like `null`, so a provider *confirmed* to gate signup behind a card sorted level with one nobody had checked. Both flags are now symmetric (`false` +n, `true` −n, `null` 0) like `commercial_ok` already was, and `null` sits between the two.

### Changed
- **One definition of the freshness SLA.** `SLA_DAYS`/`DUE_SOON_DAYS` moved into [`scripts/lib/rules.mjs`](scripts/lib/rules.mjs); `build.mjs` and `staleness.mjs` import them instead of each carrying a copy. The badge and the worklist can no longer disagree about what "overdue" means.
- **Nine new pipeline tests** covering the badge's three colour states, its decay over time, the coverage floor, the internal consistency of the shipped badge file, the README card pill, and the tri-state ranking rule.
- **The external-contributor count has one home and is covered by tests.** The counter moved into [`scripts/lib/contributors.mjs`](scripts/lib/contributors.mjs) (same single-source pattern as `lib/history.mjs`); three new pipeline tests pin the rule (maintainer + bots excluded, dedupe by email) and that the README stats line matches the real, stable count — [#107](https://github.com/pacocartones/free-llm-api-hub/pull/107).

### Docs
- **README: `## Contributors` + a computed contributor count.** The generated stats line now ends with `**1** external contributor`, mined from the git history of `data/providers.json` (humans other than the maintainer and bots) — social proof computed, not claimed — plus a Contributors section crediting the first PR. [#102](https://github.com/pacocartones/free-llm-api-hub/pull/102)
- **CONTRIBUTING: "Your first PR from a fork: the checks may wait".** First-time contributors now know their workflow runs are held for maintainer approval and that a comment on the PR unblocks them — the exact friction the first external PR hit. [#102](https://github.com/pacocartones/free-llm-api-hub/pull/102)

### Project
- **OG images auto-heal on data pull requests.** A new workflow regenerates `site/og/` from the PR's `data/providers.json` and pushes it back to the PR branch, so the "Dataset integrity" check passes without a maintainer in the loop. Scripts run from the base branch, never the PR head — a data PR can't execute its own code with write permissions. [#103](https://github.com/pacocartones/free-llm-api-hub/pull/103)
- **The regenerate bot delivers via PR instead of a direct push.** `main` requires the "Dataset integrity" status check, which a bot commit can't report before the push it would trigger — branch protection silently rejected its direct pushes and `main`'s derived files drifted. The bot now opens `bot/regenerate` → `main`, running the same checks as every other change. [#103](https://github.com/pacocartones/free-llm-api-hub/pull/103), [#104](https://github.com/pacocartones/free-llm-api-hub/pull/104), [#106](https://github.com/pacocartones/free-llm-api-hub/pull/106)
- **CodeRabbit quiet on issues.** Issue enrichment (auto "Related PRs" / plan comments on new issues) disabled; PR reviews stay on. [#103](https://github.com/pacocartones/free-llm-api-hub/pull/103)

### Contributors
- **First external contribution** — [@JhansiOruganti-43](https://github.com/JhansiOruganti-43) confirmed Novita AI's free tier is not commercial-use allowed (`commercial_ok: false`, source clause quoted in `notes`; [#27](https://github.com/pacocartones/free-llm-api-hub/pull/27)). The README Contributors section and the computed contributor count above exist because of it.

## [2.7.0] — 2026-08-02

First paced re-verification cycle: the oldest six entries re-checked against their providers' own docs — and it caught a retirement.

### Data
- **GitHub Models removed → 67 providers.** GitHub fully retired the service on 2026-07-30 (playground, catalog, inference API and BYOK shut down for all customers). Recorded in the README's "Notably NOT free" section.
- **Cerebras moved to trial credits.** The ongoing free tier is gone for new accounts: it's now a $5 credit that requires a verified payment method to activate and expires 30 days after grant. `card_required: true`, `commercial_ok: true` (per its ToS) — two long-standing `null`s resolved.
- **Google Gemini** — rate-limit ranges corrected to the current docs (5-30 RPM, 15-1,000 RPD depending on model); the 2026-03-23 terms clause restricting free-tier API clients with EEA/CH/UK end users added to the catch.
- **Groq** — the `qwen3-32b` example replaced by its successor `qwen/qwen3.6-27b` (30 RPM / 1K RPD / 8K TPM / 200K TPD).
- **OpenRouter** — the "20+ free models" claim corrected: 14 `:free` variants today (volatile by nature); ToS reference updated to the 2026-07-27 revision (resale/competing-service ban is platform-wide).
- **Cloudflare Workers AI** — re-confirmed unchanged; catch now notes the few models that require a Workers Paid plan (Kimi K2.6/K2.7-code, GLM-5.2).

### Project
- **`probe.yml` — the live probe runs in CI.** Weekly `--auth-only` pass over every provider whose key exists as a repo secret (any subset works; missing keys are skipped), committing `last_probed`/`probe_status`. No VPS or external secrets manager needed.
- **Paced re-verification.** `staleness.mjs` now emits a **weekly batch** — the oldest verifications, sized to keep the 90-day SLA green without an end-of-quarter cliff — on top of the overdue/due-soon lists.
- **[docs/architecture.md](docs/architecture.md) published** — the pipeline map for code contributors, linked from CONTRIBUTING.
- **CI gap closed:** pull requests touching `site/**` now trigger `verify.yml` (previously deployable with no checks).
- **Release tags backfilled:** `v2.3.0`, `v2.4.0`.

## [2.6.0] — 2026-07-31

Custom domain, a machine-readable API surface, per-provider provenance, and a UI pass driven by user feedback.

### Data
- **7 more verified providers → 68.** poolside (coding LLMs, OpenAI-compatible), Upstage (Solar LLM + document OCR, $10 no-card credit), Veryfi (free-forever document OCR), Voicegain ($50 no-card STT), Smallest.ai ($10 TTS + voice cloning), Retell AI ($10 voice agents), Datalab/Marker-Surya ($5 OCR). Held for lack of a citable/quantifiable free tier: MiniMax, Replicate.
- **Per-provider change history** mined from the git log of `providers.json`, on each `/p/` page and at `/api/v1/history.json`.

### Site
- **Custom domain — [freellmapihub.com](https://freellmapihub.com/).** All absolute URLs (canonical, OG, sitemap, JSON-LD, RSS) now point at the apex domain; `site/CNAME` added for GitHub Pages.
- **Static JSON API** ([`/api/v1/`](https://freellmapihub.com/api/)) — the dataset as versioned, machine-readable JSON at stable URLs: full providers + programs, plus pre-filtered slices by category, constraint and modality. No server, no auth, no rate limits, CORS-open.
- **`llms.txt` + `llms-full.txt`** ([llmstxt.org](https://llmstxt.org/)) so AI agents can consume the hub directly — a concise index and the full provider list expanded as markdown.
- **UI redesign (from user feedback).** Navbar: "Home" + a per-tab icon. Home explorer **table rebuilt** — name-only left column linking to each provider's card, access flags as compact icons, no external docs links or base-URL clutter, no Export buttons, filters + quick-picks merged into one row, bigger headers, wider table. **Footer** redesigned with the contact email under Privacy · Terms. **Provider cards**: centered header + a "Visit website" button (distinct green) alongside "Official docs". A terminal-style animated hero was tried and reverted — the plain heading with a blinking caret reads better.
- **Animated terminal-demo SVG** in the README (`assets/demo.svg`) — types a live `curl` to `/api/v1`.
- **Per-provider social images** (61) — `/p/` pages no longer fall back to the generic `og.png`.

## [2.5.0] — 2026-07-31

### Added
- **`added` provenance field.** Optional `YYYY-MM-DD` date recording when a provider first entered the dataset; drives the client-side "new" marker on the explorer and an "Added to the hub" line on provider pages. Backfilled for the 10 providers added this cycle.

## [2.4.0] — 2026-07-31

### Data
- **10 new verified providers → 61.** Net-new free tiers, each cited to the provider's own docs and confirmed activatable without a credit card blocking access: **Voyage AI** (embeddings + rerank, 200M free tokens), **Contextual AI** ($25 credits, reranker), **Cartesia** / **LMNT** / **Fish Audio** / **Camb.ai** (TTS/STT free tiers), **Rev AI** (5h free speech-to-text), **Unstructured** & **Nutrient** (document parsing / OCR, renewing monthly), **Photoroom** (background removal / image editing). Commercial/card catches recorded honestly via flags (e.g. the Cartesia/LMNT/Fish free tiers are non-commercial). Balanced across modalities to broaden adjacent coverage without diluting the LLM-first scope.
- **5 new apply-to-get credit programs → 28.** Startups: Perplexity for Startups ($5k Sonar credits), DigitalOcean Hatch, Pinecone Startup, Weaviate Startup Deal. Students: Perplexity for Students. Vector-DB programs flagged `funds: no` (RAG infra, not model inference).
- **Discovery source map** ([docs/sources.md](docs/sources.md)) — the annotated competitive/mining catalog (incumbent, live-probed twins, proxy-heavy lists to avoid, OpenRouter `/models` as the automatable diff) plus the researched-but-held provider leads recorded in the [backlog](docs/backlog.md).

### Site
- **Mobile navigation** — the primary nav was `display:none` on phones with no replacement; added an accessible hamburger menu (in the shared `site.js`, identical on every page) that closes on link-follow / Escape / outside-click. **Guides** surfaced in the primary nav.
- **Two new modality guides** — `free-image-generation-apis` and `free-ocr-document-ai-apis` (7 guides total), with `FAQPage` structured data, mapping onto the newly-added image/OCR providers.
- **Collection ↔ guide cross-links and FAQ blocks** (with `FAQPage` JSON-LD) on the higher-traffic collections.
- **Per-page social images** for every guide and the model index (previously the generic `og.png`).
- **Explorer table polish** — desktop zebra striping, a sortable-column affordance, a width cap on the widest column; and a client-side **NEW** marker on recently-added providers.

## [2.3.0] — 2026-07-30

A second axis of trust (live probing), real model IDs pulled from providers' own endpoints, and the site's first large SEO surface.

### Data
- **`models_free`** — a new optional, nullable attribute field with a *sampled* list of free model IDs per provider, shown on provider pages and searchable in the explorer.
- **Automated model-sample refresh** — [`scripts/fetch-models.mjs`](scripts/fetch-models.mjs) (`npm run models`) pulls `models_free` straight from each provider's **own `/models` endpoint**: public ones (OpenRouter, GitHub Models, Pollinations) with no key, plus key-gated OpenAI-compatible ones (Groq, Cerebras, SambaNova, Scaleway) when a secret is set. Real IDs only, publisher-diverse sample, deterministic; a fetch failure leaves the field untouched. Wired into the weekly maintenance job. This replaces hand-curation for the volatile lists — OpenRouter, for instance, had rotated its *entire* free line-up since the manual pass. Providers without a reachable endpoint keep a conservative hand-picked sample or `null`.
- **Live testing (probe) — a second axis of trust.** New `scripts/probe.mjs` (`npm run probe`) actually calls each provider's free tier with a real key and records `last_probed` + `probe_status` (`live` / `auth-failed` / `tier-ended` / `rate-limited` / `error`), independent of the docs-based `verified`. It captures the real `/models` list, a 1-token inference, measured latency/tokens-sec, and rate-limit headers. Keys are read from `process.env[env_key]` (new `env_key` field per provider) — transport-agnostic (built for a self-hosted Infisical), used only in auth headers, never logged or committed. `live` results earn a **live-tested** badge on the provider page. Harness built + verified against public endpoints; first real run pending secrets. See [docs/live-testing.md](docs/live-testing.md). Canonical serializer extracted to `scripts/_serialize.mjs` (shared, skips absent keys so new fields stay optional).
- **Verified top-up (4 providers → 51):** Sarvam AI (Indic chat + speech, OpenAI-compatible), Gladia (€50 STT), Rime (3,000 free TTS min), and Tencent Hunyuan (1M tokens/1yr, OpenAI-compatible, real-name-ID caveat). All re-verified against official docs.
- **Credit-programs data source** (`data/programs.json`) driving the new `/programs/` pages and the companion doc; credit programs are now linked from the primary site nav.

### Site
- **Free model index** (`/models/`) — a searchable model → provider table built from every `models_free` entry, answering "which free API serves model X". Server-rendered (works without JS).
- **Guides** (`/guides/`) — five intent-matched, data-generated landing pages (no credit card, OpenAI-compatible, no phone/no signup, embeddings, speech) with an editorial top pick and a live comparison table, for long-tail search.
- **Server-rendered homepage** — the explorer table (51 rows) and the dataset are now inlined into the landing page at build time, so it's fully indexable, paints instantly, and works without JS (previously the flagship page was an empty client-rendered shell).
- **Richer provider pages** (`/p/<slug>`) — a prominent **Free models** block (real sampled IDs + how to pull the live `/models` list), a **modality-aware quickstart** (chat or embeddings) that uses the provider's real base URL and an actual free model instead of a placeholder, a curl variant alongside Python, and a freshness read-out (`verified <date> · N days ago`, with a re-verification-due flag past the 90-day SLA).
- **Recommended default order** (no-card + no-phone + commercial + ongoing + OpenAI-compatible first) and **one-click filter presets** (Side-project starter, OpenAI drop-in, Speech, Embeddings/RAG, Zero signup, Ship commercial), all shareable via the URL.
- **Updates page + RSS feed** (`/updates.html`, `/feed.xml`) generated from git history, plus an **embeddable widget** (`widget.js`) for other sites to show a live top-list that links back.
- **Credit programs split into two standalone pages** — "Startup credits" and "Student credits" are now separate top-nav destinations; the umbrella `/programs/` hub that enumerated both is gone.
- **Consistent sticky header** — bumped the header background to ~97% opacity so the navbar reads identically on every page (it previously picked up the tint of the content behind its translucent blur). Added `Models` to the primary nav; `Guides` and the model index to the footer.
- **Per-page social images** for collections.
- Freshness summary line above the explorer.

### Docs & SEO
- **New companion doc — [credit programs](docs/credit-programs.md):** startup and student/research credit programs you *apply* for (AWS Activate, Microsoft/Google for Startups, Anthropic/OpenAI/Together/Baseten startup credits; Azure for Students, Cohere Labs, Google TPU Research Cloud, etc.). Kept deliberately **out** of the self-serve dataset — different access model, high volatility — with a "funds LLM API?" legend and per-program eligibility.
- README gains a data-generated **"What's covered"** table (modality breakdown) and links to per-provider pages, surfacing the multimodal coverage while keeping "free LLM API" primary.
- New **[docs index](docs/README.md)** and a consistent nav footer on every doc, so the documentation is properly interlinked.
- Updated inclusion-criteria, comparison-dimensions (`ocr` modality) and CONTRIBUTING (full list of generated artifacts) to match the multimodal dataset.
- New **internal-link checker** (`scripts/check-links.mjs`, in CI + `npm test`) so doc cross-links can't silently rot.
- Repo topics expanded with `image-generation`, `speech-to-text`, `embeddings`.

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
