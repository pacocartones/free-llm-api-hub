### Added

- Every provider page answers "Is <Provider> API free?" right under its name, in one or two sentences built only from
  the data: ongoing free tier or one-time trial credit, the published limits (or the free-tier wording), credit card,
  phone verification and commercial use, and the day the record was verified. A field the dataset leaves null reads
  "not stated" (#927).
- Every provider page ends with a six-question FAQ (is it free, limits, credit card, commercial use, training on
  prompts, OpenAI-compatible base URL), each answer citing the day its source was read, mirrored as FAQPage JSON-LD (#927).

### Changed and fixed

- The home page title is "Free LLM APIs (<month>): <N> verified free tiers & credits", under 60 characters (#927).
