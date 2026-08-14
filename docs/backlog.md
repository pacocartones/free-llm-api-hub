# Backlog

A living, maintainer-facing checklist of concrete follow-ups. Direction and principles live in the [roadmap](roadmap.md); this is the actionable to-do. Check items off as they ship and add new ones freely.

## Live testing (probe) — see [live-testing.md](live-testing.md)

- [ ] **Wire the self-hosted Infisical → run the first real probe.** User creates the `/free-llm-api-hub` folder + read-only Machine Identity on the VPS; then `infisical run -- node scripts/probe.mjs --write`. Harness is built and tested (generic OpenAI-compatible path); waiting only on secrets.
- [ ] **Provider-specific probe adapters** for the non-OpenAI APIs: Gemini native, Cohere, Deepgram/AssemblyAI (speech), ElevenLabs, Pinecone, etc. (Phase-1 covers the generic OpenAI `/models` + chat/embeddings path only.)
- [ ] **Decide the zero-Actions deploy** (VPS → gh-pages branch, VPS nginx, or keep light pages.yml) and finish `scripts/probe-cron.sh` (uncomment the publish step). The weekly maintenance is already fully local ([update-playbook.md](update-playbook.md)); only the deploy decision remains.
- [ ] Render `data/probe-report.json` on the site: a live-tested badge (N of the providers that declare an `env_key`, refreshed within 30d) + a **measured** "fastest free APIs" collection from tokens/sec.
- [ ] Auto-flag `tier-ended` probe results onto the re-verification worklist / "Notably NOT free".

## Data — model samples (`models_free`)

- [ ] **Backfill the key-gated providers.** Groq, Cerebras, SambaNova and Scaleway expose a standard OpenAI `/models` endpoint but need an API key. Add each as a repo secret (`GROQ_API_KEY`, `CEREBRAS_API_KEY`, `SAMBANOVA_API_KEY`, `SCALEWAY_API_KEY`) — the `fetch-models` script already reads them and will fill `models_free` automatically (locally or via probe-cron.sh; the weekly `backfill.yml` skips key-gated providers because it has no secrets). Until then these keep a conservative hand-picked sample.
- [ ] **Custom fetchers for the non-OpenAI-shaped ones.** Google Gemini (`/v1beta/models?key=`), Z.ai, Cohere (`/v1/models`, needs key), Cloudflare Workers AI (account-scoped model search) each need a small dedicated extractor in `scripts/fetch-models.mjs`.
- [ ] **Improve NVIDIA NIM / ModelScope sample quality.** The publisher round-robin currently surfaces some obscure models (alphabetical-first per vendor). Consider weighting toward headline models, or a small per-provider curated preference list.
- [ ] Consider a `models_url` field: the human-browsable model-list page per provider, linked from the provider page and the model index.

## Site & SEO

- ✅ **Per-page OG images for `/models/` and `/guides/`.** `og.mjs` generalized (`tagSvg`) to render one per guide + one for the model index; wired via `ogImage` in build.mjs.
- ✅ **Mobile navigation.** Added an accessible hamburger toggle (in the shared `site.js`, so identical on the homepage and every generated page) that drops the nav down as a panel below 900px; closes on link-follow / Escape / outside-click. Also surfaced **Guides** in the primary nav (was footer/hero-only).
- ✅ **Guides ↔ collections cross-links** and ✅ **FAQ blocks** (with `FAQPage` JSON-LD) on the higher-traffic collections.
- ✅ **Two new modality guides** — image generation + OCR/document-AI (7 guides total), mapping onto the new providers.
- ✅ **Explorer table polish** — desktop zebra striping, sortable-column affordance, width cap on the widest column, and a **NEW** marker (via the `added` field, rendered by the shared row code in both SSR and client).
- ✅ **Per-provider OG images** — `og.mjs` renders one per provider (`site/og/p/<slug>.png`), wired via `ogImage` in build.mjs and verified by `check-og.mjs`.
- [ ] Optional: export `added` in the CSV/YAML column set (currently JSON-only).

## Dataset / schema

- [ ] `speed_tier` (or tokens/sec) as a defensible, sourced field → enables an honest "fastest free LLM APIs" collection.
- ✅ **Stable release tag per dataset `version`** — tagging `vX.Y.Z` at each schema/dataset version so downstream consumers can pin a snapshot (e.g. `v2.5.0`). Tag each future version bump.
- [ ] History / diffs: track how a provider's free tier changed over time (a generated changelog per provider from git history of `data/providers.json`).

## Provider leads — verify before adding

Researched 2026-07-31 but held out of the dataset because the free access could
not be cleanly cited to the provider's own page _today_, or is card/region-gated.
Re-check each against the [inclusion criteria](inclusion-criteria.md); promote
only what confirms.

- [ ] **MiniMax** (LLM) — OpenAI-compatible confirmed (`https://api.minimax.io/v1`,
  also an Anthropic-compatible path), internationally reachable email signup, but
  **no free-trial credit is documented** on its pricing/docs pages (campaign-
  dependent). The most-wanted net-new LLM — confirm a citable free tier (or probe
  a fresh signup) before adding. Also Anthropic-compatible worth noting.
- [ ] **Upstage** (Solar LLM + Document Parse/OCR) — high-value LLM+OCR combo, but
  the free amount is fuzzy on the pricing page ("10 free runs" on Studio) and the
  Solar base URL/OpenAI-compat wasn't confirmable on-page. Verify via
  `console.upstage.ai/docs`.
- [ ] **Veryfi** (OCR) — pricing page shows both "Free Forever 100 docs/mo" and a
  "14-day trial, no card" — contradictory; resolve which is current.
- [ ] **Replicate** (image/video) — "run select models for free… after a bit
  you'll be asked to set up billing"; no card to start but the free amount isn't
  quantified. Add only if a concrete allowance can be cited.
- [ ] **Alibaba Cloud (Catalyst) Startup** program — page is JS-rendered/blank to
  fetch; agent-sourced ~$120k credits + Qwen Model Studio. Confirm the page and
  terms, then add to [programs](credit-programs.md).
- [ ] **OCR / doc-AI tail** (each has a real free/trial tier per research, held to
  avoid tilting the dataset into an OCR directory): Datalab, Reducto, ABBYY Cloud
  OCR SDK, Parsio, Airparser, Extracta.ai, Pen-to-Print. Add selectively if a gap
  appears.
- [ ] **Speech tail:** Voicegain ($50 STT credits, no card), Smallest.ai ($10),
  Retell AI ($10 voice-agent), Camb.ai already added.
- [ ] **From `npm run discover` (2026-07-31):** `inclusionai` (InclusionAI /
  Ant Group — Ling/Bailing models appear free on OpenRouter) and `poolside` show
  free models we don't cover — check whether either lab exposes its OWN direct
  free API tier before adding.
- [ ] **Chinese labs (region-gated):** Baidu Qianfan / ERNIE (1M free tokens per
  model, big catalog), ByteDance Volcengine/Doubao, StepFun, SenseNova — real free
  tiers but mainland phone/ID gates make them poor fits for an international
  builder audience. Revisit if any drops the ID wall for overseas devs.
- [ ] **Explicitly NOT free (do not add; leave in "Notably NOT free" thinking):**
  Moonshot/Kimi intl (needs ≥$1 recharge), DeepInfra, Chutes, Together AI &
  Hyperbolic (historic signup credit no longer documented — recheck later),
  Parasail, GMICloud, Inference.net, Lepton (folded into NVIDIA), Nomic (pivoted).

## Discovery & research infrastructure

- ✅ **Automated the OpenRouter `:free` diff** — [`scripts/discover.mjs`](../scripts/discover.mjs)
  (`npm run discover`, `--write` to snapshot, `--json` for machine output). Reads
  OpenRouter's unauthenticated `/api/v1/models`, keeps `:free` variants, and
  reports what's NEW since the last snapshot plus **publishers with free models
  we don't list as a first-party provider** (leads). Never edits the dataset.
- [ ] Track the competitive/lead sources in [sources.md](sources.md) on the
  monthly scan; benchmark our freshness against cheahjs.
- [ ] Consider a second discovery feed (models.dev or the Portkey pricing
  dataset) behind the same `discover.mjs` report, for cross-checking.

## Bigger bets (under consideration)

- ✅ **Small documented public JSON API over the dataset** — shipped as a *static* versioned API at [`/api/v1/`](https://freellmapihub.com/api/) (full + slices by category/constraint/modality) plus `llms.txt`/`llms-full.txt` for agents. No query params (static hosting); slices cover the common filters.
- [ ] Free AI **coding tools** as a clearly-separated sibling section (volatile — kept out of the verified self-serve dataset, like the credit-programs and self-hosting companions).

## Recently shipped

- ✅ `models_free` with an automated live refresh (`scripts/fetch-models.mjs`); 13/67 providers on real `/models` data (OpenRouter, Pollinations, NVIDIA NIM, ModelScope, Ollama Cloud, plus the key-gated Groq/Cerebras/SambaNova/Scaleway when keys are set).
- ✅ Searchable [free model index](https://freellmapihub.com/models/) (`/models/`).
- ✅ Seven data-generated [SEO guides & collections](https://freellmapihub.com/guides-and-collections/) with editorial top picks + `FAQPage` structured data.
- ✅ Credit programs split into two standalone pages (startups / students & research).
- ✅ Provider pages: prominent free-models block, modality-aware quickstart with a real model, freshness read-out, cross-links to guides & collections.

---

_[← Docs index](README.md) · [Main README](../README.md)_
