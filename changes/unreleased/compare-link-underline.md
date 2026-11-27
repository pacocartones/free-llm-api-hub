### Changed and fixed

- On the compare pages (`/compare/<a>-vs-<b>/`) the links under a cell — "official catalogue ↗" under the
  free-model sample and "#N in the top 10" under the score — are now underlined, so they no longer rely on
  colour alone. Their colour differed from the text around them by 2.88:1 in the light theme and 1.6:1 in the
  dark one, below the 3:1 that WCAG 1.4.1 asks for; axe reported it as `link-in-text-block` (#951).
