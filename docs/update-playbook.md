# Update playbook

How this list stays current — the routine that keeps the freshness badge green. It has two layers: an **automated backbone** (GitHub Actions, runs without anyone present) and a **weekly human pass** (15–30 min) driven by a self-updating worklist.

## Cadence

- **Weekly:** Mondays, **08:00 UTC**. That's ~**10:00 in Europe/Madrid** during summer (CEST) and ~**09:00** in winter (CET) — GitHub Actions cron runs in UTC and does not observe daylight saving, so the local time shifts by an hour across the year. To pin exactly 10:00 Madrid year-round you'd need two crons (`0 8` and `0 9`) gated by month; not worth the complexity for a maintenance job.
- **Freshness SLA:** every verified entry is re-confirmed against the provider's own docs within **90 days**. The badge reflects this and decays visibly if it slips.

## Layer 1 — automated (no human needed)

Runs every Monday via [`.github/workflows/maintenance.yml`](../.github/workflows/maintenance.yml):

1. **Link re-check** — every `docs_url` is fetched. A genuine failure (not a 401/403/405/429 bot-block) opens or updates the `🔗 Broken source link report` issue.
2. **Badge refresh** — recomputes `badge-freshness.json` from the data and commits it if the fresh-count changed (e.g. entries aged past 90 days). This is why the badge decays on its own.
3. **Re-verification worklist** — [`scripts/staleness.mjs`](../scripts/staleness.mjs) generates a checklist of entries that are 🔴 overdue (>90d), 🟡 due soon (60–90d), or ⚠️ never verified, and posts it to the self-updating `🕝 Weekly re-verification worklist` issue.

On every push/PR, [`verify.yml`](../.github/workflows/verify.yml) also validates the dataset and asserts the generated files are in sync — so bad data never merges.

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
   npm run worklist   # preview the updated worklist locally (optional)
   ```
5. **Commit only `data/providers.json` + the regenerated files, and open a PR.** Tick the item off the worklist issue.

### Also scan for what's new (monthly is enough)

- New providers or promos worth adding? Check the [inclusion criteria](inclusion-criteria.md), then add via a PR or the [new-provider form](../../issues/new?template=new-provider.yml).
- Watch the usual movers: OpenRouter free models, Gemini limits, Groq/Cerebras model lists, Cloudflare Neuron pricing, and any "trial credit" amounts (these change most often).
- Backfill attribute fields still `null`: `openai_base_url`, and any missing `openai_compatible` / `modalities`.

## Optional Layer 3 — agentic re-verification

The human pass can be accelerated by an agent (e.g. a scheduled Claude Code task) that, for each item on the worklist, fetches the provider's docs, drafts the `data/providers.json` edit, and opens a PR for a human to approve. This is opt-in and runs on a machine you control — the two automated layers above are the portable, always-on backbone and don't depend on it. Ask a maintainer if you want this wired up.

## Definition of done for a weekly pass

- Worklist 🔴 overdue count is back to **0**.
- No open `🔗 Broken source link` issue.
- Badge is green (`≥70%` verified within 90 days).
- `npm test` passes and generated files are in sync.

---

_[← Docs index](README.md) · [Main README](../README.md)_
