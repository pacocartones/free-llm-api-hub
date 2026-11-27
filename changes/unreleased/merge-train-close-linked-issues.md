### Changed and fixed

- Maintenance: the merge manager now closes the issues a pull request links
  with closing keywords (`Closes #N`) after it merges it. GitHub skips that
  close when the merging account has no Issues permission, and the App token
  the queue merges with has none, so #926 stayed open after #1032 merged. The
  manager reads the pull request's linked issues with the workflow token,
  closes each open one of this repository with a short comment, and never
  reopens anything; a failure is logged without blocking the queue. The rule is
  in Part 1 of `docs/maintenance/merge-train.md` (#1040).
