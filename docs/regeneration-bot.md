# Regeneration bot

`.github/workflows/regenerate.yml` rebuilds the derived files (README tables, `collections/`, the committed site pages, `site/providers.csv`, `site/sitemap.xml`, `derived-fingerprints.json`, OG images) after every push to `main` that changes a canonical input, using the code already on `main`. The goal is that a data pull request only has to change `data/` plus a changelog fragment, so open data pull requests stop conflicting on generated files.

It rolls out in three steps, controlled by the repository variable `REGEN_MODE`:

| Step | `REGEN_MODE` | What happens | Risk to `main` |
|---|---|---|---|
| 0 | unset (default) or anything else | The workflow starts and skips everything after the gate. | None |
| 1. Shadow | `shadow` | Rebuilds after each merge (and nightly). With the GitHub App configured it opens or updates a **draft** pull request from `chore/regenerate-derived`; without it, it only reports the diff in the run summary and as the `regen-patch` artifact. The pull-request drift gate in `verify.yml` stays blocking. | None: nothing is pushed to `main` |
| 2. Push | `push` | Commits the regenerated files straight to `main` as the App. The drift gate in `verify.yml` blocks only hand-edited derived files, release pull requests that are not regenerated and drift outside the allowlist; `pages.yml` deploys after the bot; Lighthouse skips the bot's pushes (see [What push mode changes](#what-push-mode-changes)). | Needs the ruleset bypass below |

**Until step 2 is live, contributors keep regenerating locally** exactly as [CONTRIBUTING.md](../CONTRIBUTING.md) says. **In push mode, data pull requests no longer regenerate or commit derived files:** they change `data/` plus a changelog fragment, and the bot commits the derived files to `main` after the merge. During shadow mode `main` is already in sync when a pull request merges, so every shadow pull request is a determinism bug in the bot's environment (fonts, Node, git history). Close it, note the cause, and fix it before moving on. Exit criterion for shadow: at least 7 days and 10 merges with no shadow pull request.

## How it is built

- **Jobs.** `gate` (mode + loop guard) → `build` (read-only token, no secrets: `npm ci --ignore-scripts`, validate, build, `check-og || og`, allowlist, second build must change nothing, `npm test`) → `publish` (Environment `regenerate`, installs nothing, re-checks the allowlist, then mints a one-hour App token and commits) → `report` (opens or comments on one "Regeneration bot failed" issue).
- **Allowlist.** Every changed, added or deleted path must be a generated target: `isGeneratedOutput()` from [scripts/generated-targets.mjs](../scripts/generated-targets.mjs) or `site/og/**` (except `*.js`/`*.css`). Otherwise the run fails before any token exists and nothing is written. Logic in [scripts/lib/regenerate.mjs](../scripts/lib/regenerate.mjs), tested in `scripts/regenerate.test.mjs`.
- **Loop prevention.** (1) The `paths` filter holds no generated target (`!data/probe-report.json`). (2) The gate skips a push made by the App, by `GITHUB_TOKEN`, or whose tip commit starts with `chore(generated):` (the subject of every bot commit). (3) The build is idempotent, so a repeated run finds nothing to commit.
- **Concurrency.** One run at a time (`group: regenerate`, never cancelled); each run builds the current tip of `main`, so the pending run covers every merge in between. In push mode a rejected push is never forced: if `main` moved, the next run (or the nightly one) regenerates on the new tip; if `main` did not move, the run fails and points here.
- **Why a GitHub App and not `GITHUB_TOKEN`.** This repository does not allow Actions to create pull requests (`can_approve_pull_request_reviews: false`), a pull request opened with `GITHUB_TOKEN` does not run the required checks, and `GITHUB_TOKEN` can never be a ruleset bypass actor for step 2. The App's pull requests run every check, its commits are signed by `<slug>[bot]` (not a maintainer identity, so `commit policy` applies only the branch rule, and `chore/regenerate-derived` passes it), and its key only exists inside the `publish` job.
- **Not recommended:** turning on *Settings → Actions → General → Allow GitHub Actions to create and approve pull requests*. It would also let any workflow approve pull requests, its pull requests would still run no checks, and it does not help step 2. The workflow does not use it.

## Pull-request preview (no App needed)

`.github/workflows/regenerate-preview.yml` is the pull-request side of shadow mode. On every pull request that touches data, scripts, docs or derived files it rebuilds on the pull request's merge commit and, without ever failing on drift:

- lists the derived files a fresh build changes in the run summary and uploads them as the `regen-preview-patch` artifact (7 days), so a contributor without Node, or the maintainer, can `git apply --binary regen-preview.patch` on the pull request branch (it is cut against the merge commit, so it applies cleanly while the branch is up to date with `main`);
- says what the drift gate planned for step C would decide: `in-sync`, `bot-would-regenerate` (only derived files the pull request did not touch are stale: informative after the switch), `would-block-hand-edit` (the pull request edits derived files that do not match the build) or `would-block-release` (a release pull request must ship fully regenerated). The logic is `previewVerdict()` in [scripts/lib/regenerate.mjs](../scripts/lib/regenerate.mjs); paths outside the allowlist raise a warning.

It is not a required check and changes nothing about the blocking gate in `verify.yml`; in push mode that gate makes the same decision with the same function (`driftGate()`), so the preview's verdict tells a contributor in advance what *Dataset integrity* will say. It uses only the `pull_request` event with a read-only token: no secret, no App, nothing pushed or commented, so it is safe for pull requests from forks. Counting its verdicts over the shadow week is the audit §6 of the ADR asks for before the gate is relaxed.

## What the maintainer clicks

### A. Shadow mode, report only (no App)

1. Merge the pull request that adds `regenerate.yml`.
2. Repository → *Settings → Secrets and variables → Actions → Variables → New repository variable*: `REGEN_MODE` = `shadow`.

Each run's summary then shows "Derived files already in sync with main" or the diff; the patch stays 7 days as an artifact. Nothing is written anywhere.

### B. Shadow mode with draft pull requests (GitHub App)

1. **Create the App:** your account → *Settings → Developer settings → GitHub Apps → New GitHub App*.
   - GitHub App name: `free-llm-api-hub-regen` (must be unique on GitHub; it becomes the slug and the login `free-llm-api-hub-regen[bot]`).
   - Homepage URL: `https://github.com/pacocartones/free-llm-api-hub`.
   - *Webhook*: untick **Active**.
   - *Repository permissions*: **Contents: Read and write**, **Pull requests: Read and write** (Metadata: Read-only is automatic). Nothing else.
   - *Where can this GitHub App be installed?* **Only on this account** → *Create GitHub App*.
2. On the App's page: copy the **Client ID**; under *Private keys* click **Generate a private key** (a `.pem` file downloads; keep it to yourself).
3. *Install App* (left menu) → `pacocartones` → **Only select repositories** → `free-llm-api-hub` → *Install*.
4. Repository → *Settings → Environments → New environment* named `regenerate`:
   - *Deployment branches and tags* → **Selected branches and tags** → *Add deployment branch or tag rule* → `main`.
   - *Environment secrets → Add environment secret*: `REGEN_APP_PRIVATE_KEY` = the whole content of the `.pem` file. Then delete the local `.pem` (or move it to your password manager).
5. Repository → *Settings → Secrets and variables → Actions → Variables*: add `REGEN_APP_CLIENT_ID` = the Client ID and `REGEN_APP_SLUG` = `free-llm-api-hub-regen`; set `REGEN_MODE` = `shadow` if not done in A.
6. Optional check: *Actions → Regenerate derived files → Run workflow* on `main`. Expected: green, and "already in sync" in the summary.

### C. Later: switch to direct push (after the shadow exit criterion)

The switch itself is one variable, but it needs the protection of `main` to move from classic branch protection to rulesets, because classic protection offers no bypass for an App on a personal repository. Rulesets and classic protection add up, so create the rulesets first and delete the classic rule last.

1. Repository → *Settings → Rules → Rulesets → New ruleset → New branch ruleset* **"main integrity"**: Enforcement **Active**; *Target branches* → **Include default branch**; rules **Restrict deletions** and **Block force pushes**; **bypass list empty**. *Create*.
2. *New branch ruleset* **"main merge gate"**: Enforcement **Active**; target the default branch;
   - **Require a pull request before merging**: required approvals 0, tick **Require conversation resolution before merging**;
   - **Require status checks to pass**: tick **Require branches to be up to date before merging**; add `Dataset integrity`, `Windows tests`, `commit policy`, `Lighthouse accessibility and performance`, `Analyze (javascript-typescript)`;
   - *Bypass list → Add bypass → Apps* → `free-llm-api-hub-regen`, mode **Always allow**. If the App is not offered, stop here: the fallback is a deploy key and needs a workflow change.
   - *Create*.
3. Open a throwaway pull request and check the five checks still show as *Required*. Then *Settings → Branches* → delete the classic rule for `main`, and confirm `gh api repos/pacocartones/free-llm-api-hub/rules/branches/main` lists the rules of both rulesets.
4. Merge the cut-over pull request. It changes nothing while `REGEN_MODE` is not `push`: every relaxation below is behind that value.
5. Set `REGEN_MODE` = `push`. The next data pull request should show *Dataset integrity* green without derived files, and after its merge one `chore(generated):` commit by `free-llm-api-hub-regen[bot]` followed by one *Deploy site* run.

## What push mode changes

Everything here is keyed on `REGEN_MODE` = `push`; with `shadow`, `off` or no value the workflows behave as before the cut-over.

- **Contributors.** A data pull request changes `data/` (and a changelog fragment) and nothing generated. It does not run `npm run build` or `npm run og` to commit their output. A release pull request (`npm run release:prepare`) still ships every derived file regenerated, because `tag-release.yml` tags its merge.
- **`verify.yml`** (required checks *Dataset integrity* and *Windows tests*, names unchanged). Both jobs regenerate the derived files before running the checks, so the suite sees what `main` will hold after the bot. The last step of *Dataset integrity* rebuilds and calls `regenerate-guard.mjs drift-gate` (`driftGate()` in [scripts/lib/regenerate.mjs](../scripts/lib/regenerate.mjs), tested in `scripts/regenerate-cutover.test.mjs`). It blocks only:
  - `would-block-hand-edit`: the pull request changes a derived file and that file does not match the build. The bot would overwrite the edit silently. Fix: `git checkout origin/main -- <file>` (and let the bot regenerate it), or regenerate on a branch that is up to date with `main`;
  - `would-block-release`: a release pull request with stale derived files;
  - drift outside the bot's allowlist (the bot would refuse to write it: a bug in the generator or the allowlist).

  Stale derived files the pull request did not touch (`bot-would-regenerate`) pass. The same rule applies to the push run on `main`, so a merge followed by the bot's commit does not open a "Verify failed on main" issue. In any other mode the old step, "Generated files must be in sync with the data", runs unchanged and every drift blocks.
- **`pages.yml`.** It also runs on `workflow_run` when "Regenerate derived files" completes on `main`. A `gate` job (`pagesDeploy()`) decides: in push mode a push that changes an input of the bot (its `paths` filter, `REGENERATE_INPUTS`) or that the bot made is not deployed by itself; the finished bot run deploys instead, so the live sitemap check compares against a regenerated `main`. Other pushes, the daily schedule and *Run workflow* deploy as before. In other modes the `workflow_run` runs skip and every push deploys, as before. The upstream workflow never runs pull-request code and the deploy always checks out `main`, which is why this `workflow_run` is allowed to build (the rule is in `scripts/workflow-policy.test.mjs`).
- **`lighthouse.yml`.** The performance job skips pushes by `free-llm-api-hub-regen[bot]`: they only rewrite derived files right after a merge that was measured, and the nightly run measures the result. The required check, which runs on pull requests, is untouched.

## Rollback

At any step: set `REGEN_MODE` to `off` (or delete it). Nothing needs reverting: outside push mode the cut-over's workflows behave as before, so the strict drift gate is back on the next run and contributors regenerate locally again. Pull requests opened during push mode without derived files then need `npm run build` (or the `regen-preview-patch` artifact) before they can merge.

**If the App key leaks:** App page → *Private keys* → delete it, generate a new one, update `REGEN_APP_PRIVATE_KEY`, and review the `[bot]` commits. The App is never in the "main integrity" bypass list, so it cannot force-push or delete `main`.
