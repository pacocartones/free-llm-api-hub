# Contributing

The entire value of this project is that its data can be trusted. Every contribution should make the dataset **more accurate, better sourced, or more current** — that's the bar.

Thanks for helping. Here's how it works.

## The one rule that matters

> **Edit the data, not the docs.** The single source of truth is [`data/providers.json`](data/providers.json). The README tables, the freshness badge, the CSV/YAML exports and the interactive site are all *generated* from it. If you hand-edit a generated file, your change is overwritten on the next build.

## Quick start

```bash
git clone https://github.com/pacocartones/free-llm-api-hub
cd free-llm-api-hub

# edit data/providers.json, then:
npm run build     # regenerate README tables, badge, exports, site payload
npm test          # validate the dataset against the integrity rules
```

No dependencies to install — the scripts are plain Node (≥18). Commit the regenerated files along with your data change.

## Adding or updating a provider

Fields are documented in **[docs/comparison-dimensions.md](docs/comparison-dimensions.md)**; what qualifies is in **[docs/inclusion-criteria.md](docs/inclusion-criteria.md)**. The essentials:

1. **Link to the provider's own official docs** — a pricing or rate-limit page on the provider's domain. Third-party summaries (including other curated lists) are fine for *finding* a provider, but the `docs_url` must be a primary source.
2. **Use concrete numbers.** `30 req/min`, `10,000 tokens/day`, `$5 credit` — never "generous limits" or other marketing language. If a provider doesn't publish exact figures, say so explicitly instead of inventing a plausible-looking one.
3. **Capture the catch.** Phone/card requirements, "evaluation only / not for production" clauses, data-training opt-ins, resale/commercial restrictions, region locks — the fine print is usually the most useful part of an entry.
4. **Set the honesty flags correctly:**
   - Confirmed it against the provider's own docs today? → `verified: true`, `last_verified: "<today, YYYY-MM-DD>"`, real `docs_url`.
   - Couldn't fully confirm it? → `verified: false`, `last_verified: null`, and explain what's unconfirmed in `notes`. **An honestly-flagged uncertain entry is more valuable than a confident wrong one** — and the validator will reject a `verified: true` entry that lacks a date or source link.

Slugs are permanent identifiers — never rename or reuse a `slug`.

## Reporting without a PR

- **Something's outdated or wrong:** the [structured issue form](../../issues/new?template=inaccuracy.yml) takes under a minute.
- **A new provider to add:** the [new-provider form](../../issues/new?template=new-provider.yml).
- If the weekly link-check already opened a "🔗 Broken source link report" issue, feel free to just comment there with what you found.

## Style

- Keep table cells scannable — short phrases, not paragraphs.
- Prefer the primary number over the marketing framing.
- Match the tone of the existing entries: precise, plain, no hype.

## What happens next

A maintainer re-checks the source link and the claim, then merges. See [GOVERNANCE.md](GOVERNANCE.md) for how decisions are made and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for community norms. By contributing you agree to license your contribution under the repository's [MIT License](LICENSE).
