# Contributing

The entire value of this project is that its data can be trusted. Every contribution should make the dataset **more accurate, better sourced, or more current** — that's the bar.

Thanks for helping. Here's how it works.

## The one rule that matters

> **Edit the data, not the docs.** The single source of truth is [`data/providers.json`](data/providers.json). The README tables, the freshness badge, the `collections/` markdown, and the whole interactive site (explorer, per-provider pages, collection pages, badges, sitemap) are all *generated* from it.

**Your pull request ships its own regenerated files.** After editing `data/providers.json`, run `npm run build` (and `npm run og` if the OG check flags drift) and commit the regenerated files together with the data change. There is no regeneration bot — the required "Dataset integrity" check fails until the derived files are in sync.

Fixing a rate limit means editing one field plus the files regenerated from it — still a small, reviewable diff.

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

## Quick start

```bash
git clone https://github.com/pacocartones/free-llm-api-hub
cd free-llm-api-hub

# install the locked development tools once:
npm ci --ignore-scripts

# edit data/providers.json, then:
npm test          # validate the dataset against the integrity rules
```

That's the whole loop. `npm ci --ignore-scripts` installs the locked development tools for JSON Schema validation and local social-image generation without running package lifecycle scripts. The shipped site has no runtime dependencies. The Node version used in CI is pinned in [`.nvmrc`](.nvmrc); anything ≥18 works locally.

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

The same applies to `data_policy`, which records what a provider says about your prompts (`trains_on_prompts`, `retention`, `source`, `checked`). An absent `data_policy` object means "not recorded", never "no". Sourced values come exclusively from the provider's own pages, alongside the day they were read. If a provider's official pages do not settle the question, that is a completely valid result too: leave the entry as it is and report your findings with the link and date in your PR. See the full field definition in [docs/comparison-dimensions.md](docs/comparison-dimensions.md).

A `data_policy` row also needs its entries in `data/quotes.json` (the sentence, each phrase of the note between « », and a check behind any claim about a whole page). You do not write them: after editing the row, run `npm run quotes:add -- <slug>` and then `npm test`. `docs/quotes.md` says what the command does and what to do when a page cannot be read.

## Reporting without a PR

- **Something's outdated or wrong:** the [structured issue form](../../issues/new?template=inaccuracy.yml) takes under a minute.
- **A new provider to add:** the [new-provider form](../../issues/new?template=new-provider.yml).
- If the link-check (`check-links.mjs`, run on every PR) flags a broken source link, feel free to just comment on the PR or open an [inaccuracy issue](../../issues/new?template=inaccuracy.yml).

## Style

- Keep table cells scannable — short phrases, not paragraphs.
- Prefer the primary number over the marketing framing.
- Match the tone of the existing entries: precise, plain, no hype.

## Contributing code

Data PRs are the common case, but scripts and site changes are welcome too. Start with **[docs/architecture.md](docs/architecture.md)** — it maps the pipeline, what each script does, and the two-places rule (the homepage is hand-written; everything else is generated). The checks a code PR must pass: `npm test` (data integrity + internal links) and, if you touched anything the build consumes, `npm run check` (build idempotency + drift).

## Claiming an issue

There are two kinds of issue:

- **Labelled both `good first issue` and `data`** (a data question answered from the provider's own page): don't claim it, open a pull request when it's ready. The first correct, sourced PR is merged. If you found something useful but won't open a PR, post it in the issue with the link and the date; the PR that uses it credits you.
- **Everything else:** comment `/take` on the issue and a bot assigns it to you straight away, if nobody has it and you have fewer than two open issues assigned. If you can't continue, comment `/release`; that's completely fine, and it frees the issue for someone else. An assigned issue with no activity for two weeks may be offered to another contributor, after a ping. A pull request for an issue assigned to someone else waits for them.

We reply to every new issue, pull request and "can I take this?" comment within 24 hours, usually the same day. A reply is a real answer (a review, a question or an assignment), not an acknowledgement.

## Good first issues

An issue carries the `good first issue` label only if all of these hold:

1. **No third-party account or payment.** The answer comes from public pages. (This is why `phone_required` questions are not good first issues: most providers don't document it, and answering needs a sign-up. They live in the [#7](https://github.com/pacocartones/free-llm-api-hub/issues/7) checklist instead.)
2. **One or two files**, named in the issue.
3. **A named check** that must pass, for example `npm run build && npm test`, or `npm run check` for `data/` changes.
4. **Under about two hours** for someone new to the repository.
5. **Unclaimed:** no assignee and no open pull request linked to it.
6. **Reviewed by a maintainer in the last 30 days.**

We keep 8 to 12 of them open at a time. When one closes, the next comes from the [#7](https://github.com/pacocartones/free-llm-api-hub/issues/7) and [#8](https://github.com/pacocartones/free-llm-api-hub/issues/8) checklists or from the weekly re-verification batch. If the provider's docs don't answer the question, that is a useful result too: say so in the issue with the link and the date, and the field stays `null`.

## Using AI

AI-assisted contributions are welcome. Please read [AI_POLICY.md](AI_POLICY.md): understand and test your change, check facts at their source, and own what you submit. Saying you used AI is optional and never counts against you. We also maintain this project with AI agents under human oversight; a human maintainer reviews every merge ([how this project is maintained](README.md#how-this-project-is-maintained)).

Replies in this repository's issues, pull requests and discussions are prepared by an AI agent working under the supervision of the repository owner.

Commit messages: AI-assisted contributions are welcome when you have verified the change (see above). You do not need to remove a trailer your tool adds, and you can commit under any email address. Commits written by the maintainers carry no AI attribution trailers and use GitHub noreply addresses; the *Commit policy* check on pull requests enforces that for maintainer identities only. When we squash-merge, we drop AI `Co-authored-by` lines from the final message so `main` stays clean; your authorship stays.

## Review

A human maintainer reviews and is responsible for every merge. Automated review comments (CodeRabbit) are advisory: a person makes the call, and you don't need to reply to the bot. We resolve every review conversation, from people or bots, before merging, either by changing the code or by noting why not.

## Hacktoberfest

October is Hacktoberfest month, but Hacktoberfest 2026 no longer rewards pull requests (it is about learning and building with open-source AI), so a pull request here does not earn Hacktoberfest swag or points, and we do not promise any. Contributions are welcome all year. The [good first issues](https://github.com/pacocartones/free-llm-api-hub/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) are the best place to start (see [Good first issues](#good-first-issues) for what qualifies). Your name goes in [CONTRIBUTORS.md](CONTRIBUTORS.md) when a pull request is merged.

What gets merged is what makes the data more accurate: a field confirmed from the provider's own docs, a stale number corrected, a dead link fixed with its replacement. Pull requests that only reword text, reformat files or add unsourced claims will be closed, and so will pull requests opened without reading the issue they claim to fix.

## What happens next

A maintainer re-checks the source link and the claim, then merges. Once your first PR merges, you are credited in the README [Contributors](README.md#contributors) section (a maintainer refreshes it from git history) — there is nothing extra for you to do. See [GOVERNANCE.md](GOVERNANCE.md) for how decisions are made and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for community norms. By contributing you agree to license your contribution under the repository's [MIT License](LICENSE).

### Your first PR from a fork: the checks may wait

GitHub holds workflow runs from a **first-time contributor** until a maintainer approves them (a safety default for code from new accounts). Until your first pull request here is merged, **every push** to it waits for that approval. If your PR shows no checks, or the required "Dataset integrity" check stays grey at *Expected — Waiting for approval*, that's normal and says nothing about your change. Leave a comment on your PR (e.g. "Could you approve the checks?") and a maintainer will approve the run. Once your first PR is merged, your later PRs run straight away.

## Maintainer notes

- **No regeneration bot — the author ships the derived files.** There is no `bot/regenerate`: `main` requires the "Dataset integrity" check, and a change is complete when its regenerated files are committed in the same PR. After editing `data/providers.json` (or `data/programs.json`), run `npm run build` (and `npm run og` if the OG check flags drift), commit the regenerated files together with the data change, and push. The "Dataset integrity" check fails until they are in sync.
- **Nothing runs on a schedule.** Re-verification, badge refresh, model samples and the live probe are all local on-demand tasks — see [docs/update-playbook.md](docs/update-playbook.md). This project does not depend on GitHub Actions minutes.
