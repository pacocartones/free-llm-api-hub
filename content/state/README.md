# Monthly changes reports

One file per month, `YYYY-MM.md`, holds the reviewed prose of the "Free LLM API changes — <Month YYYY>" report. The
build (`scripts/lib/monthly-report.mjs`) puts it on `/state/YYYY-MM/`, above the computed sections, and adds an item to
`changes.xml` and `changes.atom`. A month without a file still gets its generated sections; the file adds the parts a maintainer signs off.

Merging the file publishes the report at the next deploy, so merge it once the month has ended (on or after the 1st of
the next month), after re-reading the figures on a local build.

## Format

```markdown
---
title: "Free LLM API changes — {{month_label}}"
description: "… at most 155 characters once the figures are filled …"
---

*Data to {{data_as_of_day}}. …*

## The three changes that matter most
…
{{block:numbers}}
…
```

- **Figures, never typed numbers.** Write `{{key}}` for any count, list of names or date the data gives; the build fills
  it and fails on an unknown key. The keys are the `figures` object of `monthlyChangesReport()`: for example
  `added_count`, `added_names`, `removed_count`, `removed_names`, `field_changes`, `providers_changed`, `revisions`,
  `releases`, `data_as_of_day`, `before_hash`, `after_hash`, `commercial_true_to_unknown` (and `_to_false`,
  `_to_conditional`, `_removed`), and every snapshot figure as
  `<name>_before` / `<name>_after` (`providers`, `verified`, `data_policy`, `no_train`, `commercial_true`,
  `field_checks`, `phone_unknown`, …).
- **Generated blocks.** A line holding only `{{block:name}}` becomes a generated section: `numbers`, `new-providers`,
  `removed`, `not-free`, `data-policy`, `to-unknown`, `open-checks`, `field-changes-link`.
- **Prose rules.** Each change is before → after, with the date it was read and a link already in the data. A flag
  that moved to `null` reads "not stated" (the site's wording for an unknown value) and goes under "What we couldn't
  confirm", never under "less free". No "best" or "fastest". Say
  which checks were agent-assisted. Thank only the people credited in that month's changelog.
- **Markdown.** The site's converter (`scripts/lib/markdown.mjs`): headings, paragraphs, lists, pipe tables, bold,
  italic, inline code and links. Raw HTML is shown as text. Link site pages with their full `https://freellmapihub.com/…`
  URL.

The first report, `2026-11.md`, is the worked example.
