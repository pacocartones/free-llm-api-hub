### Added

- "Find my free API" (`/find/`): six quick questions (what you build, card,
  phone, commercial use, no training on prompts, OpenAI compatibility) and a
  ranked shortlist with each provider's free allowance, published limits,
  flags, a "Get a free key" link when `keys_url` is recorded and a copyable
  Python quickstart. Every answer is one of the explorer's filters and the
  order is its Recommended sort; a requirement that is not confirmed never
  counts as yes and is listed apart. Answers live in the URL hash
  (`/find/#use=chat&card=no`), so results are shareable. Linked from the home
  hero, the Providers menu and the guides hub, listed in the sitemap, measured
  by the Lighthouse gate, and reported as `wizard_complete` only with analytics
  consent. Agent-assisted.
