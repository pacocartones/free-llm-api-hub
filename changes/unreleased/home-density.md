### Changed and fixed

- Home page density: the first desktop screen is back to a few clear choices. The hero
  keeps one primary action, "Find my free API" (to `/find/`), and a quiet "Browse all ↓"
  link to the table; the "Get started" and "Popular" rows and the hero's Star button are
  gone (the GitHub link stays in the header), and the counters sit on one quiet line.
- The explorer has one control bar: a search box, a "Requirements (n)" dropdown that
  groups the boolean filters (no card, no phone, commercial use, no training,
  OpenAI-compatible, text LLMs only, verified only) and the type, the modality menu and
  "Sort by". Active filters show under the bar as removable chips with ✕. The collections
  are plain text links. The filter ids, URL parameters and GA4 events
  (`explorer_filter`, `explorer_sort`, `site_search`) are unchanged.
- A visible "All providers" heading now sits above the table. This supersedes #850;
  thanks to @alvaroalonsoparrondo-a11y for proposing it.
- The table has four columns. The type (Ongoing / Trial) sits next to the provider name,
  and the "Type" column with its flag icons and "The catch" are replaced by a short
  "Needs / unknown" cell that says in words only what a provider requires and which of
  the four production flags are unknown ("Card required", "Unknown: phone, training",
  "Nothing required"). "Not stated" and the ✓ marks are gone from the table. Sorting
  that column orders by fewest requirements. Rows are at most 72 px tall on a desktop
  (they were 82 to 129 px). The server render and the browser repaint still run the same
  function (`scripts/lib/rows.mjs`).
- Phones: the cookie banner is a compact bar (about 106 px tall at 390 px wide, it was
  319 px) with the same texts, the same three answers and the same consent behaviour;
  the menu panel is opaque and starts with "Find my free API".
- New `scripts/home-density.test.mjs` holds the budget: two controls in the hero, one
  control bar, no "Not stated", rows of at most 72 px, the banner height, the GA4 hooks
  and server/client row parity (measured in a real browser when Playwright is installed).
  Agent-assisted.
