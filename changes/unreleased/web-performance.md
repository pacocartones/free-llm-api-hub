### Changed and fixed

- The home no longer jumps on a phone while it loads (PageSpeed measured a layout shift of 0.188): the menu is
  collapsed behind its button from the first paint instead of showing its links until the page script ran. Without
  JavaScript the links still sit under the brand. Both JetBrains Mono weights are now preloaded and declared in each
  page's head with `font-display: optional`, so a late font cannot re-flow the text either.
- Stylesheets, scripts and fonts are linked with a hash of their content (`styles.css?v=…`), so a page never runs
  with an outdated script and these files can be cached for a long time.
- `/.well-known/security.txt` (RFC 9116) points to private vulnerability reporting and SECURITY.md, and
  `/favicon.ico` no longer answers 404.
