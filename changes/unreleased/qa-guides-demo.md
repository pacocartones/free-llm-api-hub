### Changed and fixed

- Guides: every plain link in a guide's table cells is now underlined, in the
  same style as the score and compare links, with its colour unchanged. Links
  set one level down in a cell (the "Published speed" and "Rated free model"
  notes, the model-family lines of the open-source guide) were told apart by
  colour alone (WCAG 1.4.1; axe `link-in-text-block`, from the post-brand QA
  pass). The guide pages carry a `guide-prose` class so the rule stays on
  guides; `scripts/guides-a11y.test.mjs` checks the rule and that the guides
  still emit such links.
- README: the terminal demo (`assets/demo.svg`) moves from the pre-brand green
  to the Cálida palette: the dark tokens of `site/styles.css` by default, the
  light-theme tokens on a light system. The drawing, text and animation are
  unchanged; the comment and title text now reach 4.5:1 or more.
  `scripts/demo-svg.test.mjs` fails on any colour that is not a token.
