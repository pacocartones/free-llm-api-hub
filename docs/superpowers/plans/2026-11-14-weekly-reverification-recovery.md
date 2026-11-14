# Weekly Reverification Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh issue #4 from current repository metadata and keep its weekly worklist current without claiming new provider verification.

**Architecture:** Add a dependency-free, preview-first issue publisher around the existing `stalenessWorklist(providers, now)` renderer. A narrowly privileged weekly workflow publishes only issue #4's generated body from trusted main; a separate one-time publication repairs the stale issue immediately. Provider evidence collection and dataset edits remain human work, with the existing clean-worktree handoff.

**Tech Stack:** Node.js >=18 (CI uses `.nvmrc`: 22), built-in Node test runner, GitHub CLI, SHA-pinned GitHub Actions, Markdown.

**Spec:** [Issue #4](https://github.com/pacocartones/free-llm-api-hub/issues/4), the assigned recovery brief, and the recovery contract below; existing evidence-handling requirements are in `docs/update-playbook.md` layers 1–3. No separate design file is created by this plan-only task.

## Global Constraints

- Planning changes only this file; implementation and GitHub mutation are later execution steps.
- Refresh metadata only: never change `data/providers.json`, `generated`, `last_verified`, `verified`, `data_policy.checked`, quotes, probe results, or generated site/badge artifacts merely to refresh the issue.
- No provider requests, credentials, dossiers, `--fetch-for-human-review`, model fetching, probing, or quote verification in the publisher/workflow. Provider prose remains human-only material outside agent contexts.
- Reuse `SLA_DAYS = 90`, `DUE_SOON_DAYS = 60`, `WEEKLY_CAP = 11`, and `MIN_AGE_DAYS = 28` through the existing renderer; do not fork its rules or batch selection.
- Only `pacocartones/free-llm-api-hub` issue `4` is writable. Preserve its title, state, labels, assignees, and comments; do not create/reopen an issue or post weekly comments.
- The entire existing issue body is the generated worklist. State explicitly that it is replaced on refresh; discussion belongs in comments, and checked boxes are not evidence of completed provider verification.
- Follow existing workflow conventions: SHA-pinned actions, `persist-credentials: false`, `.nvmrc`, root `permissions: {}`, and job-scoped minimum permissions. No new npm dependency.

## Review Focus

- Empty datasets and unchanged reruns: render an honest empty report and skip an identical issue body (Task 1).
- UTC boundaries and equal verification dates: use one injected clock for date header and report; retain renderer ordering and boundary behavior (Task 1).
- Closed/missing issues, PR objects, malformed API replies, and denied writes: fail visibly without fallback creation, reopening, or success claims (Task 1).
- Forks, non-main dispatch, and overlapping runs: never execute an issue-writing job on those refs/repositories; serialize valid runs (Task 2).
- Issue prose and provider links are data: pass JSON through stdin, never interpolate the body into shell/JavaScript source or follow its links (Tasks 1–2).

---

## Current evidence and recovery contract

Inspected on **2026-11-14**: worktree HEAD, `origin/main`, and live `refs/heads/main` all equal `031665426d385aa727b08a2defb651c1a41c9375`. Issue #4 is open with label `data`, no comments, and a body last refreshed **2026-10-10** (67 fresh, one unverified, empty weekly batch). No weekly worklist workflow exists. Current docs deliberately keep provider maintenance local, although daily Pages deploy, CodeQL, and Scorecard already have schedules; this plan introduces one explicit exception for issue metadata publication.

At that main revision, a **2026-11-14 UTC** report is **0 overdue, 0 due soon, 2 never verified, 66 fresh**, with **8** proposed rechecks: `datalab`, `google-gemini`, `groq`, `openrouter`, `cloudflare-workers-ai`, `cohere`, `cerebras`, `mistral`. There are 60 verified entries dated 2026-10-08; they reach age 90 on 2027-01-06 and become overdue after that. Unverified entries are `clarifai` and `ollama-cloud`. These are repository-derived observations, not independent confirmations of availability or commercial/privacy terms. Recompute from current main and actual UTC date at publication; never hard-code these observed counts into production logic.

Baseline: `node --test scripts/staleness.test.mjs scripts/reverify.test.mjs` passes **24/24**. Current rendering and local reverify select the same eight providers; no pacing redesign is required.

### Task 1: Build and test the preview-first issue publisher

**Files:**
- Create: `scripts/refresh-worklist.mjs` — render dated issue body; explicit `--write` publishes through `gh`.
- Create: `scripts/refresh-worklist.test.mjs` — fixed-clock rendering, mocked GitHub boundary, offline CLI checks.
- Modify: `package.json` — add `"worklist:refresh": "node scripts/refresh-worklist.mjs"`.
- Read/reuse: `scripts/staleness.mjs`, `scripts/staleness.test.mjs`, `scripts/reverify.mjs`, `scripts/lib/rules.mjs`, `scripts/lib/pacing.mjs`.

**Interfaces:**
- `worklistIssueBody(providers, now, sourceSha) -> string`: export a pure renderer; reject invalid clock or non-40-character lowercase hex commit SHA. Prepend UTC refresh date, immutable dataset link at `sourceSha`, and the exact notice `Worklist refresh only; provider claims were not re-verified.` to `stalenessWorklist(providers, now)`; end with one newline. State generated-body ownership in the preamble.
- `updateWorklistIssue(body, runGh) -> boolean`: export a synchronous publisher; `runGh(args: string[], input?: string) -> string` is injected for tests. GET `repos/pacocartones/free-llm-api-hub/issues/4`; require number 4, open state, string body, and no `pull_request`. Return false for identical body. Otherwise PATCH the same endpoint with `--input -` and JSON containing only `{ body }`; verify the returned number and body match, then return true. Throw on errors and mismatches.
- CLI: read repository `data/providers.json`, capture `new Date()` once, resolve `git rev-parse HEAD`, and render. Default prints preview and makes zero GitHub requests; only `--write` calls publisher. Reject unknown arguments. Invoke `gh` via `execFileSync` argument arrays, JSON stdin, UTF-8, a 30-second process timeout, and 1 MiB output cap; never log token values. Importing the module has no CLI side effects.

- [ ] **Step 1: Write failing tests.** Add named tests `dated body reuses the renderer without changing providers`, `empty and equal-date fixtures preserve renderer output`, `UTC header and report share one clock`, `invalid source SHA and invalid clock are rejected`, `identical issue skips PATCH`, `changed issue patches body only through stdin`, `closed missing malformed and PR targets fail closed`, `GET and PATCH failures propagate`, `mismatched PATCH response is not success`, and `preview CLI needs no gh and changes no dataset`. Assert `body.includes(stalenessWorklist(fixture, now))`, header date `2026-11-14`, exact immutable SHA link, byte-identical fixture serialization before/after, exact target endpoint, and `JSON.parse(input)` deep-equals `{ body }`. Use two clocks around UTC midnight and existing 60/61/90/91-day cases; inject all GitHub answers, never call the real API in tests.
- [ ] **Step 2: Run** `node --test scripts/refresh-worklist.test.mjs`. Expected: FAIL because the publisher module/exports do not yet exist.
- [ ] **Step 3: Implement** the two exported functions and guarded CLI above; add the package command. The report renderer imports only trusted local metadata; no import or call of provider-fetch machinery.
- [ ] **Step 4: Run** `node --test scripts/refresh-worklist.test.mjs scripts/staleness.test.mjs scripts/reverify.test.mjs`. Expected: all pass; no external requests and no dataset writes. Run `npm run worklist:refresh` and inspect the dated preview; it must not require GitHub authentication.
- [ ] **Step 5: Commit** only these three files with `feat: add preview-first weekly worklist publisher`.

### Task 2: Schedule metadata publication and document its boundary

**Files:**
- Create: `.github/workflows/weekly-worklist.yml` — weekly and manual main-only metadata publication.
- Modify: `scripts/refresh-worklist.test.mjs` — workflow contract checks, following `scripts/refresh-stars.test.mjs` text-inspection conventions.
- Modify: `scripts/staleness.mjs` — opening comment only: local renderer also feeds the scheduled issue publisher.
- Modify: `.github/workflows/verify.yml` — correct opening comment claiming no scheduled workflow; no behavior change to integrity checks.
- Modify: `docs/update-playbook.md` — introduction, cadence, weekly batch instructions, refresh recovery and human verification distinction.
- Modify: `docs/freshness-sla.md` — §4 issue publication and §8 schedule invariant, explicitly distinguish worklist publication from verification/badge regeneration.
- Modify: `docs/architecture.md` — pipeline list and npm scripts list for the publisher.

**Interfaces:**
- Workflow consumes Task 1 CLI `node scripts/refresh-worklist.mjs --write` with `GH_TOKEN: ${{ github.token }}` only on the publication step.
- Triggers: `schedule` cron **`17 9 * * 1`** and `workflow_dispatch: {}`; UTC, Monday 10:17 Madrid winter / 11:17 summer, best effort. Job condition requires exact repository `pacocartones/free-llm-api-hub` and `github.ref == 'refs/heads/main'`. Concurrency group `weekly-worklist`, `cancel-in-progress: false`; job timeout **5 minutes**.
- Root permissions `{}`; publication job `contents: read`, `issues: write`; checkout `ref: main`, `persist-credentials: false`; reuse checkout SHA `3d3c42e5aac5ba805825da76410c181273ba90b1` and setup-node SHA `949feb2413d6458794dcd2491c4babbbce0c15c1` with `.nvmrc` (reconfirm existing pins when implementing). Resolve provenance from checked-out HEAD, not stale event SHA. No install is needed for the dependency-free publisher/focused tests.

- [ ] **Step 1: Add failing workflow contract tests.** Assert both triggers, exact cron, repository/main guard, concurrency, timeout, pinned actions, disabled persisted credentials, `.nvmrc`, job-scoped permissions, focused test step before publication, and token available only to publication. Assert no `pull_request`, `pull_request_target`, external-provider command, content-write permission, or dependency install in this workflow. Assert the publisher command has no expression interpolation inside executable shell text.
- [ ] **Step 2: Run** `node --test scripts/refresh-worklist.test.mjs`. Expected: FAIL for missing workflow contract.
- [ ] **Step 3: Create** the workflow above. Run `node --test scripts/refresh-worklist.test.mjs scripts/staleness.test.mjs` before its publication step. Serialize all scheduled/manual refreshes and surface errors through a failed run; never suppress publisher failures.
- [ ] **Step 4: Update** the listed comments/docs. Explain schedule delay/disablement recovery using preview then explicit `--write`, issue body ownership and checkbox reset, immutable dataset provenance, and that a current worklist does not clear a verification backlog or prove any provider fact. Retain the human-only dossier and clean-worktree handoff verbatim in substance. Do not describe metadata publication as a completed weekly provider pass.
- [ ] **Step 5: Run** `node --test scripts/refresh-worklist.test.mjs scripts/staleness.test.mjs scripts/reverify.test.mjs`, `npm ci --ignore-scripts`, `npm test`, and `npm run check`. Expected: all pass, integrity/generated gates remain satisfied. Inspect `git diff --check` and `git status --short`; exclude incidental date-relative badge/build changes. New `*.test.mjs` is discovered automatically by `scripts/lib/test-files.mjs`; no test list edit.
- [ ] **Step 6: Commit** only Task 2 files with `ci: refresh the weekly verification issue from main` and submit the focused code/workflow PR for review.

### Task 3: Repair issue #4 once and verify the real workflow

**Files:** No repository files. Use an operating-system temporary file for the reviewable preview if needed; never commit dated issue bodies.

**Interfaces:** Consumes the reviewed publisher from Tasks 1–2, current trusted main, issue #4, and the actual UTC execution date. Produces one updated issue body and a verified weekly workflow run; no provider facts are edited.

- [ ] **Step 1: Prepare a concrete preview.** Once code is reviewed/merged, update a clean checkout of current main; record `git rev-parse HEAD`, run `npm run worklist` and `npm run worklist:refresh`, and read issue #4 again. Compare the preview against the renderer and dataset, including both unverified entries and the notice. The November 14 snapshot above is a diagnostic reference, not a fixture to publish later.
- [ ] **Step 2: Mutate issue #4 explicitly.** Run `node scripts/refresh-worklist.mjs --write` with authorized `GH_TOKEN`/existing `gh` authentication. This is the one-time external write; do not execute it during planning, tests, or PR preparation. Do not use an automatic closing reference such as `Fixes #4` in the PR: this recurring worklist remains open.
- [ ] **Step 3: Read back** issue #4 via the GitHub connector or `gh api repos/pacocartones/free-llm-api-hub/issues/4`. Confirm exact body, correct UTC date and source SHA, unchanged title/state/labels/assignees/comments, no new provider-verification dates, and unchanged repository worktree. Rerun the publisher on the same day and source SHA; expected: unchanged/no PATCH.
- [ ] **Step 4: Dispatch and observe** `.github/workflows/weekly-worklist.yml` on main after merge. Check it completes successfully, uses main provenance, and leaves the issue body correct. No success claim based only on YAML/static tests. The first actual Monday run remains an operational check; GitHub schedules may be delayed or disabled and must not be promised as exact-time delivery.

## Manual provider verification remains separate

The eight proposed rechecks, Clarifai's current reachability, Ollama Cloud's eligibility/limits, and every price/quota/access/privacy/retention/no-expiry claim require the provider's own current sources and a human reviewer under `docs/update-playbook.md`. Historical notes copied from `providers.json` are not new observations. Network success, age arithmetic, a checked box, or a successful publisher run never establishes those facts. If a human later authors supported dataset changes, transfer only those edits into a fresh dossier-free worktree and run the existing build/OG/tests workflow in a separate provider-data PR.

## Completion and residual risks

Done means reviewed code and docs are merged, issue #4 reflects current main and actual UTC date, a real manual workflow run succeeds, and provider verification metadata is unchanged. Weekly issue publication repairs visibility, not the human maintenance backlog. Residual risks are schedule delay/disablement, token permission changes, human edits to the generated body being replaced, and later changes to pacing/rendering behavior; visible workflow failures, manual recovery, body-ownership notice, immutable provenance, and shared renderer tests address them without inventing provider evidence.
