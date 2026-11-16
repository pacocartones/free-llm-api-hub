# Update playbook

How this list stays current — the routine that keeps the freshness badge green. Provider verification and dataset regeneration run locally, on demand, on a machine you control. The one maintenance exception is [weekly issue publication](../.github/workflows/weekly-worklist.yml): Actions replaces issue #4's generated worklist from repository metadata without visiting provider sources or verifying any provider claim.

Before the first pass in a clone, install the locked local development tools without running package lifecycle scripts:

```bash
npm ci --ignore-scripts
```

## Cadence

- **Weekly human verification:** aim for one pass a week (Mondays ~10:00 Madrid works well); `npm run reverify` sizes its batch to clear the 90-day SLA without a cliff. Publishing a current worklist does not complete this pass or clear the backlog.
- **Weekly issue publication:** Mondays at 09:17 UTC (10:17 Madrid in winter / 11:17 in summer), best effort. The main-only workflow refreshes issue #4 from current main and the actual UTC date; age arithmetic changes even when the dataset does not. Schedules can be delayed or disabled; use the recovery procedure below.
- **Freshness SLA:** every verified entry is re-confirmed against the provider's own docs within **90 days**. The badge is graded on the *oldest* entry against that SLA, so it turns amber the moment one row goes past 60 days and red the moment one goes past 90 — it slips before the list does.

## Layer 1 — the re-verification batch (local script)

[`scripts/reverify.mjs`](../scripts/reverify.mjs) (`npm run reverify`) picks the oldest verifications (sized to clear the SLA). Its default mode prints the worklist without fetching remote content. A human can explicitly fetch each provider's `docs_url` into the operating system's temporary `free-llm-api-hub/reverify-human-only/` directory, outside the repository worktree:

```bash
npm run reverify                                  # safe worklist; no remote fetch
npm run reverify -- --batch 12                    # override the worklist size
npm run reverify -- --fetch-for-human-review      # human reviewer only: fetch dossiers
```

The script never edits the data. Dossiers contain provider-controlled prose and are strictly human-review material: never paste them into an LLM context or let a tool-capable agent read them. A human compares the fetched docs against `data/providers.json` and drafts the edit. This is a procedural trust boundary that reduces accidental exposure, not filesystem-enforced isolation.

### Paced re-verification batches

Start each weekly pass with `npm run worklist`. It prints this week's oldest verified providers — a batch sized by `scripts/lib/pacing.mjs` (at most 11 a week), so the 90-day freshness SLA is spread across small, regular batches instead of becoming a large end-of-quarter cleanup. If the worklist flags a cliff of entries that share a verification date, take the larger batch it recommends.

[Issue #4](https://github.com/pacocartones/free-llm-api-hub/issues/4) publishes the same renderer with a UTC refresh date and an immutable link to the checked-out dataset commit. Its **entire body is generated and replaced on refresh**, including resetting checkboxes. Keep discussion in comments. Checked boxes are not evidence of completed verification; only human-reviewed, supported dataset edits establish it.

Run `npm run reverify` for the normal weekly worklist, or pass its size explicitly when clearing a larger one. A human reviewer then adds `--fetch-for-human-review` to fetch primary sources outside the checkout.

Keep one batch in one focused PR. A human reviews the dossiers and updates `data/providers.json`. Only after that trusted edit exists may local automation run:

```bash
npm run build && npm run og && npm test
```

Commit the data change and generated files together, and open one PR for that batch.

### Recover a stale issue worklist

Use a clean checkout of current trusted main. Preview first, compare the report with `npm run worklist`, then explicitly publish using existing `gh` authentication (or `GH_TOKEN`):

```bash
npm run worklist
npm run worklist:refresh                  # preview only; no GitHub access required
npm run worklist:refresh -- --write       # replace only issue #4's body
```

The publisher reads the dataset, captures one clock, and resolves provenance from `git rev-parse HEAD`. It skips identical bodies and fails visibly on missing/closed issues, pull requests, invalid API replies or denied writes; it never creates or reopens an issue. It preserves the title, state, labels, assignees and comments. A maintainer can also manually dispatch `weekly-worklist.yml` on main and inspect the run result; forks and other refs cannot publish. Weekly and manual runs are serialized.

Publication never changes `generated`, `last_verified`, `verified`, `data_policy.checked`, quotes, probes or site/badge artifacts. It makes no provider requests and collects no evidence. A current issue date does not prove availability, prices, quotas, access, privacy, retention or no-expiry claims; those remain the human review work below.

## Layer 2 — the weekly pass

For each provider on the worklist (`npm run worklist`, or just the reverify batch):

1. **Open the provider's own docs** (the `docs` link in the item). Third-party summaries don't count.
2. **Compare against `data/providers.json`:** free tier, rate limits, credit amount/expiry, and the catches (`card_required`, `phone_required`, `commercial_ok`, `openai_compatible`); re-read `trains_on_prompts`, `retention`, and [`data_policy`](../data/schema.json), including its `source` and `checked` date, on the provider's own page, the one the row's `source` points to (usually its terms of service or privacy policy).
3. **Update the entry:**
   - **Re-read `data_policy`:** when the provider's official page states at least one policy detail, set `data_policy.checked` to today whenever the policy information is re-read, even if its value is unchanged. If the page states neither policy detail, leave `data_policy` as `null`; do not guess `false` or record `source` and `checked`. This date records when the policy was checked, separately from `last_verified`, which tracks core-fact verification. If the quoted sentence changes, run `npm run quotes:add -- <slug>`; `npm run verify-quotes` re-reads the quoted pages to confirm the sentences are still present (see [`docs/quotes.md`](quotes.md)).
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
   `npm run og` uses `@resvg/resvg-js`; JSON Schema validation also uses locked development tooling. Run `npm ci --ignore-scripts` before the first pass. The CI gate checks that every PNG exists **and matches the current data** (a fingerprint check via `site/og/manifest.json`), not just that it is present — so a changed count, flag or category fails the check until you run `npm run og`.

`npm run build` also rewrites `derived-fingerprints.json` - the sha256 pin of every gitignored build output under `site/` (see [architecture.md](architecture.md)). Commit it with the rest; the drift gate fails if it is missing or out of sync. The git-log-derived files (`updates.html`, `feed.xml`, `api/v1/history.json`) are deliberately excluded from the pin: their content embeds the commit hash/subject or dates, so it shifts across a squash merge — they are regenerated on every deploy.
5. **Commit `data/providers.json` + the regenerated files in one PR.** The required "Dataset integrity" check fails if the derived files are out of sync, so the PR is complete only when both ship together.

### Also scan for what's new (monthly is enough)

- **Run `npm run discover`** — diffs OpenRouter's live `:free` catalog against the last snapshot and flags new free models plus publishers we don't list as a first-party provider (leads). Triage each lead against the [inclusion criteria](inclusion-criteria.md); `npm run discover -- --write` re-baselines the snapshot. See [sources.md](sources.md) for the wider source map.
- New providers or promos worth adding? Check the [inclusion criteria](inclusion-criteria.md), then add via a PR or the [new-provider form](../../issues/new?template=new-provider.yml).
- Watch the usual movers: Gemini limits, Cloudflare Neuron pricing, and any "trial credit" amounts (these change most often). The model *lists* (OpenRouter, Groq, Cerebras, etc.) are refreshed locally by `npm run models -- --write` (there is no scheduled backfill job) — then `npm run build && npm run og && npm test`, commit and PR; you only need to eyeball which models moved.
- Backfill attribute fields still `null`: `openai_base_url`, and any missing `openai_compatible` / `modalities`.

### Optional: external source sweep

Run `npm run check-sources` when you want to check the source links themselves. It collects each provider's `docs_url` and the external links in [`docs/sources.md`](sources.md), requests each once with a bounded `GET`, waits 15 seconds at most, and sends at most two requests per second with the `free-llm-api-hub-source-check` User-Agent. Requests use the repository's public-URL transport, which rejects private destinations and revalidates DNS and every redirect.

The output starts with `Checked N source URLs.`. If every URL answers, it prints `✓ no dead or unreachable sources found.` and exits 0. Otherwise it prints a Markdown table with these columns and exits 1:

| status | source | url | wayback |
| --- | --- | --- | --- |
| HTTP status, `timeout`, or the fetch error | the data file and slug, or `docs/sources.md` | the URL checked | the closest available Wayback snapshot, or `-` |

The script writes nothing to the repository and is not part of `npm test` or CI, so a provider or Archive.org outage never fails a build.

### Optional: live probe

[`scripts/probe.mjs`](../scripts/probe.mjs) (`npm run probe`) live-tests each free tier with a real key from `process.env[env_key]` and writes `last_probed`/`probe_status`. Run it locally whenever you have keys handy (any subset; providers without a key are skipped):

```bash
npm run probe -- --write --auth-only
```

See [live-testing.md](live-testing.md) for setup.

## Layer 3 — capability boundary

Remote documentation and trusted repository actions are separate phases. Only a human reviewer may fetch and read a dossier, decide which claims it supports, and make the corresponding `data/providers.json` edit.

After that human-authored edit exists, copy or commit only that edit into a fresh worktree that has never contained review dossiers. An agent may perform repository-local mechanical work there, but it must not receive the temporary dossier directory, provider pages, or the original review checkout. Existing clones may still contain legacy `.freebuff/reverify/` or `.freebuff/reverify-human-only/` directories; never use such a clone for the agent phase. This clean-worktree handoff is required because a filename, warning, or `.gitignore` rule is not a capability boundary.

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

This is the human provider-verification pass. A successful metadata publication alone satisfies none of these verification requirements.

- Worklist 🔴 overdue count is back to **0**.
- No dead `docs_url` in the batch (re-verification opens them anyway).
- Badge is green (oldest entry under 60 days).
- `npm test` passes and generated files are in sync.
- `npm run og` produces zero diffs — provider, collection and guide OGs match the current data.
- Every provider touched had its `data_policy` re-read or explicitly left as it was.

---

_[← Docs index](README.md) · [Main README](../README.md)_

## Draft the next changelog

Before editing `[Unreleased]`, run `npm run changelog-draft` from a full clone at the repository root. It prints a deterministic Markdown draft since the highest reachable coherent dataset SemVer tag (`vX.Y.Z`) from the explicitly fetched origin-tag namespace (fetch instructions below); MCP tags are ignored. It reuses the provider-history miner and the field-level `changes.json` event shape, without the API feed's 12-week cutoff. Copy and edit the output: add removals, schema and untracked-field changes, merged PR references and `Thanks @author` credits from the PR author. Preserve existing contributor credits. The command writes no files and neither bumps a version nor publishes anything. See [release preparation](release-preparation.md).
