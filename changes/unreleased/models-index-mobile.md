### Changed and fixed

- `/models/` no longer breaks words in the middle on a phone: under 560px each row is a card with its column names as
  labels, and on wider screens words wrap only at spaces. The table keeps its column headers (with `scope`), a caption
  and explicit table roles, inside a labelled scroll region you can reach with the keyboard.
- `/models/` opens with an answer line built from the data ("161 models free across 40 providers; most widely
  available: …"), links each model of an open family to its `/free-api/<family>/` page, shows the free type in words,
  and its title and description lead with "Free AI models API".
