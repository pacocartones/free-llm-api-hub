### Changed and fixed

- Contributors: a monthly workflow (`monthly-issues.yml`, `scripts/monthly-issues.mjs`) opens two
  recurring issues on the 1st: "Free tier changes — <Month YYYY>", listing the providers added and
  removed and the limit and flag changes of the month that ended (from the same git history as the
  What changed page) and asking for changes we missed with a source link, and "New provider
  candidates — <Month YYYY>", one proposal per comment under the inclusion criteria with the current
  non-text share against the 35% guardrail. It never opens the same month's issue twice and never
  edits data. `CONTRIBUTING.md` lists where to find work each month. Agent-assisted (#784).
