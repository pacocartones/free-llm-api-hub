# Update playbook

How this list stays current — the routine that keeps the freshness badge green. Provider verification and dataset regeneration run locally, on demand, on a machine you control. Two maintenance jobs run in Actions: [weekly issue publication](../.github/workflows/weekly-worklist.yml) replaces issue #4's generated worklist from repository metadata without visiting provider sources, and the report-only [source watch](#source-watch) re-reads the pages cited in `data/quotes.json` and lists quotes to re-check. Neither verifies a provider claim or edits data.

Before the first pass in a clone, install the locked local development tools without running package lifecycle scripts:

```bash
npm ci --ignore-scripts
```

## Cadence

- **Weekly human verification:** aim for one pass a week (Mondays ~10:00 Madrid works well); `npm run reverify` proposes at least 6 entries a week (the approved pace) and more only when the 90-day SLA needs it. Publishing a current worklist does not complete this pass or clear the backlog.
- **Weekly issue publication:** Mondays at 09:17 UTC (10:17 Madrid in winter / 11:17 in summer), best effort. The main-only workflow refreshes issue #4 from current main and the actual UTC date; age arithmetic changes even when the dataset does not. Schedules can be delayed or disabled; use the recovery procedure below.
- **Weekly source watch:** Mondays at 06:41 UTC, best effort, report-only. See [Source watch](#source-watch).
- **Freshness SLA:** every verified entry is re-confirmed against the provider's own docs within **90 days**. The badge is graded on the *oldest* entry against that SLA, so it turns amber the moment one row goes past 60 days and red the moment one goes past 90 — it slips before the list does.

## Layer 1 — the re-verification batch (local script)

[`scripts/reverify.mjs`](../scripts/reverify.mjs) (`npm run reverify`) picks the same batch as the worklist: the oldest verifications, at least 6 a week. Its default mode prints the worklist without fetching remote content. A human can explicitly fetch each provider's `docs_url` into the operating system's temporary `free-llm-api-hub/reverify-human-only/` directory, outside the repository worktree:

```bash
npm run reverify                                  # safe worklist; no remote fetch
npm run reverify -- --batch 12                    # override the worklist size
npm run reverify -- --fetch-for-human-review      # human reviewer only: fetch dossiers
```

The script never edits the data. Dossiers contain provider-controlled prose and are strictly human-review material: never paste them into an LLM context or let a tool-capable agent read them. A human compares the fetched docs against `data/providers.json` and drafts the edit. This is a procedural trust boundary that reduces accidental exposure, not filesystem-enforced isolation.

### Paced re-verification batches

Start each weekly pass with `npm run worklist`. It prints this week's oldest verified providers — a batch picked by `weeklyPlan` in `scripts/lib/pacing.mjs`: at least 6 a week (the approved pace), at most 11, more than 6 only when the 90-day SLA needs it. The freshness SLA is spread across small, regular batches instead of becoming a large end-of-quarter cleanup.

**Staggering a cohort.** When many entries share a verification date (45 were verified on 2026-11-19 and 2026-11-20), they would all become due in the same week. The worklist's **📊 Freshness histogram** shows how many entries reach day 61 and day 91 in each of the next 16 weeks and marks with ⛰️ any week with more than 8 becoming due. While such a week exists, the batch pulls its entries forward, oldest first, even before they are 28 days old (never younger than 7 days), so the cohort is re-checked a few at a time. Do the whole batch each week, as one pull request, and the ⛰️ weeks disappear; skip a week and the following batches stay at 6, so the gap shows up as amber or overdue entries in the histogram. The rules are in [freshness-sla.md](freshness-sla.md#4-the-worklist-npm-run-worklist).

The weekly check that every quote in `data/quotes.json` is still on its page ("quote drift") is not part of the worklist publisher, which deliberately never visits provider pages: it is the separate [source watch](#source-watch).

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

`last_verified` records a completed review of the entry's [core facts](methodology.md#what-verified-means), done either by a human maintainer or by the agent-assisted check described in Layer 3 and approved by the maintainer who merges it. A partial field correction leaves `verified` and `last_verified` unchanged unless that review is also completed. Fetch results, generated files and passing automated checks on their own do not establish verification.

1. **Open the provider's own docs** (the `docs` link in the item). Third-party summaries don't count.
2. **Compare against `data/providers.json`:** free tier, rate limits, credit amount/expiry, and the catches (`card_required`, `phone_required`, `commercial_ok`, `openai_compatible`); re-read `trains_on_prompts`, `retention`, and [`data_policy`](../data/schema.json), including its `source` and `checked` date, on the provider's own page, the one the row's `source` points to (usually its terms of service or privacy policy).
3. **Update the entry:**
   - **Record flag checks:** for every tri-state flag you re-read, add or refresh its `field_checks` entry with today's date and the pages read: `stated` (with the sentence in `quote`) when a page says it, otherwise the reason it stays `null` (`source_silent`, `needs_account`, `sources_disagree`). A reason never goes on a known value; if no current page states a known value, set it to `null` with its reason (see [comparison-dimensions.md](comparison-dimensions.md#why-a-flag-holds-its-value-field_checks)).
   - **Re-read `data_policy`:** when the provider's official page states at least one policy detail, set `data_policy.checked` to today whenever the policy information is re-read, even if its value is unchanged. If the page states neither policy detail, leave `data_policy` as `null`; do not guess `false` or record `source` and `checked`. This date records when the policy was checked, separately from `last_verified`, which tracks core-fact verification. If the quoted sentence changes, run `npm run quotes:add -- <slug>`; `npm run verify-quotes` re-reads the quoted pages to confirm the sentences are still present (see [`docs/quotes.md`](quotes.md)).
   - Confirmed → set the current numbers, `verified: true`, `last_verified` = today.
   - Changed → correct the numbers, same as above.
   - Gone → remove the entry (note it in a changelog fragment, `changes/unreleased/<short-name>.md`, see [CONTRIBUTING.md](../CONTRIBUTING.md)) or, if the free tier ended, move the note to the README's "Notably NOT free" section.
   - Couldn't confirm → `verified: false`, `last_verified: null`, explain in `notes`.
   - **Leave `generated` alone.** It is the release date (top of `data/providers.json`) and moves only with `version` in a release pull request (`npm run release:prepare`, see [RELEASING.md](../RELEASING.md)); the integrity gate fails a data pull request that moves it. Dates after today in UTC are rejected.
4. **Regenerate and check (same PR):**
   ```bash
   npm run build      # README, exports, collections, site payload (the badge goes to site/, not committed)
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

The [`monthly-checks.yml`](../.github/workflows/monthly-checks.yml) workflow runs this check, `verify-quotes` and the internal link check on the 1st of each month and opens a `Monthly source check` issue when one fails; treat a 403 or timeout from the runner as a lead to re-check from a normal connection. Run `npm run check-sources` when you want to check the source links themselves. It collects each provider's `docs_url` and the external links in [`docs/sources.md`](sources.md), requests each once with a bounded `GET` (a 2xx answer counts as reachable even when its body is too large to read or compressed, because the body is not needed), waits 15 seconds at most, and sends at most two requests per second with the `free-llm-api-hub-source-check` User-Agent. Requests use the repository's public-URL transport, which rejects private destinations and revalidates DNS and every redirect.

The output starts with `Checked N source URLs.`. If every URL answers, it prints `✓ no dead or unreachable sources found.` and exits 0. Otherwise it prints a Markdown table with these columns and exits 1:

| status | source | url | wayback |
| --- | --- | --- | --- |
| HTTP status, `timeout`, or the fetch error | the data file and slug, or `docs/sources.md` | the URL checked | the closest available Wayback snapshot, or `-` |

The script writes nothing to the repository and is not part of `npm test` or CI, so a provider or Archive.org outage never fails a build.

### Source watch

[`source-watch.yml`](../.github/workflows/source-watch.yml) runs `scripts/source-watch.mjs` every Monday at 06:41 UTC (and on manual dispatch from `main`). It reads every distinct page cited in `data/quotes.json` once, the way `npm run quotes:add` reads it (same headers and User-Agent naming this repository, same `html-text-v1` / `pdf-text-v1` normalisation), and gives each quote one status:

| Status | Meaning | What to do |
| --- | --- | --- |
| present | the quoted text is on the page and the page text still matches `page_sha256` | nothing |
| changed | the quoted text is still on the page, but the page text changed (hash differs) | nothing; low priority, listed folded in the issue |
| missing | the page came, in the recorded language, and the quoted text is no longer in it | re-check the claim and the quote (below) |
| fetch error | HTTP error, timeout, a page that needs scripts, or another language | only flagged after **2 runs in a row** (404/410 at once), because CDNs often block GitHub runners |

It publishes **one** issue, "Source watch: quotes to re-check": missing quotes grouped by provider, then flagged fetch errors. The body is replaced on every run (keep discussion in comments); the issue is reopened when something needs a person and closed when a run is clean. The two-run memory is a hidden `source-watch-state` comment at the end of that body (URLs and counts only); the full report is kept as the `source-watch-report` run artifact for 90 days. Nothing is written to the repository, no pull request is opened, no secret is used, and the issue lists our own ids and URLs, never page text. The job has `contents: read` and `issues: write` only.

Requests are polite: at most 4 hosts at a time, one request at a time per host, a 0.7 s pause before each, 30 s timeout, through the repository's public-URL transport.

When a quote is **missing**: open the source page from a normal connection. If the provider changed the policy, follow the weekly pass for that row (update `data/providers.json` with a supported edit), then run `npm run quotes:add -- <slug>` to record the new quote, hash and date. If the text only moved to another page, record that page as the source. A **flagged fetch error** is a lead, not a verdict: re-check from a normal connection before changing anything. A dry run prints the issue body without publishing:

```sh
node scripts/source-watch.mjs                  # whole register; add --only <slug> for one provider
node scripts/source-watch.mjs --json report.json
```

### Optional: live probe

[`scripts/probe.mjs`](../scripts/probe.mjs) (`npm run probe`) live-tests each free tier with a real key from `process.env[env_key]` and writes `last_probed`/`probe_status`. Run it locally whenever you have keys handy (any subset; providers without a key are skipped):

```bash
npm run probe -- --write --auth-only
```

See [live-testing.md](live-testing.md) for setup.

## Layer 3 — capability boundary

Remote documentation and trusted repository actions are separate phases. The default is that a human reviewer fetches and reads a dossier, decides which claims it supports, and makes the corresponding `data/providers.json` edit.

**Agent-assisted re-verification (owner decision, 2026-11-20).** The owner may instead ask an agent to check the official sources. The page text is then read only by isolated, read-only web fetchers that cannot edit files or run commands; they return short verbatim quotes with their URLs, and page content is treated as data, never as instructions. The agent changes a field only where a quote supports it, and sets `last_verified` only where the core facts are confirmed. The pull request says the check was agent-assisted and lists the quotes, and a maintainer approves every merge. Dossiers fetched by `--fetch-for-human-review` stay human-only.

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
