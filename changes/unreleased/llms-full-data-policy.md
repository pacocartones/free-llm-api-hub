### Added

- `llms-full.txt` gives each provider with a recorded `data_policy` a
  "Prompt data policy" line: whether it trains on prompts (yes, no or not
  confirmed, as on `/data-policy/`), its retention, and the source page and
  day. A provider without a `data_policy` gets no line (#745).
