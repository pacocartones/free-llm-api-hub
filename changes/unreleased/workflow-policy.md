### Changed and fixed

- Maintenance: `scripts/workflow-policy.test.mjs` checks every workflow in
  `.github/workflows` for the rules the existing ones already follow: actions
  pinned by full commit SHA with a version comment, top-level `permissions:`,
  `persist-credentials: false` on every checkout, no checkout or repository
  script under `pull_request_target` or `workflow_run`, and no pull request,
  issue or comment text pasted into a `run:` script. A new workflow that drops
  one of them fails in its own pull request, with the file and line (#749).
- Maintenance: a failing Verify run on `main` (after a merge) now opens one
  "Verify failed on main" issue, comments on it while `main` stays broken and
  closes it on the next clean run, like the nightly Lighthouse performance
  check. The report job checks nothing out and can only write issues; pull
  requests never reach it. This is the alert the roadmap asks for before the
  strict up-to-date rule can be relaxed (#749).
