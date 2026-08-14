# Update playbook

How this list stays current — the routine that keeps the freshness badge green. There is **no GitHub Actions** in this flow: everything below runs locally, on demand, on a machine you control. Nothing in this project depends on Actions minutes.

## Cadence

- **Weekly:** aim for one pass a week (Mondays ~10:00 Madrid works well), but nothing enforces it — the badge and the worklist only move when the data moves, and `npm run reverify` sizes its batch to clear the 90-day SLA without a cliff.
- **Freshness SLA:** every verified entry is re-confirmed against the provider's own docs within **90 days**. The badge is graded on the *oldest* entry against that SLA, so it turns amber the moment one row goes past 60 days and red the moment one goes past 90 — it slips before the list does.

## Layer 1 — the re-verification batch (local script)

[`scripts/reverify.mjs`](../scripts/reverify.mjs) (`npm run reverify`) picks the oldest verifications (sized to clear the SLA), fetches each provider's own `docs_url`, and writes a review dossier per provider to `.freebuff/reverify/<slug>.md` (gitignored — local only):

```bash
npm run reverify              # this week's batch (oldest first)
npm run reverify -- --batch 12     # override the batch size
npm run reverify -- --no-fetch     # offline: just print the batch
```

The script never edits the data: an agent (or a human) reads each dossier, compares the fetched docs against `data/providers.json`, and drafts the edit. Fetch failures, SPAs and non-text bodies are flagged in the dossier — those are reviewed manually.

## Layer 2 — the weekly pass

For each provider on the worklist (`npm run worklist`, or just the reverify batch):

1. **Open the provider's own docs** (the `docs` link in the item). Third-party summaries don't count.
2. **Compare against `data/providers.json`:** free tier, rate limits, credit amount/expiry, and the catches (`card_required`, `phone_required`, `commercial_ok`, `openai_compatible`).
3. **Update the entry:**
   - Confirmed → set the current numbers, `verified: true`, `last_verified` = today.
   - Changed → correct the numbers, same as above.
   - Gone → remove the entry (note it in [CHANGELOG.md](../CHANGELOG.md)) or, if the free tier ended, move the note to the README's "Notably NOT free" section.
   - Couldn't confirm → `verified: false`, `last_verified: null`, explain in `notes`.
   - **Bump `generated`** (top of `data/providers.json`) to today — the integrity gate rejects any `generated` older than the newest `last_verified`/`added`, so every consumer (sitemap, API, CITATION, llms.txt) ships an honest date.
4. **Regenerate and check (same PR):**
   ```bash
   npm run build      # README, badge, exports, collections, site payload
   npm test           # dataset integrity gate
   npm run og         # regenerate social preview PNGs (counts in subtitles drift)
   npm run worklist   # preview the updated worklist locally (optional)
   ```
   `npm run og` needs `@resvg/resvg-js` (the only devDependency — `npm install` before the first run). The CI gate checks that every PNG exists **and matches the current data** (a fingerprint check via `site/og/manifest.json`), not just that it is present — so a changed count, flag or category fails the check until you run `npm run og`.
5. **Commit `data/providers.json` + the regenerated files in one PR.** The required "Dataset integrity" check fails if the derived files are out of sync, so the PR is complete only when both ship together.

### Also scan for what's new (monthly is enough)

- **Run `npm run discover`** — diffs OpenRouter's live `:free` catalog against the last snapshot and flags new free models plus publishers we don't list as a first-party provider (leads). Triage each lead against the [inclusion criteria](inclusion-criteria.md); `npm run discover -- --write` re-baselines the snapshot. See [sources.md](sources.md) for the wider source map.
- New providers or promos worth adding? Check the [inclusion criteria](inclusion-criteria.md), then add via a PR or the [new-provider form](../../issues/new?template=new-provider.yml).
- Watch the usual movers: Gemini limits, Cloudflare Neuron pricing, and any "trial credit" amounts (these change most often). The model *lists* (OpenRouter, Groq, Cerebras, etc.) are refreshed by `npm run models` — you only need to eyeball its diff.
- Backfill attribute fields still `null`: `openai_base_url`, and any missing `openai_compatible` / `modalities`.

### Optional: live probe

[`scripts/probe.mjs`](../scripts/probe.mjs) (`npm run probe`) live-tests each free tier with a real key from `process.env[env_key]` and writes `last_probed`/`probe_status`. Run it locally whenever you have keys handy (any subset; providers without a key are skipped):

```bash
npm run probe -- --write --auth-only
```

See [live-testing.md](live-testing.md) for setup.

## Layer 3 — agentic acceleration

The weekly pass is designed to be driven by an agent (e.g. a scheduled Claude Code / Freebuff session): run `npm run reverify`, read the dossiers in `.freebuff/reverify/`, verify the claims against the fetched docs, draft the `data/providers.json` edit, run `npm run build && npm test`, and open the PR for a human to merge. The reverify script is the agent's entry point; everything it needs lands in the local dossiers.

## Layer 4 — public security-data stewardship

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
- No dead `docs_url` in the batch (re-verification opens them anyway).
- Badge is green (oldest entry under 60 days).
- `npm test` passes and generated files are in sync.
- `npm run og` produces zero diffs — provider, collection and guide OGs match the current data.

---

_[← Docs index](README.md) · [Main README](../README.md)_
