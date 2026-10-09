# Contributing

The entire value of this project is that its data can be trusted. Every contribution should make the dataset **more accurate, better sourced, or more current** — that's the bar.

Thanks for helping. Here's how it works.

## The one rule that matters

> **Edit the data, not the docs.** The single source of truth is [`data/providers.json`](data/providers.json). The README tables, the freshness badge, the `collections/` markdown, and the whole interactive site (explorer, per-provider pages, collection pages, badges, sitemap) are all *generated* from it.

**Your pull request ships its own regenerated files.** After editing `data/providers.json`, run `npm run build` (and `npm run og` if the OG check flags drift) and commit the regenerated files together with the data change. There is no regeneration bot — the required "Dataset integrity" check fails until the derived files are in sync.

Fixing a rate limit means editing one field plus the files regenerated from it — still a small, reviewable diff.

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

Comment on the issue to say you're taking it and a maintainer will assign it to you. If you can't continue, just say so in a comment; that's completely fine, and it frees the issue for someone else. An assigned issue with no activity for two weeks may be offered to another contributor, after a ping.

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

## Review

A human maintainer reviews and is responsible for every merge. Automated review comments (CodeRabbit) are advisory: a person makes the call, and you don't need to reply to the bot. We resolve every review conversation, from people or bots, before merging, either by changing the code or by noting why not.

## Hacktoberfest

This repository takes part in Hacktoberfest. Merged pull requests get the `hacktoberfest-accepted` label. The [good first issues](https://github.com/pacocartones/free-llm-api-hub/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) are the best place to start (see [Good first issues](#good-first-issues) for what qualifies).

What gets merged is what makes the data more accurate: a field confirmed from the provider's own docs, a stale number corrected, a dead link fixed with its replacement. Pull requests that only reword text, reformat files or add unsourced claims will be closed, and so will pull requests opened without reading the issue they claim to fix.

## What happens next

A maintainer re-checks the source link and the claim, then merges. Once your first PR merges, you are credited in the README [Contributors](README.md#contributors) section (a maintainer refreshes it from git history) — there is nothing extra for you to do. See [GOVERNANCE.md](GOVERNANCE.md) for how decisions are made and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for community norms. By contributing you agree to license your contribution under the repository's [MIT License](LICENSE).

### Your first PR from a fork: the checks may wait

GitHub holds workflow runs from a **first-time contributor** until a maintainer approves them (a safety default for code from new accounts). Until your first pull request here is merged, **every push** to it waits for that approval. If your PR shows no checks, or the required "Dataset integrity" check stays grey at *Expected — Waiting for approval*, that's normal and says nothing about your change. Leave a comment on your PR (e.g. "Could you approve the checks?") and a maintainer will approve the run. Once your first PR is merged, your later PRs run straight away.

## Maintainer notes

- **No regeneration bot — the author ships the derived files.** There is no `bot/regenerate`: `main` requires the "Dataset integrity" check, and a change is complete when its regenerated files are committed in the same PR. After editing `data/providers.json` (or `data/programs.json`), run `npm run build` (and `npm run og` if the OG check flags drift), commit the regenerated files together with the data change, and push. The "Dataset integrity" check fails until they are in sync.
- **Nothing runs on a schedule.** Re-verification, badge refresh, model samples and the live probe are all local on-demand tasks — see [docs/update-playbook.md](docs/update-playbook.md). This project does not depend on GitHub Actions minutes.
