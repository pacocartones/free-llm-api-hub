# Free LLM API Hub Improvement Sprint Design

## Intent

Improve Free LLM API Hub on three axes at the same time: convert more visitors into active contributors, grow adoption and stars, and increase the coverage and trustworthiness of the dataset. The sprint should produce visible repository activity in the current session without trading away review quality.

## Goals

- Preserve a healthy newcomer queue and shorten the path from issue discovery to a first merged pull request.
- Improve the repository and website's explanation of why developers should use and star the project.
- Improve high-value data quality without consuming the contributor-friendly issues reserved for newcomers.
- Keep dependency and CI maintenance flowing through a fast, verified lane.

## Non-goals and anti-goals

- Do not manufacture activity by deleting and reposting issues that already have participants.
- Do not take the 12 current `good first issue` tasks away from potential contributors.
- Do not ship unsourced provider claims, vanity metrics, dark patterns, or broad redesigns.
- Do not merge any change without focused tests, full required CI and an independent diff review where code or trust boundaries change.

## Approaches considered

1. **Sequential:** finish contributor operations, then growth, then data. Lowest coordination cost but too slow for the requested current-session push.
2. **Maintenance first:** clear every PR and stale issue before product work. Tidy, but optimizes the queue rather than outcomes.
3. **Parallel portfolio (selected):** independent contributor, adoption and data lanes, plus a small maintenance fast lane. It best matches the explicit request to push all three goals now; isolation and separate PRs limit interference.

## Constraints

- Start from the current `origin/main` and use policy-compliant branch names.
- External contributors and active issue conversations take precedence over maintainer convenience.
- Use only official provider sources for factual data changes.
- Keep every PR independently reviewable and mergeable.
- Rebase before the final CI pass when another sprint PR lands first.

## Success signals

- At least one active newcomer issue receives a clear maintainer response or review path, while unclaimed newcomer issues remain available.
- At least one evidence-backed adoption/conversion improvement reaches a reviewed PR.
- At least one non-newcomer data-quality gap reaches a reviewed PR or a self-contained issue with verified evidence.
- Mechanical green dependency updates are reviewed and merged promptly.
