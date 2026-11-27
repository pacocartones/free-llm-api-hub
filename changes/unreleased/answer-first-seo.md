### Changed and fixed

- The home title and meta description start with "Free LLM APIs", then the dataset month and the counts, built from
  the data: "Free LLM APIs (Nov 2026): 85 tiers & credits, 84 verified" and "… 43 ongoing free tiers + 42 trial
  credits, 84 of 85 verified …". og:/twitter: copies repeat them. The verified count is no longer stated alone next to
  a larger provider total, and `llms.txt` states it the same way ("84 of 85 verified") (#952).
- The answer-first paragraph of every provider page has a stable anchor, `#is-it-free` (#952).
- A provider page's `dateModified` is the newest day one of its facts was read (`last_verified` or a later field
  check, free-limits or data-policy reading), not only `last_verified` (#952).
