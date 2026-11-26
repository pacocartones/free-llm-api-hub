### Added

- A quarterly report, "State of Free LLM APIs", on `/state/YYYY-qN/`, starting with Q4 2026
  (`/state/2026-q4/`). It is generated at build time from the first-parent history of
  `data/providers.json`. It compares the last revision before the quarter with the last revision in it:
  - headline figures: providers, ongoing free tier against trial credit, no card, no phone, commercial
    use allowed, says it does not train on prompts, and the share of answers not stated;
  - the changes of the quarter: providers added and removed (with the reason recorded in
    `data/not-free.json`), cuts and improvements sorted by rule, and flags that moved to or from not stated;
  - the breakdown by modality, what the data do not say, and the methodology.
- The report has eight inline SVG charts drawn at build time, with no client script. They follow the light
  and dark themes, and each has a data table. Each page publishes its figures as `data.json`, with
  `Article` and `Dataset` structured data and its own social image. A quarter in progress is built but not
  indexed and not in the sitemap until it closes. The wording lives in `content/state/` and can only quote
  the computed figures (see `docs/state-quarterly.md`). Later quarters need no work. `/changes/` lists the
  reports.
