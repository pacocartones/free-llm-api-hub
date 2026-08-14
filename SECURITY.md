# Security Policy

This is a data-and-docs repository — a JSON dataset, a static site, and small zero-dependency build scripts. There's no server, no database, and no user data. Still, a few things are worth stating.

## Reporting a vulnerability

If you find a security issue — for example, a way the build/validation scripts could be abused, an XSS vector in the interactive site, or a supply-chain concern in the workflows — please report it privately:

- Use **[GitHub's private vulnerability reporting](https://github.com/pacocartones/free-llm-api-hub/security/advisories/new)** (Security → Report a vulnerability), **or**
- Email the maintainer via the address on their [GitHub profile](https://github.com/pacocartones).

Please **don't** open a public issue for a genuine vulnerability until it's been addressed. We aim to acknowledge reports within a few days.

## Scope

In scope:
- The build/validation scripts in `scripts/`.
- The static site in `site/` (e.g. DOM-injection via dataset content).
- The GitHub Actions workflows in `.github/workflows/`.

Out of scope:
- Vulnerabilities in the third-party **LLM providers** listed in the dataset — report those to the provider directly.
- The accuracy of a provider's free-tier terms — that's a data correction, not a security issue. Use the [inaccuracy form](../../issues/new?template=inaccuracy.yml).

## Automation and permissions

Three workflows run against this repository; none of them can write to `main`:

| Workflow | Trigger | Token permissions |
|---|---|---|
| `verify.yml` | pull request, push to `main`, manual | `contents: read` — cannot write anything |
| `pages.yml` | push to `main`, manual | `contents: read`, `pages: write` — publishes the site |
| `codeql.yml` | pull request, push to `main` | `contents: read` (job: `security-events: write`) — code scanning |

A pull request from a fork therefore never runs with a token that can write to this
repository, and never has access to repository secrets.

Derived files are regenerated locally and committed by the author in the same PR — there is
no write-capable automation. A change to `scripts/` is reviewed as code, not as data.

## Notes for users of the data

- The dataset contains **only links to public provider documentation**. It never contains API keys, secrets, or credentials — and it never should. Do not submit any.
- The interactive site is fully static; its only network calls are the inlined dataset (with a `raw.githubusercontent.com` fallback), the live GitHub star count (`site.js`, cached 6h), and the live verified-providers badge (`img.shields.io`, whose endpoint JSON is served from this site).
- The build scripts have **zero runtime dependencies**, which keeps the supply-chain surface minimal by design.
