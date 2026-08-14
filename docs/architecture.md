# Architecture — pipeline, data model, scripts, site, design system

The map for anyone touching the code. The short version: **two files are hand-edited, everything else is generated.**

## 1. The data-first pipeline

```
data/providers.json   ─┐
data/programs.json    ─┤──►  scripts/build.mjs  ──►  README.md, badge-freshness.json,
data/schema.json       │                              data/providers.csv, data/providers.yaml,
                       │                              collections/*.md, docs/credit-programs.md,
                       │                              site/index.html (SSR rows injected),
                       │                              site/{collections,models,guides,p,programs,legal}/,
                       │                              site/guides-and-collections/ (unified hub),
                       │                              site/api/v1/*, site/llms.txt, site/llms-full.txt,
                       │                              site/sitemap.xml, site/updates.html, site/feed.xml,
                       │                              site/badges/*.json, site/shared-rules.js,
                       │                              site/shared-rows.js (both gitignored)
                       └──►  everything is DERIVED. Never hand-edit generated files.
```

- **`data/providers.json`** and **`data/programs.json`** are the ONLY sources you hand-edit.
- **`scripts/build.mjs`** reads the data and writes everything. It's **idempotent**: running it twice with the same data produces byte-identical output.
- **CI:** `verify.yml` runs `validate` + `check-links` + `check-og` (OG images exist and match the dataset) + `check-history` (git-mined history) + the pipeline tests on every PR, plus a **blocking drift check**: it rebuilds the derived files and fails the PR if they are out of sync with the data. There is no regeneration bot — the author regenerates locally (`npm run build`, and `npm run og` when needed) and commits the results in the same PR, so a change ships complete — the only scheduled job is the weekly `models_free` backfill (`backfill.yml`), which regenerates its own branch and opens a PR. **Corollary: nothing may be relative to the *current date*** in committed generated files — everything committed must be byte-stable for a given dataset (the "NEW" badge and the freshness colours are computed from `data.generated`, so they are deterministic and safe in committed files; provider `/p/` pages are gitignored precisely so they can use the current date).

  *E2E-verified 2026-08-13 (PR #127): a bare data change without regenerated files fails the drift step (verify run `31746567051`, exit 1, with the remediation instructions in the step summary); pushing the same change with the regenerated files committed passes (run `31746721656`).*

  **The one deliberate exception is `badge-freshness.json`.** It has to be date-relative — a freshness badge that only moves when the data moves is not measuring freshness — so it is committed *and* excluded from both diff-gates (`npm run check` and the drift report list it nowhere). It goes stale between refreshes by design; it is recommitted on every data/build pass (see [update-playbook.md](update-playbook.md)). Nothing may assert that the committed badge equals a freshly built one, because on any day but the last refresh it does not — the test in `build.test.mjs` checks the file is internally consistent instead.

**The gitignored derived files are pinned too.** `derived-fingerprints.json` (a sha256 of every build output under `site/` that is not tracked by git) is itself a drift-gate target: a change to any gitignored derivative - `updates.html`, `feed.xml`, `models/`, `api/`, `badges/`, `legal/`, `programs/`, `llms.txt`, `shared-rules.js`/`shared-rows.js`, ... - is visible in review and fails CI until the author commits the regenerated fingerprint. The set is derived from `git ls-files site/` at the end of `build.mjs`, so it stays in sync with `.gitignore` automatically. The deliberate exclusions are `site/p/` (provider pages render "verified Xd ago" relative to the current day, the same reason they are gitignored at all) and the git-log-derived files — `updates.html`, `feed.xml`, `api/v1/history.json` — whose content embeds the commit hash/subject or dates of the build history, so it shifts across a squash merge and cannot be deterministically pinned (they are regenerated on every deploy).

**Deploys are verified live.** `pages.yml` runs a `verify-live` job after every deploy: it re-checks the sitemap parity against the live site (`npm run check-live`, retrying `FLLM_LIVE_ATTEMPTS` times for edge propagation) and smoke-tests every URL of the published sitemap (`npm run smoke-live`), so a deploy that serves stale or broken pages fails the workflow.

## 2. Data model

### `data/providers.json`
Top level: `{ $schema, version (semver), generated (YYYY-MM-DD), source, note, providers: [...] }`.
Schema in `data/schema.json`; validated by `scripts/validate.mjs`. Canonical byte-format enforced by `scripts/_serialize.mjs` (the `ORDER` array). **Field order in the file MUST match `ORDER`** or the serializer self-test fails.

Per-provider fields (in serializer order):

| field | type | notes |
|---|---|---|
| `slug` | kebab-case, unique, never reused | stable ID; drives `/p/<slug>.html`, `env_key`, OG path |
| `name` | string, unique | display name |
| `category` | `ongoing` \| `trial` | splits README tables + site |
| `free_type` | `perpetual` \| `renewing-quota` \| `recurring-credit` \| `trial-credit` | finer shape |
| `free_tier` | string | what you actually get, concrete |
| `rate_limits` | string | |
| `notes` | string | "the catch" — the fine print that bites |
| `best_for` | string \| null | editorial one-liner (subtitle in table + card) |
| `modalities` | array of `text,vision,image,audio,embeddings,rerank,ocr` | |
| `models_free` | array of strings \| null | SAMPLED model IDs (attribute, not core claim). Refreshed by `fetch-models.mjs`. |
| `expires` | string \| null | e.g. "30 days" |
| `docs_url` | url | **primary source** — provider's own page. Required when `verified:true`. Also drives the "Visit website" button. |
| `phone_required` | true/false/null | null = not confirmed |
| `card_required` | true/false/null | |
| `commercial_ok` | true/false/null | |
| `openai_compatible` | true/false/null | |
| `openai_base_url` | url \| null | only when `openai_compatible !== false` |
| `env_key` | UPPER_SNAKE | secret NAME for probe/fetch-models. **STRIPPED from all public output** (homepage payload, site/providers.json, /api). Never the value. |
| `verified` | boolean | true = independently confirmed against own docs on `last_verified` |
| `last_verified` | YYYY-MM-DD \| null | must be null when `verified:false` |
| `added` | YYYY-MM-DD (optional) | provenance: when it entered the dataset. Drives the NEW badge (≤45d) in the shared row code — SSR and client alike. Set once; never changes. |
| `last_probed` | YYYY-MM-DD \| null | live-probe date (probe.mjs) |
| `probe_status` | `live`/`auth-ok`/`auth-failed`/`tier-ended`/`rate-limited`/`error`/null | `live` → "live-tested" badge; `auth-ok` → credentials checked, no inference |

The serializer **skips absent keys**, so new optional fields only appear on providers that have them, and existing rows are untouched.

### `data/programs.json`
`{ generated, note, startups: [...], research: [...] }`. Each entry:
- startups: `{ name, url, what, funds, who }`
- research: `{ name, url, audience, what, funds, who }` (audience required)
- `funds`: `yes` = first-party LLM-API credits · `partial` = cloud/compute usable for managed LLM APIs · `no` = training/perks/adjacent infra.

## 3. Scripts (`scripts/`, npm scripts in `package.json`)

- **`build.mjs`** (`npm run build`) — generates everything (see §1). Idempotent. Uses git (`execSync`) for the updates page/RSS and the per-provider change history; graceful if git is absent. Note: needs a **full clone** (`fetch-depth: 0` in CI) for that history.
- **`validate.mjs`** (`npm run validate`, part of `npm test`) — integrity gate: enums, unique slug/name, tristate fields, verified→(last_verified+docs_url), `added` format, programs.json shape. Exit 1 on any issue.
- **`_serialize.mjs`** — the ONE canonical serializer (`ORDER`, `serialize`, `roundTripError`). Shared by fetch-models + probe so they never drift. `roundTripError` asserts byte-exact.
- **`fetch-models.mjs`** (`npm run models`, `--write`, `--self-test`) — refreshes `models_free` from each provider's own `/models` endpoint. PUBLIC (no key): openrouter (`:free`), pollinations, nvidia-nim, modelscope, ollama-cloud. KEY-gated (only if env var set): groq, cerebras, sambanova, scaleway. Real IDs only; a fetch failure leaves the field untouched. Deterministic publisher-diverse sample, cap 8.
- **`discover.mjs`** (`npm run discover`, `--write`, `--json`) — diffs OpenRouter's `:free` catalog vs a stored snapshot (`data/discover-snapshot.json`) and reports NEW free models + publishers not listed as first-party (leads). Never edits the dataset.
- **`probe.mjs`** (`npm run probe`) — live-tests each free tier with a real key from `process.env[env_key]`; writes `last_probed`/`probe_status`. Generic OpenAI-compatible path only so far. Run on demand, locally: `node scripts/probe.mjs --write --auth-only`; see [live-testing.md](live-testing.md).
- **`og.mjs`** (`npm run og`) — renders social PNGs with `@resvg/resvg-js` (the only devDependency): site-wide `og.png`, per-provider `site/og/p/*.png`, per-guide and per-collection; also writes `site/og/manifest.json` so `check-og.mjs` can fingerprint them. **NOT run by the Pages build** → the PNGs must be COMMITTED (`site/og/` is not gitignored). Run `npm run og` after adding providers/guides/collections.
- **`staleness.mjs`** (`npm run worklist`) — re-verification worklist, printed locally, report-only: 🔴 overdue (>90d), 🟡 due soon (61–90d), ⚠️ never verified, plus this week's batch and the cliff watch (many entries sharing one verification date). Same buckets as the badge, imported from `rules.mjs`; see [freshness-sla.md](freshness-sla.md). The weekly pass follows it ([update-playbook.md](update-playbook.md)).
- **`reverify.mjs`** (`npm run reverify`, `--batch N`, `--no-fetch`) — the local, on-demand re-verification pass (playbook layer 3, zero Actions): fetches each batch provider's own `docs_url` and writes a review dossier to `.freebuff/reverify/<slug>.md` (gitignored, local only). Never edits data by itself — an agent compares the fetched docs against the entry and drafts the edit; a human runs `npm run build && npm test` and opens the PR.
- **`check-og.mjs`** (CI) — every committed OG PNG must exist AND match the dataset: recomputes the fingerprints in `site/og/manifest.json` from `data/providers.json`. Pure Node, no `@resvg`, so it runs in the dependency-free CI job.
- **`check-history.mjs`** (CI) — cheaply validates the git-mined per-provider history (two git processes, no build) before the full test suite.
- **`check-links.mjs`** (`npm run links`, part of `npm test`) — validates INTERNAL markdown links (relative doc-to-doc paths) only. Never touches the network. The external `docs_url` sweep is a local on-demand pass in the [update playbook](update-playbook.md); genuine failures (not 401/403/405/429 bot-blocks) open a "broken link" issue.
- **`probe-cron.sh`** — the VPS weekly cron alternative (Infisical → probe → models → build → push), for a zero-Actions-minutes setup.

npm scripts: `build, validate, links, worklist, reverify, models, discover, probe, og, test (validate + links + test suites), check (validate + build + diff-gate), check-live (committed sitemap vs deployed), smoke-live (every published sitemap URL answers 200)`.

## 4. Site structure (`site/`)

**IMPORTANT two-places rule:** the homepage `site/index.html` is **HAND-WRITTEN**; the build only injects the SSR table rows (`<!-- AUTOGEN:rows -->`) and the inline JSON payload (`<!-- AUTOGEN:data -->`). Every OTHER page is generated by `build.mjs` using `siteHeader(prefix)` / `siteFooter(prefix)` / `htmlPage(...)`. So **when you change the header/footer/nav you must edit BOTH** `site/index.html` AND the `siteHeader`/`siteFooter` functions in build.mjs. Same for the SVG icon sprite (one copy in build.mjs `SPRITE`, one inline in `site/index.html`).

Pages:
- **`/` (index.html)** — hero, trust strip, controls, SSR explorer table + inline dataset, client explorer JS (filter presets, sort, category/modality filters, URL-sync) in `site/explorer.js`. Works with no JS (SSR rows). Row markup is **single-source**: one `explorerRowHtml()` in `scripts/lib/rows.mjs` — build.mjs server-renders with it (`now: data.generated`, deterministic, drift-safe) and serializes it to `site/shared-rows.js` (`window.FLLM_ROWS.rowHtml`), which the client calls with `now: Date.now()` for live freshness. The shared scoring/flag/freshness logic lives in `scripts/lib/rules.mjs`, serialized to `site/shared-rules.js` (`window.FLLM_RULES`); both files are build-emitted and gitignored. Never keep row markup in build.mjs or explorer.js.
- **`/models/`** — searchable model→provider index from every `models_free`.
- **`/guides/<slug>`** — data-generated SEO guides (`GUIDES` in build.mjs): filter, top pick, FAQ (`FAQPage` JSON-LD), related guides, per-page OG. The unified **hub lives at `/guides-and-collections/`** (two sections — guides and collections); the old `/guides/` and `/collections/` roots are meta-refresh redirects to it.
- **`/collections/<slug>`** — editorial collections (`COLLECTIONS` in build.mjs). Each has repo markdown (`collections/*.md`) + live HTML, FAQ on higher-traffic ones, per-collection OG. (`/collections/` root redirects to the hub.)
- **`/p/<slug>`** (file `site/p/<slug>.html`) — provider cards, clean canonical URL. Gitignored + regenerated on deploy → may use the current date (freshness read-out). Badges, "Official docs" + "Visit website", meta table, free-models block, modality-aware quickstart, change history (from git).
- **`/programs/`** — startup + research credit program pages, from programs.json.
- **`/api/v1/`** — static JSON API: `providers.json`, `programs.json`, `history.json`, `index.json` (manifest), slices (`ongoing,trial,perpetual,no-card,no-phone,commercial,openai-compatible`), `modality/<m>.json`. Every object carries `version`+`generated`.
- **`llms.txt` + `llms-full.txt`** — llmstxt.org index + full provider expansion, for AI agents.
- **`/updates.html` + `/feed.xml`** — from git log. **`/legal/`** — privacy/terms (noindex). **`/badges/`** — per-provider shields.io endpoint JSON. Plus `sitemap.xml`, `robots.txt`, `CNAME`, `og/`, `favicon.svg`, `fonts/`, `styles.css`, `site.js`, `explorer.js`, `widget.js`.

Client JS: `site/site.js` (loaded on EVERY page) = theme toggle, live GitHub stars (6h cache), "/" to focus search, code-block copy buttons, mobile nav toggle. `site/explorer.js` = homepage explorer logic. `site/widget.js` = the embeddable widget. All scripts run under a hash-based Content-Security-Policy.

## 5. Design system (`site/styles.css`)
- Terminal-green identity: `--accent:#3fce8f`, self-hosted JetBrains Mono, CSS vars + `[data-theme]` dark/light (persisted), SVG icon sprite (`ic-*`), `>_`-style prompts, AA contrast.
- **Header identical on every page** — keep `--header-bg` opaque (a translucent value lets content bleed through the blur).
- **Nav (5 items, each with an icon):** Home · Models · Guides & Collections · Startup credits · Student credits. Collapses to a hamburger below 900px.
- **Explorer table** (home): 5 columns — API, Type, What's free, The catch, Verified.
- **Hero H1 stays plain** — deliberate design decision, no typewriter/reveal effects.

---

_[← Docs index](README.md) · [Main README](../README.md)_
