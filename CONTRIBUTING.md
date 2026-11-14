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

**Your pull request ships its own regenerated files.** After editing `data/providers.json`, run `npm run build` (and `npm run og` if the OG check flags drift) and commit the regenerated files together with the data change. There is no regeneration bot — the required "Dataset integrity" check fails until the derived files are in sync.

Fixing a rate limit means editing one field plus the files regenerated from it — still a small, reviewable diff.

**Adding a provider.** Run `npm run add-provider -- <slug> "<Name>"`. The first run writes an intentionally invalid local draft under `.freebuff/provider-drafts/` and separates the core fields that must be completed from tri-state facts that may legitimately remain unknown; it does not change `data/providers.json`. Fill the draft from the provider's own docs, keeping `verified: false` and `last_verified: null` until the evidence is complete, then run the same command again. The command serializes `added` and advances `generated` to the installation day, appending the row only after the full validator accepts it, including category/free-type and cross-dataset slug checks. A repository-local lock prevents two invocations from replacing the dataset concurrently.

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
| Hand-written docs or issue/PR template text | `npm run links`, then preview the changed Markdown or form and open its links. The link checker checks local doc file paths; it does not validate GitHub forms, external issue searches or heading anchors. |
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
> If you cloned shallow, fix it with `git fetch --unshallow`; otherwise just clone normally: `git clone https://github.com/pacocartones/free-llm-api-hub`. CI always checks out the full history (`fetch-depth: 0`), so this only bites local development.

If you want to preview how your entry renders on the site before opening the PR:

```bash
npm run build     # regenerates README tables, badge, site payload, and other derived artifacts
```

Commit regenerated tracked artifacts when your data or generator change requires them. Do not commit a no-op preview.

## Adding or updating a provider

Fields are documented in **[docs/comparison-dimensions.md](docs/comparison-dimensions.md)**; what qualifies is in **[docs/inclusion-criteria.md](docs/inclusion-criteria.md)**. The essentials:

1. **Link to the provider's own official docs** — a pricing or rate-limit page on the provider's domain. Third-party summaries (including other curated lists) are fine for *finding* a provider, but the `docs_url` must be a primary source.
2. **Use concrete numbers.** `30 req/min`, `10,000 tokens/day`, `$5 credit` — never "generous limits" or other marketing language. If a provider doesn't publish exact figures, say so explicitly instead of inventing a plausible-looking one.
3. **Capture the catch.** Phone/card requirements, "evaluation only / not for production" clauses, data-training opt-ins, resale/commercial restrictions, region locks — the fine print is usually the most useful part of an entry.
4. **Set the honesty flags correctly:**
   - Confirmed it against the provider's own docs today? → `verified: true`, `last_verified: "<today, YYYY-MM-DD>"`, real `docs_url`.
   - Couldn't fully confirm it? → `verified: false`, `last_verified: null`, and explain what's unconfirmed in `notes`. **An honestly-flagged uncertain entry is more valuable than a confident wrong one** — and the validator will reject a `verified: true` entry that lacks a date or source link.

Slugs are permanent identifiers — never rename or reuse a `slug`.

### Confirming a single unknown field

The smallest useful contribution: many entries carry `null` in `card_required`, `phone_required` or `commercial_ok`, which means *nobody has confirmed it yet* — not that the answer is "no". Turning one `null` into a sourced `true`/`false` is a genuine improvement and takes minutes. Open a PR with the flag set, `last_verified` bumped, and the primary source in `docs_url` or `notes`.

The same applies to `data_policy`, which records what a provider says about your prompts (`trains_on_prompts`, `retention`, `source`, `checked`). An absent `data_policy` object means "not recorded", never "no". Sourced values come exclusively from the provider's own pages, alongside the day they were read. If a provider's official pages do not settle the question, that is a completely valid result too: leave the entry as it is and report your findings with the link and date in your PR. See the full field definition in [docs/comparison-dimensions.md](docs/comparison-dimensions.md). A `data_policy` row needs at least one of `trains_on_prompts` or `retention` stated: a row with both `null` records nothing, and `npm test` rejects it.

A `data_policy` row also needs its entries in `data/quotes.json` (the sentence, each phrase of the note between « », and a check behind any claim about a whole page). You do not write them: after editing the row, run `npm run quotes:add -- <slug>` and then `npm test`. `docs/quotes.md` says what the command does and what to do when a page cannot be read.

**Dates are UTC days.** `last_verified`, `added`, `checked` and `generated` are the day in UTC, written `YYYY-MM-DD` (`date -u +%F` gives it). If your day is already tomorrow in UTC, write today's UTC day, never tomorrow: `npm test` fails on a `generated` that is after today in UTC.

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

The CI gate is `node scripts/lighthouse-gate.mjs` (after `npm ci` in `tools/lighthouse` and `node scripts/build.mjs`; it needs a Chrome binary in `CHROME_PATH`). It gives every run its own Chrome profile and process group, and on exit (also on Ctrl-C or a kill) it ends those groups by pid, deletes the profile and checks that nothing still points at it.

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
- **Everything else:** comment `/take` on its own as the first line of an issue comment. A bot assigns it to you if nobody has it and you have fewer than two open issues assigned. Check the assignee and bot reply; if there is no reply, ask in the issue before starting duplicate work. If you can't continue, comment `/release` on its own as the first line; that's completely fine. Check that your assignment was removed so someone else can take it. Share any useful findings or draft PR link when handing it back. An assigned issue with no activity for two weeks may be offered to another contributor, after a ping. A pull request for an issue assigned to someone else waits for them.

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

Commit messages: AI-assisted contributions are welcome when you have verified the change (see above). You do not need to remove a trailer your tool adds, and you can commit under any email address. Commits written by the maintainers carry no AI attribution trailers and use GitHub noreply addresses; the *Commit policy* check on pull requests enforces that for maintainer identities only. When we squash-merge, we drop AI `Co-authored-by` lines from the final message so `main` stays clean; your authorship stays.

## Review

A human maintainer reviews and is responsible for every merge. Automated review comments (CodeRabbit) are advisory: a person makes the call, and you don't need to reply to the bot. We resolve every review conversation, from people or bots, before merging, either by changing the code or by noting why not.

If your pull request falls behind `main`, we update it before merging; you can use [Updating your branch from main](#updating-your-branch-from-main) to sync it locally. When that update only changes regenerated files, the review still holds: it is tied to the patch of the files you changed under `data/`, `scripts/` and `docs/`, and we check that this patch is exactly the one we reviewed. If any of those lines changes, the pull request is reviewed again. The *Dataset integrity* check has to be green either way.

Contributions here are voluntary. We don't pay for comments, reviews or other work that nobody asked for, and a request for payment in an issue or a pull request gets no reply and doesn't change how we review it.

## Hacktoberfest

October is Hacktoberfest month, but Hacktoberfest 2026 no longer rewards pull requests (it is about learning and building with open-source AI), so a pull request here does not earn Hacktoberfest swag or points, and we do not promise any. Contributions are welcome all year. The [good first issues](https://github.com/pacocartones/free-llm-api-hub/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) are the best place to start (see [Good first issues](#good-first-issues) for what qualifies). Your name goes in [CONTRIBUTORS.md](CONTRIBUTORS.md) when a pull request is merged.

What gets merged is what makes the data more accurate: a field confirmed from the provider's own docs, a stale number corrected, a dead link fixed with its replacement. Pull requests that only reword text, reformat files or add unsourced claims will be closed, and so will pull requests opened without reading the issue they claim to fix.

## What happens next

A maintainer re-checks the source link and the claim, then merges. Once your first PR merges, you are credited in the README [Contributors](README.md#contributors) section (a maintainer refreshes it from git history) — there is nothing extra for you to do. See [GOVERNANCE.md](GOVERNANCE.md) for how decisions are made and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for community norms. By contributing you agree to license your contribution under the repository's [MIT License](LICENSE).

### Your first PR from a fork: the checks may wait

GitHub holds workflow runs from a **first-time contributor** until a maintainer approves them (a safety default for code from new accounts). Until your first pull request here is merged, **every push** to it waits for that approval. If your PR shows no checks, or the required "Dataset integrity" check stays grey at *Expected — Waiting for approval*, that's normal and says nothing about your change. Leave a comment on your PR (e.g. "Could you approve the checks?") and a maintainer will approve the run. Once your first PR is merged, your later PRs run straight away.

## Maintainer notes

- **No regeneration bot — the author ships the derived files.** There is no `bot/regenerate`: `main` requires the "Dataset integrity" check, and a change is complete when its regenerated files are committed in the same PR. After editing `data/providers.json` (or `data/programs.json`), run `npm run build` (and `npm run og` if the OG check flags drift), commit the regenerated files together with the data change, and push. The "Dataset integrity" check fails until they are in sync.
- **Provider maintenance is not scheduled.** Re-verification, model samples and the live probe are local on-demand tasks — see [docs/update-playbook.md](docs/update-playbook.md). GitHub Actions does run the site deployment daily to refresh its build-time star count, plus weekly CodeQL and OpenSSF Scorecard scans; none of those jobs changes provider claims.

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
- **Commit identity:** maintainers commit as
  `Paco Cartones <253313177+pacocartones@users.noreply.github.com>` (how the project is maintained,
  including the part done by AI agents under human oversight, is described in the README ([How this project is maintained](README.md#how-this-project-is-maintained))), and
  `scripts/check-commit-policy.sh` checks maintainer commits only. If you do not want your email in
  the public history, use your GitHub noreply address
  ([how](https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-personal-account-on-github/managing-email-preferences/setting-your-commit-email-address)).
