# Changelog

Notable changes to the dataset and the project. Format based on [Keep a Changelog](https://keepachangelog.com/); the project follows [Semantic Versioning](https://semver.org/) for the **dataset schema** (`version` in `data/providers.json`).

- **Data changes** (a provider's limits/terms) are recorded here when notable; every change is also visible in the git history of `data/providers.json`.
- **Schema changes** (a new field, a changed meaning) bump the dataset version and are always recorded.

## [2.0.0] — 2026-07-30

Ground-up redesign into a data-first, continuously-verified open dataset.

### Added
- **Canonical dataset** at `data/providers.json`, validated against `data/schema.json` in CI.
- **Build pipeline** (`scripts/build.mjs`): README tables, the freshness badge, and CSV/YAML exports are now *generated* from the data — no more hand-mirroring.
- **Dataset validator** (`scripts/validate.mjs`): rejects any `verified: true` entry missing a date or a real source link.
- New builder-first fields: `slug`, `free_type`, `openai_compatible`, `modalities`, `expires`, `best_for`.
- Portable exports: `data/providers.csv`, `data/providers.yaml`.
- Redesigned interactive site (landing + explorer) with live stats and an OpenAI-compatible filter.
- Credibility docs: methodology, inclusion criteria, comparison dimensions, roadmap, governance, security, code of conduct, and a `CITATION.cff`.
- New-provider issue form and a pull-request template.

### Changed
- Split CI into `verify.yml` (validate + link-check + weekly badge refresh) and `pages.yml` (site deploy via GitHub Actions).
- Link-checking now reads `docs_url` straight from the dataset instead of scraping the README.
- README rebuilt around the trust story, with a "pick by what you actually need" decision table.
- Resolved a prior inconsistency: Groq is marked `phone_required: true`, matching its signup flow.

### Migration
- `providers.json` moved from the repo root to `data/providers.json`; the site moved to `site/`.
- The freshness badge stays at `badge-freshness.json` (root), so existing embed URLs keep working.

## [1.0.0]

- Initial curated list: README tables, a root `providers.json`, an interactive explorer, a freshness badge, and a weekly link-check workflow.
