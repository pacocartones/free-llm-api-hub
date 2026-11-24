### Changed and fixed

- Home page: a short "New here? How this list works" strip between the hero
  and the explorer says what the list is, what "verified" means and how to use
  the data, with links to the methodology, the JSON API and the change log. Its
  counts and the oldest and newest verification dates come from
  `data/providers.json` (`scripts/lib/home-first-use.mjs`). It replaces the four
  generic trust cards; on a phone its cards are tighter and drop their icons (#720).
- Home page: `theme-color` has a light value for a light colour scheme, so the
  mobile browser bar matches the page (#720).
