### Changed and fixed

- Maintenance: the Cloudflare Worker that serves the site is asked to rebuild right after each GitHub Pages deploy of `main` (a `workflow_run` on "Deploy site"), not only every two hours, so the site follows a merge within minutes (#1073).
