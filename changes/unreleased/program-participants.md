### Changed and fixed

- `CONTRIBUTING.md` has a section for participants of contribution programs such as Social
  Winter of Code Season 7 (1 January to 30 March 2027): how to pick and `/take` an issue, the
  limit of two open assigned issues, no hoarding, 7-day inactivity during a program, at most two
  Easy merges per person, the three difficulty levels, that a maintainer adds the level label at
  merge and only to pull requests that close a labelled issue, review times, the first-fork
  approval wait, and the AI policy and quote rules. The program's label names appear in one table,
  to update when SWoC publishes them. A maintainer issue form, "Prepared task", writes tasks in the
  good first issue shape (context, task, how to check, done when, files, size) with level guidance.
  The `/take` bot reads its per-person limit from one `MAX_OPEN` setting, says the limit when it
  refuses and links the inactivity rules; `scripts/issue-assign.test.mjs` runs the workflow's shell
  against a local `gh` double and checks the limit matches `CONTRIBUTING.md`. Agent-assisted (#772).
