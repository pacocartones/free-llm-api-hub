# Methodology

How entries get on this list, what "verified" means, and — just as important — what it *doesn't*.

## The problem this solves

Free-tier terms change constantly and quietly. A rate limit gets halved, a docs URL moves, "free forever" becomes "free for 30 days." Most curated lists capture a moment and then rot in place, recommending offers that no longer exist. This project is built to **surface that drift instead of hiding it.**

## What "verified" means

An entry is `verified: true` only when its **core facts** were confirmed against the **provider's own documentation** on the date recorded in `last_verified`. Core facts are:

1. The free tier or trial credit **exists** and is offered by the provider (not a reseller or a third-party summary).
2. The headline **numbers** — rate limits, credit amount, token quota — match the provider's own current docs.
3. The **key catch** is captured — phone/card requirement, "evaluation only" clause, data-training opt-in, commercial-use restriction, region lock.
4. The **`docs_url` resolves** to a live primary source.

The dataset validator (`scripts/validate.mjs`, run in CI) **rejects** any `verified: true` entry that is missing a `last_verified` date or a real `docs_url`. The honesty rule is enforced by machine, not by good intentions.

## What "verified" does *not* mean

- It is **not** a real-time guarantee. Terms can change the day after a check. Always confirm against the linked docs before you rely on a tier.
- It does **not** cover the softer attribute fields (`openai_compatible`, `openai_base_url`, `modalities`, `best_for`). These are progressively backfilled, may be `null`, and are convenience metadata — not part of the verified claim.
- It is **not** an endorsement. This is an independent list with no affiliation to any provider.

## The ⚠️ (unverified) state

When a claim can't be confirmed against an accessible official source — the console is login-walled, `robots.txt`-blocked, or the figure only appears in a community forum — the entry is marked `verified: false`, its `last_verified` is `null`, and `notes` states exactly what couldn't be confirmed. We would rather show a flagged, honest "we're not sure" than a confident number we can't stand behind.

## The freshness engine

1. **Every verified entry is dated.** No date + primary source → it can't be `verified: true`.
2. **Links are re-checked on a schedule.** The [`maintenance.yml`](../.github/workflows/maintenance.yml) workflow runs weekly, checks every `docs_url`, and opens or updates a tracking issue if any return an error — the earliest machine-detectable signal that a provider changed something. ([`verify.yml`](../.github/workflows/verify.yml) is the per-change integrity gate; it does not run on a schedule.)
3. **The freshness badge is computed, not written.** It reports the share of entries re-confirmed within the last 90 days, straight from the data. As entries age past 90 days without re-verification, the badge decays visibly (green → yellow → red). It cannot lie about how current the list is.
4. **Re-verification is continuous.** Reported changes and link-check issues drive re-checks; each updates the entry's `last_verified`.

## Sourcing rules

- The `docs_url` **must** be on the provider's own domain (pricing page, rate-limit docs, official changelog).
- Third-party lists, blog posts and videos are acceptable for *discovering* a provider but never as the cited source for a number.
- When a provider publishes no exact figure, the entry says so plainly rather than inventing one.

## Corrections

Found something wrong or stale? The [inaccuracy form](../../issues/new?template=inaccuracy.yml) is the fastest path, and PRs editing `data/providers.json` are welcome. See [CONTRIBUTING.md](../CONTRIBUTING.md).

---

_[← Docs index](README.md) · [Main README](../README.md)_
