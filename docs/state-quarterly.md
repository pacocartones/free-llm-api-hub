# Quarterly report: State of Free LLM APIs

`/state/YYYY-qN/` (for example [`/state/2026-q4/`](https://freellmapihub.com/state/2026-q4/)) is a report per quarter,
written by `npm run build`. Nothing in it is typed by hand: the numbers, charts and tables come from the data, and
the wording around them lives in a small Markdown file the owner can edit without touching code.

## Where the figures come from

- **Two snapshots of `data/providers.json`.** The start is the last revision on `main` before the quarter. The end is
  the last revision in the quarter. Both come from the first-parent history (`scripts/lib/history.mjs`), so a merged
  pull request is one revision, dated on the day it landed. A month with no revision carries the one before
  (`fillMonths` in `scripts/lib/state.mjs`).
- **The mined field changes** dated in the quarter: one entry per provider, day and field.
- **`data/not-free.json`** gives a removed provider its documented reason, when there is one.

`scripts/lib/state-quarterly.mjs` computes every figure. It is pure; the tests in
`scripts/state-quarterly.test.mjs` pin it on fixtures and against the built page.

| Section | What it shows |
|---|---|
| Headline figures | providers; ongoing free tier against trial credit; no card; no phone; commercial use allowed; says it does not train on prompts; the share of the 4 × providers answers that are not stated; verified |
| Changes in the quarter | added and removed (snapshot against snapshot); field changes sorted by rule into cuts, improvements, moved to not stated, newly stated, and wording or limits (never judged) |
| Breakdown by modality | providers per modality, start and end |
| What we don't know | not stated per question, with the recorded reason (`field_checks`) and the providers |
| Methodology | the rules above, with links to the data |

**Cuts and improvements are sorted by rule only:**

| Field | Cut | Improvement |
|---|---|---|
| `card_required`, `phone_required` | `false` → `true` | `true` → `false` |
| `commercial_ok` | down the order `true` > `conditional` > `false` | up that order |
| `free_type` | an ongoing kind (`perpetual`, `renewing-quota`, `recurring-credit`) → `trial-credit` | the other way |

A flag that becomes `null` is "moved to not stated", not a cut. Changes to text fields (free tier, limits, the catch)
are listed, not judged.

## Charts

There are eight charts, each built from one spec object (`scripts/lib/state-quarterly-page.mjs`, `quarterCharts`).
`scripts/lib/state-charts.mjs` turns the spec into inline SVG and writes the data table from the same spec, so the two
cannot disagree; a test reads both back from the built page.

- **No script.** The SVG is drawn at build time; nothing runs in the browser.
- **Two layouts.** A wide layout and a narrow one for phones; CSS shows one.
- **Accessible.** Each SVG has `role="img"`, a `<title>` and a `<desc>`, a visible caption, and the numbers at the bars.
- **Themes.** Colours are classes in `site/charts.css`, each mapped to an existing token of `styles.css`, so the charts
  follow the light and dark themes and any restyle of those tokens.

The page also publishes `site/state/YYYY-qN/data.json`: the figures, the changes and the data of every chart.

## The editorial file

The build reads `content/state/YYYY-qN.md` if it exists, otherwise `content/state/quarter-default.md`, so a new
quarter gets a page with no work. Write a quarter's own file to sign off its wording.

```markdown
---
title: "State of Free LLM APIs — {{quarter_label}}"
description: "… at most 155 characters once the figures are filled …"
---

{{block:status}}

At the end of {{quarter_label}} we track {{providers}} providers …

{{block:headline}}
{{block:changes}}
{{block:modality}}
{{block:unknowns}}
{{block:methodology}}
```

- **Figures, never typed numbers.** Write `{{key}}` for any count, list of names or date. The keys are what
  `quarterFigures()` returns, for example:
  - `providers`, `providers_before`, `providers_delta`, `ongoing`, `trial`, `verified_share`;
  - `not_stated_share`, `not_stated_share_before`;
  - for `card`, `phone`, `commercial` and `training`: `<flag>_friendly`, `<flag>_friendly_share`, `<flag>_not_stated`;
  - `added_count`, `added_names`, `removed_count`, `removed_names`, `field_changes`, `providers_changed`;
  - `cut_count`, `cut_names`, `improvement_count`, `to_unknown_count`, `clarified_count`, `other_count`;
  - `modality_<name>`, `quarter_label`, `quarter_start`, `quarter_end`, `data_as_of`, `status`.

  An unknown key fails the build.
- **Blocks.** A line holding only `{{block:name}}` becomes a computed section. `headline`, `changes`, `modality`,
  `unknowns` and `methodology` are required; `status` (the in-progress notice) is optional. A missing, unknown or
  repeated block fails the build.
- **Markdown.** The site's converter (`scripts/lib/markdown.mjs`); raw HTML is shown as text.

## Publishing

A quarter is **closed** once its third month is in the history and a later revision exists, which is in practice the
first data merge of the next quarter. "Closed" follows the history, not the clock, so the build does not depend on the
day it runs. Until then the page is built (so it can be reviewed) but carries `noindex` and stays out of
`sitemap-state.xml`. Once closed it is listed there with the date of its last revision as `lastmod`. `/changes/`
lists every report under "Quarter by quarter".

The social image `site/og/state-quarterly.png` has fixed text and is shared by every quarter, so a new quarter needs no
image and a data change never makes it stale (`SECTION_OGS` in `scripts/lib/og.mjs`).
