### Changed and fixed

- The embeddable widget (`/widget.js`, previewed on `/embed/`) uses the Cálida
  dark palette. The rebrand had left the old crimson accent on the old green
  panel, so the heading and the "see all" link read at 3.3:1 (WCAG AA asks for
  4.5:1). Every text colour is now at least 7.7:1, and
  `scripts/widget.test.mjs` ties the widget's colours to the dark tokens in
  `site/styles.css` (#932).
