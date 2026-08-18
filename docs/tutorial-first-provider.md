# Tutorial: Add your first provider

You've found a free LLM API that isn't in the dataset yet, and you want it listed. By the end of this tutorial you'll have opened a pull request that adds a **verified entry** — with concrete free-tier numbers, the catch, and a primary source — and seen it merged.

You'll learn the whole loop once, with a real example:

1. Check the provider qualifies
2. Add one JSON object to `data/providers.json`
3. Pass the validator
4. Regenerate the files derived from the data
5. Open a PR that the "Dataset integrity" check accepts

Time: about 30 minutes. No dependencies to install — the scripts are plain Node.

## Our worked example: AI21 Labs

We'll use **AI21 Labs** as the worked example: a $10 trial credit on their Jamba long-context models, valid for 3 months, no card required for the trial itself.

> **A note on the example.** AI21 is *already* in the dataset — that's the point. Its real entry demonstrates every shape you'll meet (trial credit, `expires`, tri-state flags, the catch), and every snippet and command output below is the literal, current truth. For the actual exercise, pick any provider that isn't tracked yet and follow the identical steps.

## Before you start

- A GitHub account.
- `git` on your `PATH` and Node.js ≥ 18 (the version used in CI is pinned in [`.nvmrc`](../.nvmrc)).
- A quick skim of what qualifies: [inclusion-criteria.md](inclusion-criteria.md) and what "verified" means in [methodology.md](methodology.md).

**One gotcha that stops first-timers cold:** the tooling mines per-provider change history from `git log`, so you need a **full clone** — not `--depth 1`, not a tarball download.

```bash
git clone https://github.com/pacocartones/free-llm-api-hub
cd free-llm-api-hub
```

If you already cloned shallow, fix it with `git fetch --unshallow`. The validator fails loudly either way, so you'll know.

## Step 1 — Check it qualifies and isn't already tracked

Two quick checks before touching anything:

1. **Does it earn a spot?** Skim [inclusion-criteria.md](inclusion-criteria.md). The usual rejects: consumer chat UIs, "free with a card on file", vaporware, trials that are just a signup wall with no real quota.
2. **Is it already there?** Search the dataset:

```bash
grep -i "ai21" data/providers.json
```

No match — good. (If it *is* tracked, the more valuable contribution is fixing a `null` flag or a stale number — see [the "confirming a single unknown field" note in CONTRIBUTING](../CONTRIBUTING.md).)

Not ready to do the work yet? File the one-minute [new-provider issue form](../../issues/new?template=new-provider.yml) instead and someone else can pick it up.

## Step 2 — Set up your fork and branch

Fork the repo on GitHub, then:

```bash
git remote add fork https://github.com/<your-username>/free-llm-api-hub
git checkout -b add-ai21-labs
```

A branch named after the provider (`add-<slug>`, `fix-<slug>`) keeps your PR title obvious.

## Step 3 — Add the entry

Open `data/providers.json`. It's one JSON file with a `providers` array — the **single source of truth** for the README tables, the badge, the exports, and the whole site. Everything else is generated from it.

Add this object to the array (insert it near other trial-credit entries; position is cosmetic — the build re-sorts — but a tidy diff is easier to review):

```json
{
  "slug": "ai21",
  "name": "AI21 Labs",
  "category": "trial",
  "free_type": "trial-credit",
  "free_tier": "$10 trial credit, valid 3 months",
  "rate_limits": "Jamba Large/Mini: 10 RPS / 200 RPM by default",
  "notes": "Card not required for the trial credit itself, required once it expires",
  "best_for": "Jamba long-context models on a $10 trial",
  "modalities": ["text"],
  "models_free": null,
  "expires": "3 months",
  "docs_url": "https://docs.ai21.com/docs/usage-cost",
  "phone_required": null,
  "card_required": false,
  "commercial_ok": null,
  "openai_compatible": null,
  "openai_base_url": null,
  "env_key": "AI21_API_KEY",
  "verified": true,
  "last_verified": "<today, YYYY-MM-DD>"
}
```

Every field is defined in [comparison-dimensions.md](comparison-dimensions.md). The rules that matter here:

- **`slug` is a permanent identifier.** Kebab-case, unique, never renamed or reused. External links reference it.
- **Concrete numbers, not marketing.** `"$10 trial credit, valid 3 months"`, not `"generous credit"`. If the provider doesn't publish exact figures, say so explicitly.
- **Capture the catch.** The fine print is the most useful part of an entry — for AI21 it's *"card required once the trial expires."*
- **Tri-state flags are about evidence, not vibes.** `card_required: false` means *confirmed* no card; `phone_required: null` means *nobody has confirmed it yet* — which is a task, not an answer.
- **`verified: true` is a promise.** It means you confirmed the core facts against the provider's own docs *today* — so it ships with a real `docs_url` and a `last_verified` date. If you couldn't fully confirm it, set `verified: false` and `last_verified: null`, and say what's unconfirmed in `notes`. An honestly-flagged uncertain entry beats a confident wrong one.

Then find the `generated` field near the top of the file. It must cover the newest verification or addition in the dataset:

```json
"generated": "<today, YYYY-MM-DD>"
```

If your `last_verified` is newer than it, the validator refuses — because the sitemap, the API and the citation would otherwise expose a stale "as of" date.

## Step 4 — Pass the validator

```bash
npm test
```

Expect it to fail on your first try — that's the point of the gate. The two classic failures:

```text
ai21: verified entry needs a YYYY-MM-DD last_verified
top-level: generated (2026-08-01) is older than the newest last_verified/added (2026-08-14) — bump it in data/providers.json
```

Fix each one in the data, not by loosening the check. When it's green you'll see the integrity rules pass, the internal link check pass, and the full test suite completes.

## Step 5 — Regenerate the derived files

The dataset is the source; everything else is a projection of it. Regenerate:

```bash
npm run build
```

This rewrites the README tables, the freshness badge, the collection pages, and the whole site payload (explorer data, per-provider pages, sitemap). Then, if the OG check flags drift:

```bash
npm run og
```

**Never hand-edit the generated files** — edit the data and let the build rewrite them. `npm run build` in a clean checkout is idempotent, so a regenerated file that shows up in your diff means the data changed underneath it. Commit both together.

## Step 6 — Commit and open the PR

Commit the data change **and** the regenerated files in the same commit — a data PR without its derived files fails CI by design, because there is no regeneration bot:

```bash
git add data/providers.json README.md badge-freshness.json CITATION.cff site collections
git commit -m "feat: add AI21 Labs free trial credit"
git push -u fork add-ai21-labs
```

`CITATION.cff` is in that list on purpose: it carries the dataset date, so bumping `generated` rewrites it — skip it and the drift gate fails.

Open the pull request. Give it a title that says what changed (`feat: add AI21 Labs free trial credit`) and a body with the source link and what you confirmed.

The required **"Dataset integrity"** check validates the data, the internal links, the OG images, and — via the drift gate — that the regenerated files match the data. When it's green, a maintainer re-checks your source link and the claim, then merges.

> **Your first PR from a fork may sit grey for a bit.** GitHub holds workflow runs from first-time contributors until a maintainer approves them. If the check shows *Expected — Waiting for approval*, that's normal and says nothing about your change. Leave a comment ("Could you approve the checks?") and it'll run.

## What happens next

On merge, the entry goes live: the explorer and provider page appear, the badge count ticks up, and the freshness clock starts — your entry is now one of the 69 the 90-day re-verification system keeps honest (see [freshness-sla.md](freshness-sla.md)).

## Common mistakes

| Mistake | What happens | Fix |
|---|---|---|
| `verified: true` with no `last_verified` or no real `docs_url` | Validator rejects | Confirm against the provider's own docs and date it, or set `verified: false` |
| `verified: false` with a date | Validator rejects (`unverified entry must have last_verified: null`) | Set `last_verified: null`, explain in `notes` |
| Shallow clone | Test suite fails on history integrity | `git fetch --unshallow` |
| Forgot to bump `generated` | Validator rejects | Set it to today |
| Committed only `data/providers.json` | "Dataset integrity" check fails | Regenerate with `npm run build` and commit the derived files |
| Marketing language in `free_tier`/`rate_limits` | Reviewer sends it back | Use the exact published numbers, or say "not published" |
| Renaming or reusing a `slug` | Breaks external references | Slugs are permanent |

## Recap

You checked inclusion → added one JSON object → passed the validator → regenerated the derived files → opened a PR that CI accepts. That's the whole contribution loop, and it's the same shape whether you're adding a provider, fixing a rate limit, or resolving a `null` flag.

**Where to go deeper:**
- Every field and flag, defined: [comparison-dimensions.md](comparison-dimensions.md)
- What earns a spot, and what gets rejected: [inclusion-criteria.md](inclusion-criteria.md)
- What "verified" really means, and its limits: [methodology.md](methodology.md)
- The weekly ritual that keeps entries honest: [update-playbook.md](update-playbook.md)
- The 90-day freshness system your entry just joined: [freshness-sla.md](freshness-sla.md)

---

_[← Docs index](README.md) · [Main README](../README.md)_
