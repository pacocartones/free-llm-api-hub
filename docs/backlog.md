# Backlog

A living, maintainer-facing checklist of concrete follow-ups. Direction and principles live in the [roadmap](roadmap.md); this is the actionable to-do. Check items off as they ship and add new ones freely.

## Live testing (probe) — see [live-testing.md](live-testing.md)

- [ ] **Wire the self-hosted Infisical → run the first real probe.** User creates the `/free-llm-api-hub` folder + read-only Machine Identity on the VPS; then `infisical run -- node scripts/probe.mjs --write`. Harness is built and tested (generic OpenAI-compatible path); waiting only on secrets.
- [ ] **Provider-specific probe adapters** for the non-OpenAI APIs: Gemini native, Cohere, Deepgram/AssemblyAI (speech), ElevenLabs, Pinecone, etc. (Phase-1 covers the generic OpenAI `/models` + chat/embeddings path only.)
- [ ] **Decide the zero-Actions deploy** (VPS → gh-pages branch, VPS nginx, or keep light pages.yml) and finish `scripts/probe-cron.sh` (uncomment the publish step). Move the weekly `maintenance.yml` work to the VPS cron.
- [ ] Render `data/probe-report.json` on the site: a "live-tested N/51 <30d" badge + a **measured** "fastest free APIs" collection from tokens/sec.
- [ ] Auto-flag `tier-ended` probe results onto the re-verification worklist / "Notably NOT free".

## Data — model samples (`models_free`)

- [ ] **Backfill the key-gated providers.** Groq, Cerebras, SambaNova and Scaleway expose a standard OpenAI `/models` endpoint but need an API key. Add each as a repo secret (`GROQ_API_KEY`, `CEREBRAS_API_KEY`, `SAMBANOVA_API_KEY`, `SCALEWAY_API_KEY`) — the weekly `fetch-models` step already reads them and will fill `models_free` automatically. Until then these keep a conservative hand-picked sample.
- [ ] **Custom fetchers for the non-OpenAI-shaped ones.** Google Gemini (`/v1beta/models?key=`), Z.ai, Cohere (`/v1/models`, needs key), Cloudflare Workers AI (account-scoped model search) each need a small dedicated extractor in `scripts/fetch-models.mjs`.
- [ ] **Improve NVIDIA NIM / ModelScope sample quality.** The publisher round-robin currently surfaces some obscure models (alphabetical-first per vendor). Consider weighting toward headline models, or a small per-provider curated preference list.
- [ ] Consider a `models_url` field: the human-browsable model-list page per provider, linked from the provider page and the model index.

## Site & SEO

- [ ] **Per-page OG images for `/models/` and `/guides/`** (they currently fall back to the generic `og.png`). Extend `scripts/og.mjs` the way collections already do.
- [ ] **Mobile navigation.** `.nav` is `display:none` below 760px with no replacement, so the header links are unreachable on phones. Add a compact menu (details/summary or a small toggle) — same markup on every page.
- [ ] Link guides contextually from collection pages (and vice-versa) where the slice overlaps.
- [ ] FAQ blocks on the highest-traffic collection pages too (guides already have `FAQPage` JSON-LD).

## Dataset / schema

- [ ] `speed_tier` (or tokens/sec) as a defensible, sourced field → enables an honest "fastest free LLM APIs" collection.
- [ ] **Stable release tag per dataset `version`** so downstream consumers can pin a snapshot.
- [ ] History / diffs: track how a provider's free tier changed over time (a generated changelog per provider from git history of `data/providers.json`).

## Bigger bets (under consideration)

- [ ] A small documented public JSON API over the dataset (hosted endpoint with query params).
- [ ] Free AI **coding tools** as a clearly-separated sibling section (volatile — kept out of the verified self-serve dataset, like the credit-programs and self-hosting companions).

## Recently shipped

- ✅ `models_free` with an automated live refresh (`scripts/fetch-models.mjs`); 14/51 providers on real `/models` data (OpenRouter, GitHub Models, Pollinations, NVIDIA NIM, ModelScope, Ollama Cloud).
- ✅ Searchable [free model index](https://pacocartones.github.io/free-llm-api-hub/models/) (`/models/`).
- ✅ Five data-generated [SEO guides](https://pacocartones.github.io/free-llm-api-hub/guides/) with editorial top picks + `FAQPage` structured data.
- ✅ Credit programs split into two standalone pages (startups / students & research).
- ✅ Provider pages: prominent free-models block, modality-aware quickstart with a real model, freshness read-out, cross-links to guides & collections.

---

_[← Docs index](README.md) · [Main README](../README.md)_
