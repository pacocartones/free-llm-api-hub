### Changed and fixed

- Site: `/find/` no longer jumps when its script starts. The questions and the
  live count used to appear only after `find.js` ran, pushing the rest of the
  page down (layout shift 0.49 on a phone, performance 0.79 against the 0.80
  budget, the only page under it). They are now in the page from the first
  paint; without JavaScript the form is hidden by CSS and the no-script links
  show as before (#874).
