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
2. **Links are re-checked on the re-verification pass.** Each pass opens the provider's own `docs_url` anyway ([update playbook](update-playbook.md)); a dead or changed source is an early machine-detectable signal that a provider changed something. ([`verify.yml`](../.github/workflows/verify.yml) is the per-change integrity gate; nothing runs on a schedule.)
3. **The freshness badge is computed, not written.** It reports the age of the **oldest** verification in the list, straight from the data, and is graded on the same three buckets as the re-verification worklist: green while every entry is under 60 days old (and at least 70% of rows are verified at all — see [freshness-sla.md](freshness-sla.md) for the coverage override), 🟡 amber once any entry is due soon (>60d), 🔴 red once any entry is overdue (>90d, the SLA). It cannot lie about how current the list is.

   It used to report the *share* of entries inside the 90-day SLA, which sounds equivalent and is not. Because the list is re-verified in sweeps rather than one row at a time, that number could not leave bright green until roughly a third of the dataset had gone overdue — about four months of complete silence. It measured whether the project was still alive, not whether the data was fresh. The worst entry moves the day maintenance stops, and it is also the number a reader actually needs: the staleness of the row they are about to trust.
4. **Re-verification is continuous.** Reported changes and link-check issues drive re-checks; each updates the entry's `last_verified`.

## Sourcing rules

- The `docs_url` **must** be on the provider's own domain (pricing page, rate-limit docs, official changelog).
- Third-party lists, blog posts and videos are acceptable for *discovering* a provider but never as the cited source for a number.
- When a provider publishes no exact figure, the entry says so plainly rather than inventing one.

## Corrections

Found something wrong or stale? The [inaccuracy form](../../issues/new?template=inaccuracy.yml) is the fastest path, and PRs editing `data/providers.json` are welcome. See [CONTRIBUTING.md](../CONTRIBUTING.md).

---

_[← Docs index](README.md) · [Main README](../README.md)_

## Model tier

`model_tier` (0-4) says how a provider's best *free* model is rated by people, not how capable it is. It is derived, never typed:

- **Source:** the LMArena [Arena Leaderboard Dataset](https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset) (CC-BY-4.0), config `text_style_control`, category `overall`. Style control discounts the effect of answer length and formatting on votes. Attribution: *Model quality data: LMArena Arena Leaderboard Dataset (CC-BY-4.0), snapshot 2026-10-02.*
- **Mapping:** each id in a provider's `models_free` is matched by hand to one exact Arena `model_name` (`exact` = same id, `variant` = same model with a serving suffix such as `:free` or a quantisation). No match means no tier: a similar model is never substituted. A row counts only with at least 1,000 votes.
- **Thresholds** (an editorial choice, public, independent of any provider): 4 at a rating of 1450 or more, 3 at 1400, 2 at 1330, 1 at 1250, 0 below. `boundary: true` marks a tier that could change at the next snapshot: the row's 95% interval (`ci`) crosses a threshold or comes within 5 rating points of one (derived and checked by `validate.mjs`). Changing a threshold changes published tiers. A tier can also change when the snapshot is refreshed, with or without that flag.
- **Provider tier** = the highest tier among its rated free models. `null` (no source) scores zero and is never estimated; 0 means "sourced and below the lowest threshold".
- **Trial credits are not rated:** a one-time credit is not continuous free access, so those offers carry no tier and no `free_limits`.
- **Limits:** preference votes are human, subject to the usual sampling biases, and move with each snapshot. `validate.mjs` checks that every `model_tier` equals the tier of its cited rating.

`free_limits` follows the same rule: numbers exactly as the provider publishes them, with the page and the day they were read, `null` when it publishes none.

## The score

The score ranks providers from 0 to 100. `scripts/lib/score.mjs` computes it from the data on every run, and `npm run score` prints it with each part. Every number below is a named constant in that file.

| Part | Points | What it reads |
|---|---|---|
| Quality | 22 | `model_tier` / 4 |
| Limits | 18 | the requests per day or tokens per day the provider publishes |
| Friction | 13 | no card required (weight 3) and no phone required (weight 2) |
| Commercial use | 9 | `commercial_ok` |
| OpenAI compatibility | 4 | `openai_compatible` |
| Stability | 4 | the latest live probe in `data/probe-report.json` |
| Editorial | 30 | a rating from 0 to 30 per provider in `data/editorial.json`; a provider without one gets 15. The internal rubric behind the ratings is not published |

- **Unknown is not estimated.** Quality, limits and stability score zero when the data does not confirm them. Friction and commercial use are symmetric around "unknown": a confirmed good answer adds, a confirmed bad one subtracts, and unknown sits in the middle, neither rewarded nor punished. Next to every score the engine reports how many of the six mathematical inputs are confirmed ("n of 6").
- **Limits scale (provisional).** Between a floor and a ceiling on a log scale: 10 to 10,000 requests per day, 10 thousand to 10 million tokens per day; the more generous of the two counts. A monthly figure counts as its daily share (divided by 30). Per-second and per-minute limits are a speed, not an allowance, and are not converted. These two ranges are provisional and may change.
- **Stability** is the latest probe, not an uptime: the repository keeps no probe history. A probe older than 30 days, or a provider without an API key at probe time, is not measured and scores zero.
- **Eligibility.** Only verified providers inside the 90-day freshness SLA are ranked; the top 10 also needs `is_text_llm`. Ties break by the mathematical score, then by name.
- **No position is fixed.** The ranking is recomputed from the data; tests pin properties of the method (weights add up to 100, ranges, determinism), never who ranks where.

