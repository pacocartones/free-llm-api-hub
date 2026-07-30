# Governance

Lightweight on purpose. This project is small; the rules exist to keep it **trustworthy and neutral**, not to add ceremony.

## Roles

- **Maintainer(s)** — review contributions, verify claims against primary sources, and decide what ships. Currently [@pacocartones](https://github.com/pacocartones).
- **Contributors** — anyone opening an issue or PR. Every entry in the dataset exists because someone checked it.

## How decisions get made

- **Data changes** (add/update/remove a provider) are accepted when they meet the [inclusion criteria](docs/inclusion-criteria.md) and are backed by the provider's **own documentation**, per the [methodology](docs/methodology.md). This is a factual bar, not a matter of opinion — if the source supports it, it goes in; if it can't be confirmed, it ships flagged ⚠️ or not at all.
- **Scope and structural changes** (new fields, new sections, tooling) are proposed via issue or [discussion](https://github.com/pacocartones/free-llm-api-hub/discussions) and decided by the maintainers, guided by the [roadmap](docs/roadmap.md) principles: builder-first, trust over coverage, narrow scope.
- **Disagreements** are resolved by pointing at primary sources. When sources conflict or are silent, the entry is marked uncertain rather than forced to a confident value.

## Neutrality

- **No pay-for-placement.** Ordering and inclusion are never influenced by money or relationships. Providers cannot buy a spot, a ranking, or a "verified" mark.
- **No undisclosed affiliation.** The project is independent of every provider listed. Any future sponsorship or affiliate arrangement would be disclosed prominently and must not affect what's listed or how it's ranked.
- **Corrections are public.** Notable changes and removals are recorded in [CHANGELOG.md](CHANGELOG.md); nothing is quietly rewritten.

## Continuity

The dataset is MIT-licensed and fully self-contained in this repository — data, schema, and the scripts that build everything from it. Anyone can fork and continue it without special access or hidden infrastructure. That's intentional: the project's trustworthiness shouldn't depend on any single person staying around.

## Becoming a maintainer

Sustained, high-quality contributions — accurate entries, good sourcing, helpful review — are the path. If you're contributing regularly and want to help maintain, open a discussion.
