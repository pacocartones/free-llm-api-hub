# Lighthouse accessibility audit gate plan

1. Extend the pure gate evaluator so accessibility audit failures are compared with a page-keyed committed baseline, while keeping the existing score budgets unchanged.
2. Preserve every raw Lighthouse run in the median envelope and fail on a new audit observed in any run; report the audit id and affected nodes.
3. Treat unexplained null/error audit results as failures, while preserving Lighthouse's explicit not-applicable/manual/informative exemptions.
4. Add the three requested routes, load `data/a11y-baseline.json`, and update workflow documentation.
5. Cover the behaviour with browser-free fixtures, then run the real nine-page Lighthouse job and the repository checks.
