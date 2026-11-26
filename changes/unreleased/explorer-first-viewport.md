### Changed and fixed

- The "Recommended" order opens with what most visitors look for: text LLMs with an ongoing free tier and no card
  (Z.ai, Typhoon, Google Gemini, AI Horde, Cloudflare Workers AI, Groq, ...), then the rest by the same flag score,
  with text LLMs before other modalities and the rated model tier as tie-breaks. Gemini moves from 9th to 3rd and
  Groq from 21st to 6th. One order (`recommendedCmp` in `scripts/lib/rules.mjs`) is shared by the home table, the
  explorer, the widget and the guides' "Top pick", which is now shown only when it belongs to the guide's modality.
  Agent-assisted.
- The home's search box and filters are in the first desktop viewport (at 598px instead of 1,175px on a 1440×900
  screen; on a phone at 616px instead of 1,856px): the hero repeats no logo, the title is two lines, the four counter
  tiles are one line of text and "New here? How this list works" is a collapsed section. The freshness counter reads
  "Re-checked within the last N days" instead of "Nd oldest verification · 90-day SLA".
- The header menu is Providers (all providers and The Best), Models, Compare, Changes, API and Guides; Submit is the
  secondary "Contribute" button next to it.
- The titles of the home, `/best/`, the guides and `/models/` carry the dataset month, e.g. "Free LLM APIs (Nov 2026):
  69 verified free tiers & credits, sourced & dated".
