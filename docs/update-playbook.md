# Update playbook

How this list stays current — the routine that keeps the freshness badge green. It has two layers: an **automated backbone** (GitHub Actions, runs without anyone present) and a **weekly human pass** (15–30 min) driven by a self-updating worklist.

## Cadence

- **Weekly:** Mondays, **08:00 UTC**. That's ~**10:00 in Europe/Madrid** during summer (CEST) and ~**09:00** in winter (CET) — GitHub Actions cron runs in UTC and does not observe daylight saving, so the local time shifts by an hour across the year. To pin exactly 10:00 Madrid year-round you'd need two crons (`0 8` and `0 9`) gated by month; not worth the complexity for a maintenance job.
- **Freshness SLA:** every verified entry is re-confirmed against the provider's own docs within **90 days**. The badge is graded on the *oldest* entry against that SLA, so it turns amber the moment one row goes past 60 days and red the moment one goes past 90 — it slips before the list does.

## Layer 1 — automated (no human needed)

Runs every Monday via [`.github/workflows/maintenance.yml`](../.github/workflows/maintenance.yml):

1. **Link re-check** — every `docs_url` is fetched. A genuine failure (not a 401/403/405/429 bot-block) opens or updates the `🔗 Broken source link report` issue.
2. **Badge refresh** — recomputes `badge-freshness.json` from the data and commits it if the oldest entry got older. This is why the badge decays on its own: nobody has to touch the data for the number to move.
3. **Free model samples** — [`scripts/fetch-models.mjs`](../scripts/fetch-models.mjs) refreshes each provider's `models_free` from its **own `/models` endpoint**. Public endpoints (OpenRouter, Pollinations, NVIDIA NIM, ModelScope, Ollama Cloud) need no key; the key-gated OpenAI-compatible ones (Groq, Cerebras, SambaNova, Scaleway) refresh only if the matching repo secret is set. Real IDs only — a fetch failure leaves the field untouched, never blanked. Changes are rebuilt and committed automatically. This keeps the volatile lists (OpenRouter rotates its free models constantly) accurate without hand-curation or hallucination.
4. **Re-verification worklist** — [`scripts/staleness.mjs`](../scripts/staleness.mjs) generates a checklist with a paced **weekly batch** (the oldest verifications, sized to clear the 90-day SLA without a cliff) plus 🔴 overdue (>90d), 🟡 due soon (60–90d), and ⚠️ never verified, and posts it to the self-updating `🕝 Weekly re-verification worklist` issue.
5. **Live probe** — [`probe.yml`](../.github/workflows/probe.yml) runs `probe.mjs --auth-only --write` with whatever provider keys exist as repo secrets, and commits the resulting `last_probed`/`probe_status`. Providers without a secret are skipped.

On every push/PR, [`verify.yml`](../.github/workflows/verify.yml) validates the dataset and reports (informationally) if generated files are out of sync; [`regenerate.yml`](../.github/workflows/regenerate.yml) rebuilds them after merge — so bad data never merges and data-only PRs stay one-line.

## Layer 2 — the weekly human pass

Open the **`🕝 Weekly re-verification worklist`** issue and work top-down. For each provider on it:

1. **Open the provider's own docs** (the `docs` link in the item). Third-party summaries don't count.
2. **Compare against `data/providers.json`:** free tier, rate limits, credit amount/expiry, and the catches (`card_required`, `phone_required`, `commercial_ok`, `openai_compatible`).
3. **Update the entry:**
   - Confirmed → set the current numbers, `verified: true`, `last_verified` = today.
   - Changed → correct the numbers, same as above.
   - Gone → remove the entry (note it in [CHANGELOG.md](../CHANGELOG.md)) or, if the free tier ended, move the note to the README's "Notably NOT free" section.
   - Couldn't confirm → `verified: false`, `last_verified: null`, explain in `notes`.
4. **Regenerate and check:**
   ```bash
   npm run build      # README, badge, exports, collections, site payload
   npm test           # dataset integrity gate
   npm run og         # regenerate social preview PNGs (counts in subtitles drift)
   npm run worklist   # preview the updated worklist locally (optional)
   ```
   `npm run og` needs `@resvg/resvg-js` (the only devDependency — `npm install`
   before the first run). The CI gate checks that a PNG *exists* for every
   provider, but only this pass regenerates them when counts, flags or provider
   categories change.
5. **Commit only `data/providers.json` + the regenerated files, and open a PR.** Tick the item off the worklist issue.

### Also scan for what's new (monthly is enough)

- **Run `npm run discover`** — diffs OpenRouter's live `:free` catalog against the last snapshot and flags new free models plus publishers we don't list as a first-party provider (leads). Triage each lead against the [inclusion criteria](inclusion-criteria.md); `npm run discover -- --write` re-baselines the snapshot. See [sources.md](sources.md) for the wider source map.
- New providers or promos worth adding? Check the [inclusion criteria](inclusion-criteria.md), then add via a PR or the [new-provider form](../../issues/new?template=new-provider.yml).
- Watch the usual movers: Gemini limits, Cloudflare Neuron pricing, and any "trial credit" amounts (these change most often). The model *lists* (OpenRouter, Groq, Cerebras, etc.) are refreshed automatically by `npm run models` / the weekly job — you only need to eyeball its diff.
- Backfill attribute fields still `null`: `openai_base_url`, and any missing `openai_compatible` / `modalities`.

## Optional Layer 3 — agentic re-verification

The human pass can be accelerated by an agent (e.g. a scheduled Claude Code task) that, for each item on the worklist, fetches the provider's docs, drafts the `data/providers.json` edit, and opens a PR for a human to approve. This is opt-in and runs on a machine you control — the two automated layers above are the portable, always-on backbone and don't depend on it. Ask a maintainer if you want this wired up.

## Optional Layer 4 — public security-data stewardship

Once a month, or when maintenance work exposes a clearly documented discrepancy, review **one**
public GitHub Advisory Database record. The aim is data quality for the ecosystem, not vulnerability
research or disclosure.

1. Use only information that is already public and supported by the upstream advisory/release or
   fix, plus the existing GHSA/CVE record where available.
2. Make one narrow, factual correction per PR; verify every populated event in each advisory package range — `introduced`, `fixed`, `last_affected`, or `limit` — against the upstream advisory or fix before changing prose or metadata.
3. Explain the discrepancy and cite the primary sources in the PR. Keep only one advisory PR open
   at a time and follow it through review.
4. Stop if the evidence conflicts, is incomplete, or appears to reveal a new vulnerability. Report
   that privately to the affected project instead of submitting it to the public database.

This keeps the contribution lane useful and auditable: accuracy and provenance matter more than
volume. See GitHub's [advisory-database contribution guidance](https://github.com/github/advisory-database/blob/main/CONTRIBUTING.md)
for its current requirements.

## Definition of done for a weekly pass

- Worklist 🔴 overdue count is back to **0**.
- No open `🔗 Broken source link` issue.
- Badge is green (`≥70%` verified within 90 days).
- `npm test` passes and generated files are in sync.
- `npm run og` produces zero diffs — provider, collection and guide OGs match the current data.

---

_[← Docs index](README.md) · [Main README](../README.md)_
