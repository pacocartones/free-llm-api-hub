# Security Policy

This is a data-and-docs repository — a JSON dataset, a static site, and small zero-dependency build scripts. There's no server, no database, and no user data. Still, a few things are worth stating.

## Reporting a vulnerability

If you find a security issue — for example, a way the build/validation scripts could be abused, an XSS vector in the interactive site, or a supply-chain concern in the workflows — please report it privately:

- Use **[GitHub's private vulnerability reporting](https://github.com/pacocartones/free-llm-api-hub/security/advisories/new)** (Security → Report a vulnerability), **or**
- Email **admin@freellmapihub.com** (alternative to the private report above; please don't put exploit details in a public issue).

Please **don't** open a public issue for a genuine vulnerability until it's been addressed. We aim to acknowledge reports within 48 hours (best effort).

## Scope

In scope:
- The build/validation scripts in `scripts/`.
- The static site in `site/` (e.g. DOM-injection via dataset content).
- The GitHub Actions workflows in `.github/workflows/`.

Out of scope:
- Vulnerabilities in the third-party **LLM providers** listed in the dataset — report those to the provider directly.
- The accuracy of a provider's free-tier terms — that's a data correction, not a security issue. Use the [inaccuracy form](../../issues/new?template=inaccuracy.yml).

## Automation and permissions

Fourteen workflows run against this repository; none of them writes to `main` directly:

| Workflow | Trigger | Token permissions |
|---|---|---|
| `verify.yml` | pull request, relevant `data/**` or `scripts/**` push to `main`, manual | `contents: read` — cannot write anything |
| `commit-policy.yml`, `lighthouse.yml` | pull request (Lighthouse also supports manual runs) | `contents: read` — cannot write anything |
| `mcp-ci.yml` | pull request and push to `main` when the MCP package or its workflow changes | `contents: read` — cannot write anything |
| `ai-trailer-alert.yml` | push to `main` | `contents: read` — reports only |
| `pages.yml` | relevant push to `main`, daily schedule, manual | `contents: read`, `pages: write`, `id-token: write` — publishes the site |
| `codeql.yml` | every pull request, push to `main`, weekly schedule, manual | job-scoped `contents: read`, `actions: read`, `security-events: write` — code scanning |
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
feature-branch pushes do not create a second scan alongside the PR. Superseded runs for
the same PR/ref and event are cancelled. Weekly and manual scans remain available.
See [required checks](CONTRIBUTING.md#required-checks) for the documented check contract
and the distinction between workflow definitions and live branch protection.
The model-sample backfill (`npm run models`) runs locally and on-demand, never in Actions.
A change to `scripts/` is reviewed as code, not as data.

## Notes for users of the data

- The dataset contains **only links to public provider documentation**. It never contains API keys, secrets, or credentials — and it never should. Do not submit any.
- The interactive site is fully static; its only network call is the inlined dataset (with a `raw.githubusercontent.com` fallback). The verified-providers badge is an SVG generated at build and served from this site (no request to `img.shields.io`), and the GitHub star count is written into the pages when the site is built (the deploy reads it from the GitHub API), so the browser makes no GitHub API call for it.
- The build scripts have **zero runtime dependencies**, which keeps the supply-chain surface minimal by design.
