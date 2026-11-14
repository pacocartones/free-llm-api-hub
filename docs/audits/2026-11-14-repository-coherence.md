# Repository coherence audit

Scope: repository documentation, contributor/release instructions, field/schema references, generated-output gates, runbooks, templates, CODEOWNERS and Actions workflows, reviewed from base `46b93b53c1a739a93638f0202a557801ae5634e0`. This is a coherence review, not a new vulnerability assessment or re-verification of provider terms. [PR #619](https://github.com/pacocartones/free-llm-api-hub/pull/619) owns this change and records reproducible validation commands and CI results.

## Decisions implemented

| Evidence | Correction |
|---|---|
| `GOVERNANCE.md`, `.github/CODEOWNERS` | Only **@pacocartones and @LeonMAG** hold maintenance roles and permissions. Remove “Becoming a maintainer”; welcome external contributions without offering roles or repository permissions. Both maintainers are code owners; actual account access remains a GitHub setting. |
| `first-merge-thanks.yml`, `scripts/check-commit-policy.sh`, `CONTRIBUTING.md` | Exclude both maintainers from outsider thanks. Check either maintainer as author or committer against verified name/email pairs and the existing AI-attribution rule, without applying maintainer rules to unrelated contributor identities. Leon's historical pair and numeric noreply provenance are documented in CONTRIBUTING; no bare noreply or unverified alias is accepted. Metadata consistency is not authentication. |
| `SECURITY.md` | Cover the MCP server, credential-bearing local tools and the weekly issue writer. Distinguish static-site, build, validation and MCP dependencies and describe actual browser data requests. |
| `README.md`, `AI_POLICY.md`, `docs/update-playbook.md` | Align agent-maintenance descriptions with human-only source dossiers and the clean-worktree handoff. No provider pages or dossiers were fetched. |
| `docs/architecture.md`, `scripts/build.mjs` | Replace the “only two hand-edited files” claim with the actual canonical/companion/authored input map. Explain generated regions, authoritative serializer order and date/history exceptions. |
| `scripts/check-links.mjs` | Include release docs, templates, package READMEs, nested docs and new non-ignored Markdown. Check decoded local paths after stripping queries/fragments; retain explicit GitHub issue/discussion shortcuts. Regression tests cover the prior omissions and offline behavior. |
| `docs/comparison-dimensions.md` | Generate unknown-field counts in a marked paragraph and cover it with the shared drift gate; preserve authored definitions and document `added`. |
| `.github/workflows/pages.yml` | Trigger deployment when contributing/methodology source docs change, since they generate site pages. |
| `docs/tutorial-first-provider.md`, `RELEASING.md` | Stage the complete reviewed canonical/generated outputs, check drift before pushing and explain the validated provider helper. Test the selected release tag rather than an unrelated checkout; install tools without lifecycle scripts. Match inclusion policy: a required charge disqualifies, a card on file is disclosed. |
| `README.md`, `docs/freshness-sla.md` | Explain that the raw GitHub freshness badge displays its last committed refresh; daily Pages builds do not update it. The explorer computes freshness in the browser. |
| `docs/backlog.md`, `docs/roadmap.md`, `docs/inclusion-criteria.md` | Mark source-proven features shipped, fix website links and replace the dated modality count with a reproducible calculation. Identify the modality cap as editorial rather than validator-enforced. |
| `scripts/probe-cron.sh`, `docs/backlog.md` | Document installed validation dependencies for the cron and local keys for local model backfills. No cron, probe, VPS or publisher command was executed. |

## Workflow exception reviewed

The bundled Maintainer Defense auditor flags `MD-WF-006` at `.github/workflows/tag-release.yml:29`: checkout persists a write-capable credential. The source path is trusted-main dataset push → checkout → version read → annotated tag → authenticated `git push`. This workflow uses that credential; disabling persistence without a replacement breaks tagging. The safe-only proposal is empty. Retain the reviewed exception; a separate hardening change can scope authentication to the push step and test tagging without publishing a real tag.

Fork PR execution, base-branch comment logic, trusted-main worklist publication and separated package-test/publish jobs were inspected in source. Live branch protections, environments, trusted publishing configuration, secrets, enabled schedules and external account access were not verified or modified.

## Actionable follow-up, with evidence preserved

- **Refresh dated companion research through human review.** `docs/self-hosting-on-free-compute.md` explicitly falls outside the weekly provider cadence; `docs/sources.md` contains dated discovery research. Preserve dates and unavailable-source notes until primary sources are re-read. Do not infer current terms or delete entries from age alone.
- **Reduce manual provider recommendations.** README recommendations and adjacent-reference figures can drift independently of generated tables. Move suitable claims to verified generated projections in a separate change; do not substitute new provider facts without evidence.
- **Resolve the optional VPS deployment decision before enabling examples.** The cron's commented alternative publishers and Infisical checklist are undecided examples, not deployed infrastructure. Preserve the human review/PR boundary if this path is implemented.

Historical plans/specifications remain evidence, not current authorization or proof that files can be deleted. Provider records, quote registers, evidence dates and Git history are unchanged. No issues, repository settings, releases or tags were modified; no external maintainer is proposed. The PR is for human review, with no automatic merge or deployment.
