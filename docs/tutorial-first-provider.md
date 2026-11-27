# Tutorial: Add your first provider

You've found a free LLM API that isn't in the dataset yet, and you want it listed. By the end of this tutorial you'll have opened a pull request that adds a **verified entry** — with concrete free-tier numbers, the catch, and a primary source — and seen it merged.

You'll learn the whole loop once, with a real example:

1. Check the provider qualifies
2. Add one JSON object to `data/providers.json`
3. Pass the validator
4. Regenerate the files derived from the data
5. Open a PR that the "Dataset integrity" check accepts

Time: about 30 minutes. Install the locked development tools once with `npm ci --ignore-scripts`; the shipped site itself has no runtime dependencies.

## Our worked example: AI21 Labs

We'll use **AI21 Labs** as the worked example: a $10 trial credit on their Jamba long-context models, valid for 3 months, no card required for the trial itself.

> **A note on the example.** AI21 is *already* in the dataset — that's the point. Its real entry demonstrates every shape you'll meet (trial credit, `expires`, tri-state flags, the catch), and the snippets illustrate the field shapes; the current record and schema take precedence. Never copy its verification date or claims to another provider without checking that provider's sources. For the actual exercise, pick any provider that isn't tracked yet and follow the identical steps.

## Before you start

- A GitHub account.
- `git` on your `PATH` and Node.js 24 or later (the version used in CI is pinned in [`.nvmrc`](../.nvmrc)).
- A quick skim of what qualifies: [inclusion-criteria.md](inclusion-criteria.md) and what "verified" means in [methodology.md](methodology.md).

**One gotcha that stops first-timers cold:** the tooling mines per-provider change history from `git log`, so you need a **full clone** — not `--depth 1`, not a tarball download.

```bash
git clone https://github.com/pacocartones/free-llm-api-hub
cd free-llm-api-hub
npm ci --ignore-scripts
```

`npm ci --ignore-scripts` installs the locked local tools, including JSON Schema validation, without running package lifecycle scripts. If you already cloned shallow, fix it with `git fetch --unshallow`. The history-dependent tests fail if the clone lacks the required history; the schema validator alone does not detect this.

## Step 1 — Check it qualifies and isn't already tracked

Two quick checks before touching anything:

1. **Does it earn a spot?** Skim [inclusion-criteria.md](inclusion-criteria.md). The usual rejects: consumer chat UIs, "free" that requires a charge before use, vaporware, trials that are just a signup wall with no real quota.
2. **Is it already there?** Search the dataset:

```bash
grep -i "ai21" data/providers.json
```

If AI21 appears in the results, that's expected because it is already tracked. For your contribution, replace `ai21` in the search command with the slug of the provider you want to add. If that provider is already tracked, the more valuable contribution is fixing a `null` flag or a stale number — see [the "confirming a single unknown field" note in CONTRIBUTING](../CONTRIBUTING.md).

Not ready to do the work yet? File the one-minute [new-provider issue form](https://github.com/pacocartones/free-llm-api-hub/issues/new?template=new-provider.yml) instead and someone else can pick it up.

## Step 2 — Set up your fork and branch

Fork the repo on GitHub, then:

```bash
git remote add fork https://github.com/<your-username>/free-llm-api-hub
git checkout -b add-your-provider
```

Replace `<your-username>` with your GitHub username. Use a branch name that reflects your contribution, such as `add-<slug>` or `fix-<slug>`.

## Step 3 — Add the entry

For a new provider, prefer `npm run add-provider -- <slug> "<Name>"` to prepare a draft; complete it from primary sources and run the command again to validate and serialize it. See [the helper contract](../CONTRIBUTING.md#for-provider-data-edit-the-source). The object below explains the fields; it is not a ready-to-paste serialized row.

Open `data/providers.json`. It's one JSON file with a `providers` array — the **single source of truth** for the README tables, the badge, the exports, and the whole site. Everything else is generated from it.

Use this existing AI21 Labs entry as a reference for the fields. Do not add it again, because AI21 is already in the dataset. For your contribution, adapt the object to the provider you chose and add it to the array (insert it near similar entries; position is cosmetic — the build re-sorts — but a tidy diff is easier to review):

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
  "is_text_llm": true,
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

Leave the `version` and `generated` fields at the top of the file as they are. They are the dataset release: `generated` is the day of the release and changes only together with `version`, in a release pull request. A data pull request that moves `generated` fails the *Dataset integrity* check, because every other open data pull request would conflict on that line. Your dates go in `last_verified`, `added` and `checked`; none may be after today in UTC.

Then describe your change for the changelog in a new file, `changes/unreleased/add-your-provider.md` (not in `CHANGELOG.md`):

```markdown
### Added

- Your Provider: what it gives for free, in one line.
```

### Data policy (added in v2.11.0)

`data_policy` records what the provider itself says about your prompts on this free access: whether it trains on them and how long it keeps them. Add it to your entry as one more field, on one line, like the rest of the object:

```json
"data_policy": {"trains_on_prompts":false,"retention":null,"source":"https://www.ai21.com/terms-policies/privacy-policy/","checked":"2026-10-15","quote":"Consistent with our Terms of Service, and unless otherwise agreed in writing or required to provide the Services, we do not use your inputs or outputs to train AI21’s foundational or generally available AI models.","plan_named":false}
```

AI21's policy applies where AI21 acts as controller — for example, for individual-developer accounts; for a business customer, that processing is governed by its agreement with the customer. The policy does not mention a free, trial, paid or other plan, so `plan_named:false` means only that the quoted sentence names no plan — not that the free plan is covered, and not that it is excluded. The actual AI21 entry records that scope in `note`.

A few rules trip people up:

1. **The entry must sit on one line**, like the others, or `npm test` fails with `serializer does not round-trip`.
2. **`trains_on_prompts` and `retention` stay `null` when the page says nothing** — never guess `false`. `retention` is a period such as `"30 days"` or `"not stored"`; `null` means not stated.
3. **`checked` is the day you read that source, not today by default** — the example above carries the day `https://www.ai21.com/terms-policies/privacy-policy/` was read (`2026-10-15`). Replace it with your own reading day, and never with a date after today in UTC.
4. **At least one of the two must be stated.** A `data_policy` whose `trains_on_prompts` and `retention` are both `null` records nothing, so the validator refuses it (`data_policy must state trains_on_prompts or retention (an all-null policy records nothing)`). If the page says neither, leave `data_policy` out of the entry — or set it to `null` — rather than writing an all-`null` object.
5. **If your `data_policy` has a `quote` or a `note` with passages in «...», register them in `data/quotes.json`.** After editing the row, run `npm run quotes:add -- <slug>`; the command writes the `sentence` entry for a `quote`, and a `note_passage` entry for each passage in «...». Commit the resulting `data/quotes.json`. See [`docs/quotes.md`](quotes.md).
6. **Build, but commit only the data**: run `npm run build && npm test` to check the entry renders, then commit the data change without the regenerated files (see [Step 6](#step-6--commit-and-open-the-pr)).

The full definition — `source`, `checked`, `quote`, `note` and `plan_named` included — is the `data_policy` entry in [`data/schema.json`](../data/schema.json).

## Step 4 — Pass the validator

```bash
npm test
```

If the tests fail, inspect the output and fix issues related to your contribution. Some failures may be unrelated to your changes, so check whether they also occur on the unchanged baseline. Two possible validation errors are:

```text
ai21: verified entry needs a YYYY-MM-DD last_verified
top-level: generated changed from 2026-08-01 to 2026-08-14 without a release. Leave "generated": "2026-08-01" as it is: ...
```

These are illustrative examples, not guaranteed failures. The dates and provider-specific message may differ in your checkout. Fix data-related validation errors in the data, not by loosening the check. Before opening your PR, investigate any remaining failures and report unrelated baseline failures rather than assuming the full suite passes.

## Step 5 — Regenerate the derived files

The dataset is the source; everything else is a projection of it. Regenerate:

```bash
npm run build
```

This rewrites the README tables, the collection pages, and the whole site payload (explorer data, per-provider pages, sitemap). Then, if the OG check flags drift:

```bash
npm run og
```

**Never hand-edit the generated files** — edit the data and let the build rewrite them. For fixed inputs, Git history and reference day, the build is idempotent. The freshness badge changes with the calendar, so it is written to `site/` and never committed; see [Architecture](architecture.md) for date-relative and history-derived exceptions. You look at what the build wrote, but you do not commit it (Step 6).

## Step 6 — Commit and open the PR

The repository runs the [regeneration bot](regeneration-bot.md) in push mode (`.github/regen-mode` says `push`): after your pull request is merged, the bot commits the regenerated files to `main`. So commit **only the source files you edited** — the data, your changelog fragment and, if you registered a quote, `data/quotes.json` — and none of the files the build rewrote:

```bash
git status --short
git diff -- data changes
# Stage only what you wrote by hand:
git add -- data changes
git commit -m "feat: add your provider"
git restore .   # discard what the build rewrote (README tables, site/, collections/, fingerprints)
git push -u fork add-your-provider
```

If you chose a different branch name, use that name in the push command too.

`npm run check` follows the mode too. In push mode it runs CI's push-mode gate against the merge base with `origin/main`: the derived files your pull request leaves stale on purpose pass, because the bot regenerates them after the merge. If the *Regeneration mode* step of the "Dataset integrity" check ever prints a mode other than `push` (a rollback), commit the regenerated files with the data instead and run `npm run check` until it finds no drift, as [CONTRIBUTING.md](../CONTRIBUTING.md#for-provider-data-edit-the-source) describes.

Open the pull request. Give it a title that says what changed and a body with the source link and what you confirmed.

The required **"Dataset integrity"** check validates the data, the internal links and the OG images, runs the test suite on a freshly regenerated tree, and checks — via the drift gate — that you did not hand-edit a generated file. When it's green, a maintainer re-checks your source link and the claim, then merges.

> **Your first PR from a fork may sit grey for a bit.** GitHub holds workflow runs from first-time contributors until a maintainer approves them. If the check shows *Expected — Waiting for approval*, that's normal and says nothing about your change. Leave a comment ("Could you approve the checks?") and it'll run.

## What happens next

On merge, the entry goes live: the explorer and provider page appear, the badge count updates, and the freshness clock starts — your entry joins the 90-day re-verification system (see [freshness-sla.md](freshness-sla.md)).

## Common mistakes

| Mistake | What happens | Fix |
|---|---|---|
| `verified: true` with no `last_verified` or no real `docs_url` | Validator rejects | Confirm against the provider's own docs and date it, or set `verified: false` |
| `verified: false` with a date | Validator rejects (`unverified entry must have last_verified: null`) | Set `last_verified: null`, explain in `notes` |
| Shallow clone | Test suite fails on history integrity | `git fetch --unshallow` |
| Bumped `generated` | "Dataset integrity" check fails at its "Release stamp moves only with the version" step | Put it back as it is on `main`: it changes only in a release |
| Committed regenerated files (README tables, `site/`, `collections/`) by hand | "Dataset integrity" fails if one does not match the build | Undo it with `git checkout origin/main -- <file>`: the bot regenerates them after the merge |
| Marketing language in `free_tier`/`rate_limits` | Reviewer sends it back | Use the exact published numbers, or say "not published" |
| Renaming or reusing a `slug` | Breaks external references | Slugs are permanent |
| PR falls behind `main` | Generated files conflict with newer commits | Run `npm run sync-main` — see [Updating your branch from main](../CONTRIBUTING.md#updating-your-branch-from-main) |
| Checks show "Waiting for approval" | First-time fork PRs pause before workflows run | Nothing is wrong; wait for a maintainer to approve the run — see [Your first PR from a fork](../CONTRIBUTING.md#your-first-pr-from-a-fork-the-checks-may-wait) |

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
