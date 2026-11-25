# Contributing

The core value of this project is trustworthy data. Contributions should make it **more accurate, better sourced, easier to use, or more current** — that's the bar.

Thanks for helping. Here's how it works.

## Your first contribution, step by step

Start with one small task and keep your pull request focused on its acceptance criteria.

1. **Choose:** browse [unassigned good first issues](https://github.com/pacocartones/free-llm-api-hub/issues?q=is%3Aissue+is%3Aopen+no%3Aassignee+label%3A%22good+first+issue%22). Read the files, evidence and check named in the issue; check its latest comments and linked pull requests before starting. No assignee does not always mean nobody is working on it. If the scope or check is unclear, ask in that issue first.
2. **Coordinate:** for a `good first issue` also labelled `data`, do not claim it; the first correct, sourced PR is merged. For other tasks, comment `/take` and check that the bot assigned you before starting. See [Claiming an issue](#claiming-an-issue), including how to release it.
3. **Prepare:** follow [Quick start](#quick-start) to fork, clone and create your own branch. If the task verifies a provider fact (in data or docs), read the provider's official page, copy the supporting sentence and note the day you read it (UTC). Otherwise, inspect the behavior and files named in the issue.
4. **Change and check:** edit the source files named in the issue and run its named check. Use [Which checks to run](#which-checks-to-run) for the baseline commands. If the official source does not answer the question, leave the data unchanged and report the link, date and what remains unknown in the issue.
5. **Submit:** open a pull request against `main`, link the issue, explain the change and include the exact check commands and results. Use a draft PR if you need feedback on unfinished work; say what is missing. If a check cannot run, report the error instead of marking it passed.

### From good first issue to help wanted

After a first contribution, browse [unassigned help wanted issues](https://github.com/pacocartones/free-llm-api-hub/issues?q=is%3Aissue+is%3Aopen+no%3Aassignee+label%3A%22help+wanted%22). These can involve more files, research or design decisions; read the acceptance criteria and propose a small first step in the issue before taking it. You do not need a contribution count or permission to browse or ask questions. Labels can overlap: choose by the task's scope and prerequisites, not by the label alone.

Use the same claim, source and validation rules. Keep one task in progress while learning the repository; if you get stuck, share what you tried and the error or unanswered question. If you stop, `/release` makes an assigned task available again. If neither list has a suitable task, use [Questions & ideas](https://github.com/pacocartones/free-llm-api-hub/discussions) to ask where your skills would help.

## For provider data, edit the source

For a **provider data correction**, edit [`data/providers.json`](data/providers.json), not a generated page. The README tables, the freshness badge, the `collections/` markdown, and the whole interactive site (explorer, per-provider pages, collection pages, badges, sitemap) are generated from it. A docs or code issue names its own source files.

**Your pull request ships its own regenerated files.** After editing `data/providers.json`, run `npm run build` (and `npm run og` if the OG check flags drift) and commit the regenerated files together with the data change. The regeneration bot does not write to `main` (it is off by default and rolls out through a shadow mode first, see [docs/regeneration-bot.md](docs/regeneration-bot.md)): the required "Dataset integrity" check fails until the derived files are in sync. The non-blocking *Regeneration preview* run on your pull request lists the stale derived files and offers them as a patch (`regen-preview-patch`) if you cannot build locally.

Fixing a rate limit means editing one field plus the files regenerated from it — still a small, reviewable diff.

**Leave `version` and `generated` alone.** The two lines at the top of `data/providers.json` are the release: `generated` is the day of the dataset release and changes only together with `version`, in a release pull request (see [RELEASING.md](RELEASING.md)). Your dates go in the fields you checked (`last_verified`, `added`, `checked`). The *Dataset integrity* check fails if a data pull request moves `generated`: every pull request used to bump that one line, so any two open data pull requests conflicted on it.

**Describe your change in a changelog fragment, not in `CHANGELOG.md`.** Add one small file, `changes/unreleased/<short-name>.md` (lowercase letters, digits and hyphens), in the changelog's own format: a section heading line such as `### Changed and fixed`, a blank line, then one entry per line such as `- Modal re-verified: the Starter plan's monthly credit is still not settled for commercial use (#688).` (see [changes/README.md](changes/README.md)).

Use one or more of the sections `### Added`, `### Changed and fixed`, `### Removed`, `### Breaking changes and upgrade` and `### Security`, each with entries starting with `- `. Write the PR number if you know it; the maintainer adds it and the `Thanks @user` credit otherwise. The release moves every fragment into `CHANGELOG.md` (`npm run release:prepare`), so no two pull requests edit the same lines. A change users would not notice (docs, tests, CI) needs no fragment. `npm test` checks the format.

**Adding a provider.** Run `npm run add-provider -- <slug> "<Name>"`. The first run writes an intentionally invalid local draft under `.freebuff/provider-drafts/` and separates the core fields that must be completed from tri-state facts that may legitimately remain unknown; it does not change `data/providers.json`. Fill the draft from the provider's own docs, keeping `verified: false` and `last_verified: null` until the evidence is complete, then run the same command again. The command serializes `added` as the installation day (UTC), leaves `generated` (the release stamp) as it is, appending the row only after the full validator accepts it, including category/free-type and cross-dataset slug checks. A repository-local lock prevents two invocations from replacing the dataset concurrently.

## Quick start

[Fork the repository on GitHub](https://github.com/pacocartones/free-llm-api-hub/fork), then clone your fork:

```bash
# fork the repository on GitHub first, then replace YOUR-USERNAME below:
git clone https://github.com/YOUR-USERNAME/free-llm-api-hub.git
cd free-llm-api-hub
git switch -c docs/my-first-change

# install the locked development tools once:
npm ci --ignore-scripts

# edit the files named in your issue, then run the check it names
# for a provider data correction, this is usually:
npm run build && npm test
```

`npm ci --ignore-scripts` installs the locked development tools for JSON Schema validation and local social-image generation without running package lifecycle scripts. The shipped site has no runtime dependencies. Use the Node version pinned in [`.nvmrc`](.nvmrc) (CI uses it too), with `git` on your `PATH`. You can name your fork's branch to match your task; `docs/my-first-change` is only an example.

### Which checks to run

Run these commands from the repository root after installing dependencies. Follow any additional check named in your issue.

| Change | Local validation before opening a PR |
| --- | --- |
| Hand-written docs or issue/PR template text | `npm run links`, then preview the changed Markdown or form and open its links. The link checker checks local paths in tracked and non-ignored new Markdown files, including nested docs and package READMEs. Absolute paths and paths escaping the repository are rejected; it does not validate GitHub forms, external issue searches or heading anchors. |
| Provider data or build inputs (including `CONTRIBUTING.md`, which generates the site's contributing page) | `npm run build && npm test`; commit your changes and regenerated files, then run `npm run check` (it compares generated output with the committed version). Run `npm run og` too if the OG check flags drift. |
| Code | `npm test`, plus the focused check named in the issue. If the change affects generated output, also follow the build-input row above. |

CI runs the full integrity suite on every PR, including docs-only changes. Paste your local commands and their results in the PR; a focused check is useful evidence, and a check you could not run needs an explanation. See [the first-fork checks note](#your-first-pr-from-a-fork-the-checks-may-wait) if CI is waiting for approval.

### Updating your branch from main

Commit all your work first, including new files, and check that `origin` names the repository whose `main` you intend to merge. Run `npm run sync-main` from your full clone on an attached branch. It fetches `origin/main` and merges it; conflicts confined to the shared generated-file list are rebuilt and committed locally. Any source or OG conflict aborts the merge with the conflicting files listed and restores your original local state. Already-current branches, fast-forwards and clean merges need no automatic rebuild. The helper never pushes.

OG files are left for you to check: run `node scripts/check-og.mjs`; if it reports drift, run `npm run og` and commit the resulting OG files yourself. Run `npm test` and the normal generated drift check, `npm run check`, before submitting. If a commit fails, inspect `git status`, fix the identity or hook error and retry `git commit`. After an interruption or cleanup failure, inspect `git status` and the reported files; use `git merge --abort` if a merge remains and you want to abandon it. New build outputs are retained for inspection. This local helper runs repository build code and your normal Git hooks; use it only in a repository you trust, not as a privileged workflow for untrusted PRs.

> **You need the full git history.** `npm test` and `npm run build` mine the per-provider change history from `git log` (see [docs/architecture.md](docs/architecture.md)), so they require a **full clone** — not a shallow clone (`git clone --depth 1`), not a tarball download, and `git` must be on your `PATH`. Without full history the suite fails with a message like:
>
> ```text
> History integrity check failed: expected at least one "changed" event (the dataset evolved)
> # or, when the log is completely empty:
> expected >10 providers in the mined history, got 0
> ```
>
> If you cloned shallow, fix it with `git fetch --unshallow`; otherwise just clone normally: `git clone https://github.com/pacocartones/free-llm-api-hub`. The root integrity and site-build CI jobs check out the full history (`fetch-depth: 0`); workflows that do not mine history may use shallow checkouts.

### Windows and WSL

`npm test` should pass on Windows and in WSL as it does on Linux and macOS. CI runs it on a Windows runner with CRLF settings and without symlink privileges.

- **WSL:** clone inside the Linux file system (for example `~/src/free-llm-api-hub`), not under `/mnt/c/`: the Windows drive is slow from WSL, and Windows Git and Linux Git sharing one clone disagree about file modes and the index. Install `git` and `jq` (`sudo apt install git jq`) and the Node version in `.nvmrc`. Without `jq`, the tests that run workflow shell scripts are skipped with a message that says so.
- **Windows:** Developer Mode is not needed. The test copies link `node_modules` with a junction, which needs no privileges, and copy it where a junction is impossible. Tests of Bash scripts are skipped on Windows, and the Linux job runs them.
- **Line endings:** `.gitattributes` checks text files out with LF whatever `core.autocrlf` says. If `npm test` stops with "tracked text file(s) have CRLF line endings", an editor saved those files with CRLF: save them with LF (or `git checkout -- <file>` for a file you have not edited).
- **Commit signing:** if your git config signs commits (`commit.gpgsign`), `npm test` turns signing off for the throwaway repositories the tests create. Your own commits are not affected.
- **A data-only change:** `npm run validate` checks `data/` in seconds while you edit; before the pull request, run `npm run build && npm test`, commit, then `npm run check`, as in [Which checks to run](#which-checks-to-run).

If you want to preview how your entry renders on the site before opening the PR:

```bash
npm run build     # regenerates README tables, badge, site payload, and other derived artifacts
```

Commit regenerated tracked artifacts when your data or generator change requires them. Do not commit a no-op preview.

## Adding or updating a provider

Field types, nullability and required keys are generated from the schema in **[docs/schema.md](docs/schema.md)** (`npm run build` regenerates it; do not edit it by hand). Comparison conventions are documented in **[docs/comparison-dimensions.md](docs/comparison-dimensions.md)**; what qualifies is in **[docs/inclusion-criteria.md](docs/inclusion-criteria.md)**. The essentials:

1. **Link to the provider's own official docs** — a pricing or rate-limit page on the provider's domain. Third-party summaries (including other curated lists) are fine for *finding* a provider, but the `docs_url` must be a primary source.
2. **Use concrete numbers.** `30 req/min`, `10,000 tokens/day`, `$5 credit` — never "generous limits" or other marketing language. If a provider doesn't publish exact figures, say so explicitly instead of inventing a plausible-looking one.
3. **Capture the catch.** Phone/card requirements, "evaluation only / not for production" clauses, data-training opt-ins, resale/commercial restrictions, region locks — the fine print is usually the most useful part of an entry.
4. **Set the honesty flags correctly:**
   - A human reviewer confirmed the entry's core facts against the provider's own docs today? → `verified: true`, `last_verified: "<today, YYYY-MM-DD>"`, real `docs_url`. Follow the [verification pass](docs/update-playbook.md#layer-2--the-weekly-pass); a single-field correction or automated check does not complete it.
   - Couldn't confirm the core facts during that review? → `verified: false`, `last_verified: null`, and explain what's unconfirmed in `notes`. **An honestly-flagged uncertain entry is more valuable than a confident wrong one** — and the validator will reject a `verified: true` entry that lacks a date or source link.

Slugs are permanent identifiers — never rename or reuse a `slug`.

### Confirming a single unknown field

The smallest useful contribution: many entries carry `null` in `card_required`, `phone_required`, `commercial_ok` or `openai_compatible`, which means *nobody has confirmed it yet* — not that the answer is "no". Turning one `null` into a sourced `true`/`false` is a genuine improvement and takes minutes. Open a PR with the corrected field, primary source and date read, and record the provider's sentence in a `stated` `field_checks` entry (below) so the next reader sees why the flag holds its value. Leave `verified` and `last_verified` unchanged unless a human reviewer also completes the [core-fact verification pass](docs/update-playbook.md#layer-2--the-weekly-pass).

If you read the provider's official pages and they do not settle a flag, record that too, so nobody repeats the search: add a `field_checks` entry with `status` `source_silent` (the pages that should say it, such as pricing, terms and sign-up docs, do not), `needs_account` (only an account would tell) or `sources_disagree` (two official pages contradict each other: list both and say what each says in `note`), the day you read them in `checked`, and the pages in `sources`. When a page does state the value, use `status: "stated"` with the provider's sentence in `quote`, then run `npm run quotes:add -- <slug> --field <flag>`. The field is defined in [docs/comparison-dimensions.md](docs/comparison-dimensions.md#why-a-flag-holds-its-value-field_checks).

Speed is recorded only as the provider publishes it: if the provider's own page gives a speed for a model of its `models_free`, add a `published_speed` entry with the figure exactly as written, the qualifier its words give (`~` is `approx`, "more than" is `at_least`, "up to" is `up_to`), the page, the day and the provider's words in `quote`, then run `npm run quotes:add -- <slug> --speed`. Never cite a benchmark, an aggregator or a figure the page attributes to someone else, and never estimate. See [docs/comparison-dimensions.md](docs/comparison-dimensions.md#speed-the-provider-publishes-published_speed).

The same applies to `data_policy`, which records what a provider says about your prompts (`trains_on_prompts`, `retention`, `source`, `checked`). An absent `data_policy` object means "not recorded", never "no". Sourced values come exclusively from the provider's own pages, alongside the day they were read. A policy-only review updates `data_policy.checked`, not `last_verified`, under the [playbook's policy-check rules](docs/update-playbook.md#layer-2--the-weekly-pass). If a provider's official pages do not settle the question, that is a completely valid result too: leave the entry as it is and report your findings with the link and date in your PR. See the full field definition in [docs/comparison-dimensions.md](docs/comparison-dimensions.md). A `data_policy` row needs at least one of `trains_on_prompts` or `retention` stated: a row with both `null` records nothing, and `npm test` rejects it.

A `data_policy` row also needs its entries in `data/quotes.json` (the sentence, each phrase of the note between « », and a check behind any claim about a whole page). You do not write them: after editing the row, run `npm run quotes:add -- <slug>` and then `npm test`. `docs/quotes.md` says what the command does and what to do when a page cannot be read.

**Dates are UTC days.** `last_verified`, `added`, `checked` and `generated` are the day in UTC, written `YYYY-MM-DD` (`date -u +%F` gives it). If your day is already tomorrow in UTC, write today's UTC day, never tomorrow: `npm test` fails on any of these dates after today in UTC. `generated` is the release date; a data pull request leaves it as it is.

## Reporting without a PR

- **Something's outdated or wrong:** the [structured issue form](../../issues/new?template=inaccuracy.yml) takes under a minute.
- **A new provider to add:** the [new-provider form](../../issues/new?template=new-provider.yml).
- The PR link check (`check-links.mjs`) validates repository-local targets only. If the on-demand external check (`npm run check-sources`) or a manual visit finds a broken provider source, feel free to comment on the PR or open an [inaccuracy issue](../../issues/new?template=inaccuracy.yml).

## Style

- Keep table cells scannable — short phrases, not paragraphs.
- Prefer the primary number over the marketing framing.
- Match the tone of the existing entries: precise, plain, no hype.

## Contributing code

Data PRs are the common case, but scripts and site changes are welcome too. Start with **[docs/architecture.md](docs/architecture.md)** — it maps the pipeline, what each script does, and the two-places rule (the homepage is hand-written; everything else is generated). The checks a code PR must pass: `npm test` (data integrity + internal links) and, if you touched anything the build consumes, `npm run check` (build idempotency + drift).

**Adding a test.** Put it in `scripts/<name>.test.mjs`. `npm test` and CI run every `scripts/*.test.mjs` through `scripts/run-tests.mjs`, which finds the files on disk, so a new test file does not touch `package.json` or `.github/workflows/verify.yml` and does not collide with other pull requests. A test named any other way (`*.test.js`, or inside a subfolder) would not run, and `scripts/test-lists.test.mjs` fails if there is one.

## Running Lighthouse locally

The CI gate is `node scripts/lighthouse-gate.mjs` (after `npm ci` in `tools/lighthouse` and `node scripts/build.mjs`; it needs a Chrome binary in `CHROME_PATH`). On a pull request it runs `--mode=accessibility-seo`: accessibility at least 0.95 with no new or unscored accessibility audit, and SEO exactly 1, one run per page because neither depends on the runner's speed. Performance (at least 0.80, median of three runs per page) runs with `--mode=performance` after a merge to `main` and nightly, and a failure there opens or updates one issue instead of blocking a pull request. Without `--mode` the script checks all three categories with the median of three. It gives every run its own Chrome profile and process group, and on exit (also on Ctrl-C or a kill) it ends those groups by pid, deletes the profile and checks that nothing still points at it.

If you run Lighthouse or Chrome by hand against a local server instead, do it like this so nothing is left running:

```bash
profile="$(mktemp -d)"
python3 -m http.server 8080 --directory site --bind 127.0.0.1 &
server=$!
cleanup() {
  kill "$server" 2>/dev/null
  [ -n "${lh:-}" ] && kill -- -"$lh" 2>/dev/null   # Lighthouse runs in its own process group (setsid), never `pkill -f`
  rm -rf "$profile"
}
trap cleanup EXIT INT TERM
setsid tools/lighthouse/node_modules/.bin/lighthouse http://127.0.0.1:8080/ \
  --chrome-flags="--headless --no-sandbox --user-data-dir=$profile" --output=json --quiet > lh.json &
lh=$!
wait "$lh"
# final check: nothing should still reference the profile
if grep -l -- "$profile" /proc/[0-9]*/cmdline 2>/dev/null | grep -qv "/proc/$$/"; then echo "orphan processes left" >&2; fi
```

## Claiming an issue

There are two kinds of issue:

- **Labelled both `good first issue` and `data`** (a data question answered from the provider's own page): don't claim it, open a pull request when it's ready. The first correct, sourced PR is merged. If you found something useful but won't open a PR, post it in the issue with the link and the date; the PR that uses it credits you.
- **Everything else:** comment `/take` on its own as the first line of an issue comment. A bot assigns it to you if nobody has it and you have fewer than two open issues assigned. Check the assignee and bot reply; if there is no reply, ask in the issue before starting duplicate work. If you can't continue, comment `/release` on its own as the first line; that's completely fine. Check that your assignment was removed so someone else can take it. Share any useful findings or draft PR link when handing it back. An assigned issue with no activity for two weeks may be offered to another contributor, after a ping (7 days during a program, see [Programs](#programs-social-winter-of-code-and-similar)). A pull request for an issue assigned to someone else waits for them.

We read every pull request and reply as soon as we can. A reply is a real answer (a review, a question or an assignment), not an acknowledgement.

## Good first issues

An issue carries the `good first issue` label only if all of these hold:

1. **No third-party account or payment.** Provider facts can be checked on public official pages; docs and code tasks can be done from the public repository and site. (This is why `phone_required` questions are not good first issues: most providers don't document it, and answering needs a sign-up. They live in the [#7](https://github.com/pacocartones/free-llm-api-hub/issues/7) checklist instead.)
2. **One or two files**, named in the issue.
3. **A named check** that must pass, for example `npm run build && npm test`, or `npm run check` for `data/` changes.
4. **Under about two hours** for someone new to the repository.
5. **Unclaimed:** no assignee and no open pull request linked to it.
6. **Reviewed by a maintainer in the last 30 days.**

Maintainers can draw new tasks from the [#7](https://github.com/pacocartones/free-llm-api-hub/issues/7) and [#8](https://github.com/pacocartones/free-llm-api-hub/issues/8) checklists or from the weekly re-verification batch. If the provider's docs don't answer the question, that is a useful result too: say so in the issue with the link and the date, and the field stays `null`.

## Using AI

AI-assisted contributions are welcome. Please read [AI_POLICY.md](AI_POLICY.md): understand and test your change, check facts at their source, and own what you submit. Saying you used AI is optional and never counts against you. We also maintain this project with AI agents under human oversight; a human maintainer reviews every merge ([how this project is maintained](README.md#how-this-project-is-maintained)).

Replies in this repository's issues, pull requests and discussions are prepared by an AI agent working under the supervision of the repository owner.

Commit messages: AI-assisted contributions are welcome when you have verified the change (see above). Contributors outside the maintainer identity rules below may keep tool-added trailers and use their own email addresses. Commits by either maintainer (as author or committer) must use a documented name/email pair and carry no AI attribution trailers; `scripts/check-commit-policy.sh` checks new non-merge commits in the PR range. See [Branch names and commit identity](#branch-names-and-commit-identity). Only @pacocartones and @LeonMAG hold maintenance roles and permissions; external contributions do not grant or offer those roles. When we squash-merge, we drop AI `Co-authored-by` lines from the final message so `main` stays clean; your authorship stays.

## Review

A human maintainer reviews and is responsible for every merge. Automated review comments (CodeRabbit) are advisory: a person makes the call, and you don't need to reply to the bot. We resolve every review conversation, from people or bots, before merging, either by changing the code or by noting why not.

If your pull request falls behind `main`, we update it before merging; you can use [Updating your branch from main](#updating-your-branch-from-main) to sync it locally. When that update only changes regenerated files, the review still holds: it is tied to the patch of the files you changed under `data/`, `scripts/` and `docs/`, and we check that this patch is exactly the one we reviewed. If any of those lines changes, the pull request is reviewed again. The *Dataset integrity* check has to be green either way.

Contributions here are voluntary. We don't pay for comments, reviews or other work that nobody asked for, and a request for payment in an issue or a pull request gets no reply and doesn't change how we review it.

### Required checks

The five required checks on `main` (branch protection, updated 2026-11-19) are:

- `Dataset integrity`
- `Windows tests`
- `commit policy`
- `Lighthouse accessibility and performance` (on pull requests it checks accessibility and SEO; performance runs on `main` and nightly)
- `Analyze (javascript-typescript)` (CodeQL)

All five report on every PR without path filters. CodeQL also runs weekly and
manually. It scans JavaScript/TypeScript code, not Actions
workflow YAML. There is no push trigger, avoiding a second scan when a PR merges.
`mcp tests (node 22)` and `mcp tests (node 24)` run only when the MCP package or its
workflow changes, so they must not be unconditional required checks.

Live GitHub settings remain authoritative. Preserve existing controls when reconciling their check
names; a required PR check must not use path filters that leave it permanently
pending. Security policy and token permissions are in [SECURITY.md](SECURITY.md).

## Programs (Social Winter of Code and similar)

This repository takes part in contribution programs that score merged pull requests, such as [Social Winter of Code](https://www.swoc.in/) (SWoC). This section is for program participants; everything else in this guide applies to you too. Contributions are welcome all year, inside or outside a program.

**Social Winter of Code Season 7 runs from 1 January to 30 March 2027.** The program and level labels it uses are listed here, and only here, so this table is the one place to check (SWoC publishes the exact names before the season starts, and we update the table then):

| Purpose | Label |
|---|---|
| Program label: the issue counts for Social Winter of Code Season 7 | `SWoC27` |
| Level label for an Easy issue | `Easy` |
| Level label for a Medium issue | `Medium` |
| Level label for a Hard issue | `Hard` |

Below, "the program label" and "a level label" mean the labels in this table, and Easy, Medium and Hard mean the levels described in [Difficulty levels](#difficulty-levels).

### Picking and taking an issue

- **Pick an open issue with the program label and a level label.** Read the whole issue, its latest comments and its linked pull requests first.
- **Data issues labelled `good first issue` and `data` are not assigned**, as for everyone else: open a pull request when it is ready, and the first correct, sourced PR is merged. If a second correct PR arrives later, we thank you and point you to another open issue.
- **For every other issue, comment `/take`** on its own as the first line of a comment, and wait for the bot to assign you before starting (see [Claiming an issue](#claiming-an-issue)). You can hold **at most two open assigned issues** at a time; the bot refuses a third. Comment `/release` when you stop, so someone else can take it.
- **No hoarding.** Take an issue only when you are about to work on it, not to reserve it. Asking for several issues at once, or taking issues you don't work on, means we stop assigning to you for that day. During the program, an assigned issue with no activity for **7 days** is released after a ping on day 5 (outside programs it is two weeks).
- **At most two Easy merges per person.** Two merged pull requests are enough for the SWoC certificate. After that, please pick Medium or Hard issues so the next newcomer has an easy one.
- Don't ask to be assigned in a pull request or by direct message: everything happens in the issue, in public.

### Difficulty levels

| Level | What it means here | Typical size |
|---|---|---|
| Easy | One or two files named in the issue, one named check, no third-party account. Good for a first contribution. | Under about 2 hours |
| Medium | Reading existing code or tests, or comparing several official pages. The issue names the files and the check. | About 2 to 6 hours |
| Hard | A design decision, several files, or a careful data re-verification with quotes. Agree the approach in the issue before you write code. | More than a day, in steps |

The level is set in the issue by a maintainer. If you think it is wrong, say so in the issue **before** you start; we don't change it after the work is done. SWoC scores each level differently: see [swoc.in](https://www.swoc.in/) for the current points.

### How points are given

- Points come from labels on the **merged pull request**, and only a maintainer adds them. When we merge, we copy the level label from the issue to the pull request and add the program label.
- **Only pull requests that close an issue carrying the program label get these labels.** Link it with `Closes #123` in the pull request description. A pull request without such an issue is reviewed on its merits as usual, but it gets no level label and does not score.
- Only merged pull requests count. A pull request that is closed, or that only rewords text, reformats files or adds unsourced claims, gets no label (see [Hacktoberfest](#hacktoberfest) below for what gets merged).
- If a merged contribution turns out to rest on an invented source, we revert it and ask the program to withdraw its points.

### Reviews and response times

During the program we aim to approve waiting checks within 1 day, reply to a new pull request within 2 days, give a first review within 3 days and reach a decision within 7 days. These are goals, not promises: maintainers are volunteers. If more than 10 program pull requests are waiting for review, we pause new assignments until the queue is shorter, and we say so in the issues.

If a pull request is nearly ready and only needs regenerated files, an update from `main` or a formatting fix, a maintainer may finish it on your branch ("Allow edits by maintainers") and say so in a comment. You stay the author, and the changelog credits you.

### Your first pull request waits for approval

Until your first pull request here is merged, GitHub holds its checks until a maintainer approves them (see [Your first PR from a fork](#your-first-pr-from-a-fork-the-checks-may-wait)). During the program we approve them in batches, usually twice a day in January and once a day afterwards. So:

- **Push when your change is complete.** Every push before your first merge waits for approval again.
- **Don't close and reopen your pull request** to restart the checks; push to the same branch instead.
- After your first merge, your later pull requests run their checks straight away.

### AI and quotes

The quality bar is the same as always. Read [AI_POLICY.md](AI_POLICY.md): AI-assisted work is welcome, but understand and test what you send, and be ready to answer review questions in your own words.

- **Every fact and every quote must come from a page you opened yourself,** on the provider's own site. Third-party summaries, blog posts and other lists don't count as sources.
- **Quotes are copied word for word.** Don't translate, shorten or reword a quoted sentence, and don't quote from memory or from an AI tool's answer. Reviewers open the source and look for the exact sentence before merging; [docs/quotes.md](docs/quotes.md) explains how quotes are recorded and checked.
- **Pull requests with invented or unchecked sources are closed,** and so are pull requests that ignore the issue they claim to fix. If the official page does not answer the question, that is a useful result: say so in the issue with the link and the date.

### Hacktoberfest

October is Hacktoberfest month, but Hacktoberfest 2026 no longer rewards pull requests (it is about learning and building with open-source AI), so a pull request here does not earn Hacktoberfest swag or points, and we do not promise any. The [good first issues](https://github.com/pacocartones/free-llm-api-hub/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) are the best place to start (see [Good first issues](#good-first-issues) for what qualifies). Your name goes in [CONTRIBUTORS.md](CONTRIBUTORS.md) when a pull request is merged.

What gets merged is what makes the data more accurate: a field confirmed from the provider's own docs, a stale number corrected, a dead link fixed with its replacement. Pull requests that only reword text, reformat files or add unsourced claims will be closed, and so will pull requests opened without reading the issue they claim to fix.

## What happens next

A maintainer re-checks the source link and the claim, then merges. Once your first PR merges, you are credited in [CONTRIBUTORS.md](CONTRIBUTORS.md) (a maintainer refreshes it from the merged pull requests) — there is nothing extra for you to do. See [GOVERNANCE.md](GOVERNANCE.md) for how decisions are made and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for community norms. By contributing you agree to license your contribution under the repository's [MIT License](LICENSE).

### Your first PR from a fork: the checks may wait

GitHub holds workflow runs from a **first-time contributor** until a maintainer approves them (a safety default for code from new accounts). Until your first pull request here is merged, **every push** to it waits for that approval. If your PR shows no checks, or the required "Dataset integrity" check stays grey at *Expected — Waiting for approval*, that's normal and says nothing about your change. Leave a comment on your PR (e.g. "Could you approve the checks?") and a maintainer will approve the run. Once your first PR is merged, your later PRs run straight away.

## Maintainer notes

- **Release-only lines.** `version` and `generated` in `data/providers.json`, the version in `package.json`/`package-lock.json`, `date-released` in `CITATION.cff` (built from `generated`) and the move of `changes/unreleased/*.md` into `CHANGELOG.md` change only in a release pull request, prepared with `npm run release:prepare -- X.Y.Z`. The freshness badge is not committed: every deploy builds `site/badge-freshness.json`. Public dates (API `generated`, CSV `dataset_generated`, sitemap) still mean the last dataset change and are derived from the data, so a pull request that records a newer date also rewrites those date lines in the aggregate outputs; they are generated files, so `npm run sync-main` rebuilds them, and two pull requests from the same day write identical lines. What still collides in practice is `derived-fingerprints.json` and, between pull requests from different days, those date lines.
- **The author ships the derived files.** The regeneration bot (`regenerate.yml`) is off by default and, until its switch to direct push, writes nothing to `main` (see [docs/regeneration-bot.md](docs/regeneration-bot.md)): `main` requires the "Dataset integrity" check, and a change is complete when its regenerated files are committed in the same PR. After editing `data/providers.json` (or `data/programs.json`), run `npm run build` (and `npm run og` if the OG check flags drift), commit the regenerated files together with the data change, and push. The "Dataset integrity" check fails until they are in sync.
- **Provider maintenance is not scheduled.** Re-verification, model samples and the live probe are local on-demand tasks — see [docs/update-playbook.md](docs/update-playbook.md). GitHub Actions does run the site deployment daily to refresh its build-time star count, plus CodeQL on pull requests and weekly, weekly OpenSSF Scorecard scans, the weekly worklist refresh of issue #4, the monthly source checks (which report in an issue) and the regeneration bot, which does nothing unless it is enabled; none of those jobs changes provider claims.

### Branch names and commit identity

- **If you contribute from a fork, none of the branch rules apply to you:** name your branch as you
  like. They are for the maintainers' branches in this repository.
- **Maintainers' branch names:** `<type>/<short-slug>`, lower case with hyphens, where the type is
  the conventional-commit type: `feat/`, `fix/`, `docs/`, `data/`, `test/`, `ci/`, `chore/` or `refactor/`. Example: `fix/sitemap-canonical`. Branch names
  describe the change, not who made it or an internal ticket. Reserved: `main`, `changeset-release/main` and `bot/*`.
- **Codex Security branches:** the generated format `codex-security/arp_<32 lowercase hexadecimal characters>`
  is accepted for branches in this repository. Other `codex-security/*` names must follow the normal
  naming rule instead. This is a branch-name exception only: it does not authenticate the tool or author,
  approve the patch, or exempt maintainer commits from the identity and attribution rules below.
- **Dependabot branches:** `dependabot/*` is exempt from the naming rule only when the pull request
  author is `dependabot[bot]`. A human using that prefix is still checked; the commit identity and
  attribution rules still apply to maintainer commits in a Dependabot pull request.
- **What happens to branches:** in this repository, merged and closed pull requests keep their
  commits and the branch is deleted afterwards; branches in your fork are yours.
- **Commit identity:** the accepted maintainer name/email pairs are:

  | Maintainer | Commit name | Accepted email |
  | --- | --- | --- |
  | @pacocartones | `Paco Cartones` | `253313177+pacocartones@users.noreply.github.com` |
  | @LeonMAG | `Leon Marcos` | `leonaniagomez@gmail.com` or `261010486+LeonMAG@users.noreply.github.com` |

  Leon's personal-address pair is present in repository history (for example commit `abf4aa8`).
  [GitHub's public account API](https://api.github.com/users/LeonMAG) confirms name `Leon Marcos`,
  login `LeonMAG` and account ID `261010486`; the numeric noreply uses GitHub's
  [documented format](https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-personal-account-on-github/managing-email-preferences/setting-your-commit-email-address).
  The bare `LeonMAG@users.noreply.github.com` address is not admitted without evidence.
  The repository mailbox guard allows Leon's exact historical address only in the policy, its tests
  and this document/generated page; contributor records remain login-only.
  These are name/email **pairs**: mixing one maintainer's name with the other's address fails.
  Both author and committer are checked. Recognized account aliases, tool names and internal
  `@hq.local` addresses trigger the check but are not accepted canonical identities.
  Both maintainers are subject to the same AI-attribution rule; fork and automation branch-name
  exceptions do not bypass it. Other contributors keep their own identity and attribution choices.
  Git metadata checks enforce consistency, not authentication or authorization: the role roster is
  [GOVERNANCE.md](GOVERNANCE.md), and a human maintainer still reviews every merge.
