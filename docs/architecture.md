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
                       │                              site/api/v1/*, site/llms.txt, site/llms-full.txt,
                       │                              site/sitemap.xml, site/updates.html, site/feed.xml,
                       │                              site/badges/*.json
                       └──►  everything is DERIVED. Never hand-edit generated files.
```

- **`data/providers.json`** and **`data/programs.json`** are the ONLY sources you hand-edit.
- **`scripts/build.mjs`** reads the data and writes everything. It's **idempotent**: running it twice with the same data produces byte-identical output.
- **CI:** `verify.yml` runs `validate` + `check-links` + the pipeline tests on every PR, plus a **blocking drift check**: it rebuilds the derived files and fails the PR if they are out of sync with the data. There is no regeneration bot — the author regenerates locally (`npm run build`, and `npm run og` when needed) and commits the results in the same PR, so a change ships complete and nothing runs on a schedule. **Corollary: nothing date-relative may appear in committed generated files** (the "NEW" badge is client-side only; provider `/p/` pages are gitignored precisely so they can use the current date).

  *E2E-verified 2026-08-13 (PR #127): a bare data change without regenerated files fails the drift step (verify run `31746567051`, exit 1, with the remediation instructions in the step summary); pushing the same change with the regenerated files committed passes (run `31746721656`).*

  **The one deliberate exception is `badge-freshness.json`.** It has to be date-relative — a freshness badge that only moves when the data moves is not measuring freshness — so it is committed *and* excluded from both diff-gates (`npm run check` and the drift report list it nowhere). It goes stale between refreshes by design; it is recommitted on every data/build pass (see [update-playbook.md](update-playbook.md)). Nothing may assert that the committed badge equals a freshly built one, because on any day but the last refresh it does not — the test in `build.test.mjs` checks the file is internally consistent instead.

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
| `added` | YYYY-MM-DD (optional) | provenance: when it entered the dataset. Drives the client-side NEW badge (<45d). Set once; never changes. |
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
- **`og.mjs`** (`npm run og`) — renders social PNGs with `@resvg/resvg-js` (the only devDependency). **NOT run by the Pages build** → the PNGs must be COMMITTED (`site/og/` is not gitignored). Run `npm run og` after adding providers/guides/collections.
- **`staleness.mjs`** (`npm run worklist`) — re-verification worklist (>90d overdue etc.), printed locally; the weekly pass follows it (see [update-playbook.md](update-playbook.md)).
- **`check-links.mjs`** (`npm run links`, part of `npm test`) — validates INTERNAL markdown links (relative doc-to-doc paths) only. Never touches the network. The external `docs_url` sweep is a local on-demand pass in the [update playbook](update-playbook.md); genuine failures (not 401/403/405/429 bot-blocks) open a "broken link" issue.
- **`probe-cron.sh`** — the VPS weekly cron alternative (Infisical → probe → models → build → push), for a zero-Actions-minutes setup.

npm scripts: `build, validate, links, worklist, models, discover, probe, og, test (validate+links), check (validate+build+diff-gate)`.

## 4. Site structure (`site/`)

**IMPORTANT two-places rule:** the homepage `site/index.html` is **HAND-WRITTEN**; the build only injects the SSR table rows (`<!-- AUTOGEN:rows -->`) and the inline JSON payload (`<!-- AUTOGEN:data -->`). Every OTHER page is generated by `build.mjs` using `siteHeader(prefix)` / `siteFooter(prefix)` / `htmlPage(...)`. So **when you change the header/footer/nav you must edit BOTH** `site/index.html` AND the `siteHeader`/`siteFooter` functions in build.mjs. Same for the SVG icon sprite (one copy in build.mjs `SPRITE`, one inline in `site/index.html`).

Pages:
- **`/` (index.html)** — hero, trust strip, controls, SSR explorer table + inline dataset, client explorer JS (filter/sort/search/presets/URL-sync) in `site/explorer.js`. Works with no JS (SSR rows). The client `render()` and the SSR `explorerRowsHtml()` in build.mjs must produce the SAME row structure — the shared scoring/flag logic lives in `scripts/lib/rules.mjs`, serialized to `site/shared-rules.js` by the build.
- **`/models/`** — searchable model→provider index from every `models_free`.
- **`/guides/`** — data-generated SEO guides + hub (`GUIDES` in build.mjs). Each: filter, top pick, FAQ (`FAQPage` JSON-LD), related guides, per-page OG.
- **`/collections/`** — editorial collections (`COLLECTIONS` in build.mjs). Each has repo markdown (`collections/*.md`) + live HTML, FAQ on higher-traffic ones, per-collection OG.
- **`/p/<slug>.html`** — provider cards. Gitignored + regenerated on deploy → may use the current date (freshness read-out). Badges, "Official docs" + "Visit website", meta table, free-models block, modality-aware quickstart, change history (from git).
- **`/programs/`** — startup + research credit program pages, from programs.json.
- **`/api/v1/`** — static JSON API: `providers.json`, `programs.json`, `history.json`, `index.json` (manifest), slices (`ongoing,trial,perpetual,no-card,no-phone,commercial,openai-compatible`), `modality/<m>.json`. Every object carries `version`+`generated`.
- **`llms.txt` + `llms-full.txt`** — llmstxt.org index + full provider expansion, for AI agents.
- **`/updates.html` + `/feed.xml`** — from git log. **`/legal/`** — privacy/terms (noindex). **`/badges/`** — per-provider shields.io endpoint JSON. Plus `sitemap.xml`, `robots.txt`, `CNAME`, `og/`, `favicon.svg`, `fonts/`, `styles.css`, `site.js`, `explorer.js`, `widget.js`.

Client JS: `site/site.js` (loaded on EVERY page) = theme toggle, live GitHub stars (6h cache), "/" to focus search, code-block copy buttons, mobile nav toggle. `site/explorer.js` = homepage explorer logic. `site/widget.js` = the embeddable widget. All scripts run under a hash-based Content-Security-Policy.

## 5. Design system (`site/styles.css`)
- Terminal-green identity: `--accent:#3fce8f`, self-hosted JetBrains Mono, CSS vars + `[data-theme]` dark/light (persisted), SVG icon sprite (`ic-*`), `>_`-style prompts, AA contrast.
- **Header identical on every page** — keep `--header-bg` opaque (a translucent value lets content bleed through the blur).
- **Nav (6 items, each with an icon):** Home · Models · Guides · Collections · Startup credits · Student credits. Collapses to a hamburger below 900px.
- **Explorer table** (home): 5 columns — API, Type, What's free, The catch, Verified.
- **Hero H1 stays plain** — deliberate design decision, no typewriter/reveal effects.

---

_[← Docs index](README.md) · [Main README](../README.md)_
