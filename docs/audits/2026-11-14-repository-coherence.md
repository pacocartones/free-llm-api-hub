# Repository coherence audit — 2026-11-14

Repository: `pacocartones/free-llm-api-hub`.
Base: `46b93b53c1a739a93638f0202a557801ae5634e0` (full public clone).
Branch: `docs/repository-coherence-audit`.
Maintainers: **pacocartones and LeonMAG only**.

## Scope and method

Reviewed the root documentation, contributor and release instructions, the docs index and runbooks, architecture and field reference, backlog/roadmap, historical plans/specs, Markdown collections, MCP documentation, canonical and API schema relationships, generated-output gates, issue/PR templates, CODEOWNERS, dependency configuration and all 14 Actions workflows. The base contains 49 tracked Markdown files and 23 data/schema/metadata files. Generated provider outputs were checked through the build and tests rather than treated as authored documentation.

Evidence combines source inspection, the bundled Maintainer Defense auditor, regression tests, a separate baseline build, local path/anchor checks, dataset validation and package checks. This is a repository coherence review, not a new exhaustive application vulnerability assessment or a re-verification of provider terms.

## Findings and changes

| Priority | Evidence | Contradiction or failure | Resolution |
|---|---|---|---|
| High | `GOVERNANCE.md`, `.github/CODEOWNERS` | Only one maintainer was named, and governance advertised an open-ended path to additional maintainers. | Name only pacocartones and LeonMAG; assign both as code owners. CODEOWNERS changes take effect when merged and require appropriate account access. No access/settings changes were made. |
| High | `SECURITY.md`, `packages/mcp/package.json`, `weekly-worklist.yml` | Security scope omitted the MCP server and the weekly issue writer; dependency-free wording obscured validation and package dependencies. | Include the MCP server, credential-bearing local tools and weekly issue workflow, and distinguish static-site, build, validation and MCP dependencies. Document browser dataset/score requests accurately. |
| High | `README.md`, `AI_POLICY.md`, `docs/update-playbook.md` | General claims that agents re-check provider pages conflicted with the explicit human-only dossier boundary. | Align the public maintenance descriptions with human review and the fresh-worktree handoff. No provider pages or dossiers were fetched. |
| Medium | `docs/architecture.md`, `scripts/build.mjs` | “Only two files are hand-edited” and “everything is generated” omitted companion datasets, authored inputs and generated regions. | Document actual input groups, generated regions, serialization order and date/history exceptions. |
| Medium | `scripts/check-links.mjs` | Release docs, templates, package READMEs and nested docs were omitted; every local query and `../../` path was skipped. | Discover tracked and non-ignored new Markdown through Git, check decoded local paths after stripping queries/fragments, and preserve explicit GitHub issue/discussion shortcuts. Six regression tests exercise the omissions and offline behavior. |
| Medium | `docs/comparison-dimensions.md`, `scripts/build.mjs` | Unknown-field counts were hand-maintained and forced unrelated documentation edits on data PRs. | Generate only a marked paragraph from provider records; include the document in the shared drift target list. A regression test proves stale counts are repaired without rewriting authored definitions. Document the existing `added` field. |
| Medium | `.github/workflows/pages.yml` | Authored contributing/methodology edits did not directly trigger deployment despite generating site pages. | Add both source paths to the existing push filter. Other workflow permissions and triggers remain unchanged. |
| Medium | `docs/tutorial-first-provider.md` | The staging command omitted fingerprints and evidence; examples claimed literal currency; a card on file was incorrectly listed as disqualifying. | Stage the reviewed canonical data and complete generated output, point to the validated draft helper and explain example, history and idempotency limits. Match the inclusion policy: a required charge is disqualifying, a card on file is disclosed. |
| Medium | `RELEASING.md` | The introduction denied a package-release path; verification inspected a tag but tested the current checkout. | Describe the gated MCP exception and explicitly check out the selected tag in a clean full clone before installing without lifecycle scripts and running checks. |
| Medium | `README.md`, `docs/freshness-sla.md` | The raw GitHub freshness badge was described as live even though daily Pages builds do not commit it. | Explain that it is the last committed refresh, while the explorer calculates freshness in the browser. No new badge publisher was introduced. |
| Low | `docs/backlog.md`, `docs/roadmap.md` | Implemented model-catalogue URLs, coding tools and history remained pending; website links used skipped repository-relative paths. | Mark the source-proven features shipped and use absolute site links. Leave historical research and unverified leads intact. |
| Low | `docs/inclusion-criteria.md` | A dated 24/69 ratio was presented as today's cap state. | Replace it with a reproducible dataset calculation and identify the 35% rule as editorial. The audited dataset has 23/68 non-text entries (33.8%); no rows were removed. |
| Low | `scripts/probe-cron.sh`, `docs/backlog.md` | The cron prerequisites omitted installed validation tools; local model backfill instructions asked for repository secrets. | Document `npm ci --ignore-scripts` for the cron and local environment/secrets-store keys for local backfills. The cron was not executed. |

## Workflow audit disposition

The bundled auditor reports **1 medium, 0 high, 0 critical** finding: `MD-WF-006`, `.github/workflows/tag-release.yml:29`, checkout persistence of a `contents: write` credential. The path is trusted-main dataset push → checkout → version read → annotated tag → authenticated `git push`. The credential has a concrete purpose in this workflow. The auditor's safe-only patch is empty; blindly disabling persistence would break tagging. The finding is retained as a reviewed exception, not asserted to be an exploitable vulnerability. A future hardening change could scope authentication to the push step with a dedicated regression test.

The comment workflows use base-branch logic without checking out PR code. The weekly worklist checks out trusted main and has narrowly scoped issue write access. Package publishing is separated from dependency-install/test jobs. These are source-level observations; actual protected environments, trusted publisher configuration, branch rules, secrets and enabled schedules were not inspected or modified.

## Verification

- Baseline root suite: **603 passed**, 0 failed, Node 24.22.1.
- Regression tests were first run against the old behavior and failed for the expected omissions; the focused corrected suite passed.
- Final root suite under the CI runtime **Node 22.23.5: 610 passed, 0 failed**. The earlier Node 24 run passed 611 tests before the requested removal of the temporary Codex branch exception and its test. The final patch leaves the branch policy unchanged.
- MCP: **40 passed**, 0 failed; `validate:server-json` passed; `npm pack --dry-run` passed. No package was published.
- OG: **86 images match**, including all 68 provider images.
- History: **72 providers, 222 events**, integrity check passed.
- Editorial ranking: **19 picks**, all verified.
- One-time Markdown anchor review: **49 documents, no unresolved local Markdown anchors**. The regular link checker intentionally validates file paths, not heading IDs or external URLs.
- All `.github` YAML parsed successfully with PyYAML.
- `bash -n` passed for the cron and commit-policy scripts; `git diff --check` passed.
- Lighthouse and final generated drift/CI outcomes are recorded in the PR. A separate full-history baseline clone produced byte-identical HTML for all nine Lighthouse targets; browser JS/styles and their inputs are unchanged by this patch.

One early Node 22 test run detected modified generated-directory timestamps because a separate verification build was run concurrently in the main checkout. That run was not accepted as passing; final tests were repeated without a concurrent main-tree build. The isolation assertion correctly detected the overlapping operation.

## Retained debt and limits

- `docs/self-hosting-on-free-compute.md` is explicitly dated 2026-07-12 and outside the weekly provider cadence. Preserve it as a historical companion; refreshing its third-party terms requires a new human source review. This audit does not change its verification date.
- `docs/sources.md` contains dated discovery/competitor research, not current provider evidence. Preserve dates and unavailable-source notes; do not infer present availability from them.
- `docs/superpowers/` contains historical plans and incomplete checklists. A checklist alone does not prove abandoned work or authorize deletion. The audit preserves these files and does not execute their operational instructions.
- README hand-written provider recommendations and adjacent-reference figures can drift independently of generated tables. This audit corrects source/automation claims but does not invent replacement provider facts. Moving more editorial claims into verified generated projections remains follow-up work.
- `first-merge-thanks.yml` and `.coderabbit.yaml` still explicitly special-case pacocartones. Deciding whether LeonMAG should receive exactly the same comment/review automation is a separate behavioral decision; the maintainer roster is now unambiguous.
- The cron's commented alternative deployment commands and the VPS/Infisical checklist are examples of an undecided deployment path, not evidence of deployed infrastructure. No VPS, probe, model fetch or publishing command was run.
- The private root `package.json` version is tooling metadata and predates the dataset version; dataset/API/tag identity comes from `data/providers.json`. No release/version bump is warranted for this documentation audit.
- External provider links, live sitemap parity and real API calls were not reverified. Doing so would contact third parties and, for evidence dossiers, cross the documented human-review phase. Existing offline schema, consistency and output-safety suites were run instead.

No provider records, evidence dates, quote registers, history, issues, labels, assignments, repository settings, releases or tags were changed. No external maintainer was proposed. The pull request is for human review; it is not merged or deployed by this audit.
