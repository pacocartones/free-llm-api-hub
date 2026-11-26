# Good first issues, batch 5 (draft)

Drafted on 2026-11-26 against `main` at `8b6239e`. A maintainer publishes these with the "Prepared task" form
(`.github/ISSUE_TEMPLATE/task.yml`); each section below follows its fields in order. This file can be deleted once
both issues are published.

## Why two issues, not six

`CONTRIBUTING.md` › Good first issues keeps **at most about 30** open. On 2026-11-26 there are already **31** open
`good first issue`s (#744 to #915, all reviewed on 2026-11-26), so there is no room for six new ones today.

| Step | Open good first issues |
| --- | --- |
| Today | 31 |
| After #931 (closes #915) and #934 (closes #884) merge | 29 |
| Publish issue A | 30 |
| Publish issue B when one more good first issue closes | 30 |

So: publish **A** once #915 and #884 are closed, and **B** after the next good first issue closes. Neither needs the
other. Both avoid the files the open pull requests touch, apart from one line in `site/styles.css` for A (see its
Context).

**Duplicate check.** Compared with every open issue (48, including #870–#916) and the open pull requests (#774, #775,
#815, #896, #908, #929, #931, #933, #934, #935). #884 and #885 are about keyboard access to scrolling tables, not
link underlines. No open issue covers the consent banner colours. The hygiene audit (`docs/maintenance/hygiene-audit-2026-11.md`
in #935) has no deferred finding small enough for a good first issue: what is left needs an owner decision (X5, I4)
or sits in files that open pull requests edit (X2, D1–D5).

**Considered and not drafted now** (good candidates once there is room again):
- `/models/` at 375 px: words break mid-word in the "Free type" and "Modalities" columns (`docs/qa/post-brand-2026-11.md`). It needs a layout choice, so it is Medium, not a good first issue.
- Underlining links inside guide table cells (the other half of the `link-in-text-block` finding). It changes how every guide table looks, so the owner should choose the selector first.
- A Mistral model family page. `scripts/lib/model-families.mjs` plus its test and data; more than two files, so Medium.
- `assets/demo.svg` still uses the old green palette. Redrawing it is a design task.

---

## A. Compare pages: underline the links under the score and the model catalogue

**Title:** `fix: compare pages: underline the links in .cmp-sub so they don't rely on colour alone`

**Labels:** `bug`, `area:site`, `good first issue`, `help wanted`. Issue type: Bug. During a program, add the program label and the level label `Easy`.

### Level

Easy

### Context

The pages that compare two providers (`/compare/<a>-vs-<b>/`, built by `scripts/lib/compare.mjs`) print small lines
under some cells in a `<div class="cmp-sub">`. Two of them hold a link:

- the score row: `… inputs confirmed · #N in the top 10`, where "#N in the top 10" links to `/best/` (`scripts/lib/compare.mjs`, around line 212);
- the models row: "official catalogue ↗" (around line 195).

These links are not underlined, and their colour differs from the text around them by only 2.88:1 (light theme) and
1.6:1 (dark theme). WCAG 1.4.1 asks for 3:1 or a cue that is not colour, and axe reports it as `link-in-text-block`.
It was found in the post-brand QA pass ([`docs/qa/post-brand-2026-11.md`](https://github.com/pacocartones/free-llm-api-hub/blob/main/docs/qa/post-brand-2026-11.md), "Found, from before the brand"). Desktop only:
on phones the table turns into cards.

The site already fixes the same problem elsewhere with one CSS rule, for example in `site/styles.css`:

```css
.prov-score a { text-decoration: underline; text-underline-offset: 2px; }
.req-source a { text-decoration: underline; text-underline-offset: 2px; }
```

`site/styles.css` is a source file (it is written by hand, not generated). The `.cmp-sub` rule is around line 754.
Two open pull requests edit other parts of this file (#929 around lines 483 and 906, #935 from line 772), so add your
rule right after `.cmp-sub` and don't move or reformat anything else.

### Task

1. In `site/styles.css`, add one rule right after `.cmp-sub { … }` that underlines links inside it, in the same style
   as `.prov-score a` (underline, `text-underline-offset: 2px`), with a short comment naming WCAG 1.4.1.
2. Add a test that fails without the rule. Put it in a new file `scripts/compare-a11y.test.mjs` (not in
   `scripts/build.test.mjs`, which several open pull requests edit). It only needs to read `site/styles.css` and check
   the rule, like the existing test for `.req-source a` in `scripts/field-checks.test.mjs` (around line 216). No build is needed.
3. Add a changelog fragment `changes/unreleased/compare-link-underline.md` under `### Changed and fixed` (see `changes/README.md`).

Don't change `scripts/lib/compare.mjs`, the colours, or any other rule. Links in the guide tables are a separate task.

### How to check

`node --test scripts/compare-a11y.test.mjs`, then `npm run build && npm test` if you have the project set up. By hand
(optional): after `npm run build`, open any `site/compare/*/index.html` in a browser and check that "#N in the top 10"
is underlined.
Commit only the files you edited (and a changelog fragment for user-visible changes). **Do not regenerate or commit
derived files:** the regeneration bot commits them to `main` after the merge. If a check on your PR asks for regenerated
files, say so in the PR and a maintainer will handle it.

### Done when

- [ ] links inside `.cmp-sub` are underlined on the compare pages, in both themes
- [ ] the new test passes, and fails if you delete the rule (say in the PR that you tried)
- [ ] the pull request changes only the three files below, and nothing under `site/` except `site/styles.css`

### Files

- `site/styles.css`
- `scripts/compare-a11y.test.mjs` (new)
- `changes/unreleased/compare-link-underline.md` (new)

### Size

about 1 hour

### For contributors

To take it, comment `/take` and the bot assigns it to you (see `CONTRIBUTING.md` › Claiming an issue). Tasks labelled both `good first issue` and `data` are not assigned: the first correct, sourced pull request is merged.
Questions are welcome here before you start. AI-assisted work is welcome and must follow `AI_POLICY.md`. A partial answer is useful: tell us what you did and what you could not confirm.

---

## B. Consent banner: replace the old-palette fallback colours with today's tokens, and pin them with a test

**Title:** `chore: consent banner: fallback colours in consent.client.js still hold the old green palette`

**Labels:** `chore`, `area:site`, `good first issue`, `help wanted`. Issue type: Task. During a program, add the program label and the level label `Easy`.

### Level

Easy

### Context

The cookie banner script, `scripts/lib/consent.client.js`, styles itself with CSS variables from the site and a
fallback colour after each one, for example `var(--panel,#0f1512)`. The site moved to the new "Cálida" palette
(`docs/brand.md`), but these 15 fallbacks still hold the old green colours. They never show today, because the site
always defines the variables, but they would if the banner ever loaded without `site/styles.css`, and they make the
file disagree with the brand. Found in the post-brand QA pass ([`docs/qa/post-brand-2026-11.md`](https://github.com/pacocartones/free-llm-api-hub/blob/main/docs/qa/post-brand-2026-11.md), "Also seen").

The dark values live in the `:root { … }` block at the top of `site/styles.css` (`:root` is the dark theme; the light
theme is the `[data-theme="light"]` block). At `8b6239e` the fallbacks and the values they should hold are:

| Variable | Times used | Fallback today | `:root` value |
| --- | --- | --- | --- |
| `--panel` | 1 | `#0f1512` | `#211915` |
| `--panel-2` | 2 | `#131b17` | `#251c18` |
| `--border` | 2 | `#1d2a22` | `#352822` |
| `--text` | 3 | `#d8e2dc` | `#fbf1ec` |
| `--muted` | 2 | `#96a49b` | `#c2a89e` |
| `--accent` | 3 | `#3fce8f` | `#ffb25c` |
| `--accent-ink` | 1 | `#05140c` | `#17110f` |
| `--control-border` | 1 | `#76887e` | `#7a645b` (it is an alias: `--control-border: var(--control)`, so use `--control`) |

`scripts/widget.test.mjs` already pins the embeddable widget to these tokens (the test that starts with "widget
colours are the dark palette tokens"); copy how it reads the `:root` block.

### Task

1. In `scripts/lib/consent.client.js`, change only the hex after each `var(--name,` to the `:root` value in the table.
   Don't rename variables or change anything else in the file.
2. Add a new test file `scripts/consent-palette.test.mjs` that reads both files, finds every `var(--name,#hex)` in
   `consent.client.js`, and checks that the hex equals the value of `--name` in the `:root` block of `site/styles.css`
   (for a token whose value is `var(--other)`, follow it to `--other`). It should report the variable and both
   values when they differ. No build is needed.

No changelog fragment: nothing visible changes on the site.

### How to check

`node --test scripts/consent-palette.test.mjs`, then `npm run build && npm test` if you have the project set up.
Commit only the files you edited (and a changelog fragment for user-visible changes). **Do not regenerate or commit
derived files:** the regeneration bot commits them to `main` after the merge. If a check on your PR asks for regenerated
files, say so in the PR and a maintainer will handle it.

### Done when

- [ ] every fallback in `consent.client.js` equals its `:root` token in `site/styles.css`
- [ ] the new test passes, and fails if you change one fallback back (say in the PR that you tried)
- [ ] `npm test` passes, with the output in the PR, and the pull request changes only the two files below

### Files

- `scripts/lib/consent.client.js`
- `scripts/consent-palette.test.mjs` (new)

### Size

about 1 hour

### For contributors

To take it, comment `/take` and the bot assigns it to you (see `CONTRIBUTING.md` › Claiming an issue). Tasks labelled both `good first issue` and `data` are not assigned: the first correct, sourced pull request is merged.
Questions are welcome here before you start. AI-assisted work is welcome and must follow `AI_POLICY.md`. A partial answer is useful: tell us what you did and what you could not confirm.
