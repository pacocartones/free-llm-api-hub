# Security Policy

This repository contains JSON datasets, a static site, local maintenance scripts and an optional MCP stdio server in `packages/mcp/`. The published website has no application server or database. Local probes use API keys from the operator's environment; those credentials must never enter datasets, logs or generated output.

## Reporting a vulnerability

If you find a security issue — for example, a way the build/validation scripts could be abused, an XSS vector in the interactive site, or a supply-chain concern in the workflows — please report it privately:

- Use **[GitHub's private vulnerability reporting](https://github.com/pacocartones/free-llm-api-hub/security/advisories/new)** (Security → Report a vulnerability), **or**
- Email **admin@freellmapihub.com** (alternative to the private report above; please don't put exploit details in a public issue).

Please **don't** open a public issue for a genuine vulnerability until it's been addressed. We aim to acknowledge reports within 48 hours (best effort).

## Scope

In scope:
- The build/validation and maintenance scripts in `scripts/`, including credential handling in probes and model fetches.
- The MCP stdio server in `packages/mcp/`, its data loading and dependencies.
- The static site in `site/` (e.g. DOM-injection via dataset content).
- The GitHub Actions workflows in `.github/workflows/`.

Out of scope:
- Vulnerabilities in the third-party **LLM providers** listed in the dataset — report those to the provider directly.
- The accuracy of a provider's free-tier terms — that's a data correction, not a security issue. Use the [inaccuracy form](../../issues/new?template=inaccuracy.yml).

## Automation and permissions

The workflows below do not write to `main` directly. Their checked-in triggers and permissions are defined in [`.github/workflows/`](.github/workflows/); live environment protections and repository settings must be checked separately:

| Workflow | Trigger | Token permissions |
|---|---|---|
| `verify.yml` | pull request, relevant `data/**` or `scripts/**` push to `main`, manual | `contents: read` — cannot write anything |
| `commit-policy.yml`, `lighthouse.yml` | pull request (Lighthouse also supports manual runs) | `contents: read` — cannot write anything |
| `mcp-ci.yml` | pull request and push to `main` when the MCP package or its workflow changes | `contents: read` — cannot write anything |
| `ai-trailer-alert.yml` | push to `main` | `contents: read` — reports only |
| `pages.yml` | relevant push to `main`, daily schedule, manual | `contents: read`, `pages: write`, `id-token: write` — publishes the site |
| `codeql.yml` | every pull request, weekly schedule, manual | job-scoped `contents: read`, `actions: read`, `security-events: write` — code scanning |
| `scorecard.yml` | push to `main`, weekly schedule, branch-protection change, manual | workflow default `read-all`; analysis job: `security-events: write`, `id-token: write` — publishes security results |
| `tag-release.yml` | push to `main` (data/providers.json) | `contents: write` — pushes the annotated `vX.Y.Z` tag when the dataset version advances; never writes to `main` |
| `release-mcp.yml` | `mcp-v*` tag | job-scoped `contents: read` and `id-token: write` — publishes to npm and the MCP registry after environment approval |
| `welcome.yml` | first issue or pull request opened | job-scoped `issues: write`, `pull-requests: write` — posts a comment without checking out pull-request code |
| `first-merge-thanks.yml` | pull request closed | job-scoped `pull-requests: write` — comments only after a first outside contribution is merged; does not check out pull-request code |
| `weekly-worklist.yml` | weekly schedule, manual on trusted `main` | job-scoped `contents: read`, `issues: write` — refreshes issue #4 metadata only |
| `issue-assign.yml` | issue comment | job-scoped `issues: write` — handles `/take` and `/release` without checking out repository code |

No workflow that checks out or executes fork pull-request code has repository-content write permissions
or repository secrets. CodeQL requests `security-events: write` only for code-scanning results;
fork pull-request tokens remain subject to GitHub permission restrictions. The `pull_request_target` comment workflows run trusted base-branch logic
with narrowly scoped write tokens and never check out or execute the fork's code.

Derived files are regenerated locally and committed by the author in the same PR. Write-capable
automation is limited to site and package publication, security-result upload, release tagging,
and issue metadata or pull-request comments/assignment. The comment and assignment workflows never check
out or execute pull-request code.
All checkouts disable persisted credentials. Release tagging supplies the token only to
its explicit tag push; no credential is stored in the workspace Git configuration.
CodeQL runs one JavaScript/TypeScript analysis with no build or dependency installation;
it does not analyze Actions workflow YAML. There is no push trigger, so merging a PR
does not duplicate its scan. Superseded runs for
the same PR/ref and event are cancelled. Weekly and manual scans remain available.
See [required checks](CONTRIBUTING.md#required-checks) for the documented check contract
and the distinction between workflow definitions and live branch protection.
The model-sample backfill (`npm run models`) runs locally and on-demand, never in Actions.
A change to `scripts/` is reviewed as code, not as data.

## Release tag integrity and follow-up settings

For a dataset release, the checked-out commit must equal `GITHUB_SHA` and be
reachable from the refreshed `origin/main`. An existing `vX.Y.Z` tag is accepted
only if the remote object is annotated and resolves to exactly that commit;
a lightweight tag, a different commit or unavailable remote state fails the job.
Tags are never moved to make a mismatch pass. Changing provider data without
advancing its version will therefore fail if that version's tag already points
to an earlier commit; resolve the version/release deliberately rather than
rewriting a published snapshot.

Follow-up for a repository owner: configure an external tag ruleset for `v*` to
restrict creation to the authorized release path and prevent updates/deletions,
reviewing necessary bypass permissions. This PR does not apply those settings;
workflow checks alone do not prevent a user or another token from moving tags.

## Notes for users of the data

- The dataset contains **only links to public provider documentation**. It never contains API keys, secrets, or credentials — and it never should. Do not submit any.
- The interactive site is fully static. The explorer reads its inlined data without a request, with same-origin `providers.json` and raw GitHub fallbacks when needed. The compare view fetches same-origin `scores.json` and `providers.json`; the embeddable widget fetches the public dataset. The verified-providers badge is an SVG generated at build and served from this site (no request to `img.shields.io`), and the GitHub star count is written into the pages when the site is built (the deploy reads it from the GitHub API), so the browser makes no GitHub API call for it.
- `scripts/build.mjs` uses Node built-ins and repository modules. Validation uses locked Ajv development dependencies; social-image generation uses `@resvg/resvg-js`. The optional MCP server has runtime dependencies in its own lockfile. Install development tools with `npm ci --ignore-scripts` and review lockfile changes.
