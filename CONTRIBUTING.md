# Contributing

The entire value of this project is that its data can be trusted. Every contribution should make the dataset **more accurate, better sourced, or more current** — that's the bar.

Thanks for helping. Here's how it works.

## The one rule that matters

> **Edit the data, not the docs.** The single source of truth is [`data/providers.json`](data/providers.json). The README tables, the freshness badge, the CSV/YAML exports, the `collections/` markdown, and the whole interactive site (explorer, per-provider pages, collection pages, badges, sitemap) are all *generated* from it.

**Your pull request ships its own regenerated files.** After editing `data/providers.json`, run `npm run build` (and `npm run og` if the OG check flags drift) and commit the regenerated files together with the data change. There is no regeneration bot — the required "Dataset integrity" check fails until the derived files are in sync.

Fixing a rate limit means editing one field plus the files regenerated from it — still a small, reviewable diff.

## Quick start

```bash
git clone https://github.com/pacocartones/free-llm-api-hub
cd free-llm-api-hub

# edit data/providers.json, then:
npm test          # validate the dataset against the integrity rules
```

That's the whole loop. No dependencies to install — the scripts are plain Node (the version used in CI is pinned in [`.nvmrc`](.nvmrc); anything ≥18 works locally).

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
npm run build     # regenerates README tables, badge, exports and the site payload
```

Just don't commit what it produces.

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
- If the weekly link-check already opened a "🔗 Broken source link report" issue, feel free to just comment there with what you found.

## Style

- Keep table cells scannable — short phrases, not paragraphs.
- Prefer the primary number over the marketing framing.
- Match the tone of the existing entries: precise, plain, no hype.

## Contributing code

Data PRs are the common case, but scripts and site changes are welcome too. Start with **[docs/architecture.md](docs/architecture.md)** — it maps the pipeline, what each script does, and the two-places rule (the homepage is hand-written; everything else is generated). The checks a code PR must pass: `npm test` (data integrity + internal links) and, if you touched anything the build consumes, `npm run check` (build idempotency + drift).

## What happens next

A maintainer re-checks the source link and the claim, then merges. Once your first PR merges, you are listed in the README [Contributors](../README.md#contributors) section automatically — it is rendered from git history, so there is nothing extra to do. See [GOVERNANCE.md](GOVERNANCE.md) for how decisions are made and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for community norms. By contributing you agree to license your contribution under the repository's [MIT License](LICENSE).

### Your first PR from a fork: the checks may wait

GitHub holds workflow runs from a **first-time contributor** until a maintainer approves them (a safety default for code from new accounts). If your PR shows no checks, or the required "Dataset integrity" check stays grey at *Expected — Waiting for approval*, that's normal and says nothing about your change. Just leave a comment on your PR (e.g. "Could you approve the checks?") and a maintainer will approve the run. This only happens on the very first PR from your account.

## Maintainer notes

- **No regeneration bot — the author ships the derived files.** There is no `bot/regenerate`: `main` requires the "Dataset integrity" check, and a change is complete when its regenerated files are committed in the same PR. After editing `data/providers.json` (or `data/programs.json`), run `npm run build` (and `npm run og` if the OG check flags drift), commit the regenerated files together with the data change, and push. The "Dataset integrity" check fails until they are in sync.
- **Nothing runs on a schedule.** Re-verification, badge refresh, model samples and the live probe are all local on-demand tasks — see [docs/update-playbook.md](docs/update-playbook.md). This project does not depend on GitHub Actions minutes.
