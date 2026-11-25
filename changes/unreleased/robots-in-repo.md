### Changed and fixed

- `robots.txt` now holds the whole crawler policy, reviewed in pull requests,
  instead of a block managed in Cloudflare.
  - Search engines and AI search or user agents may crawl every page: Googlebot,
    Bingbot, Baiduspider, PetalBot, OAI-SearchBot, ChatGPT-User,
    Claude-SearchBot, Claude-User and PerplexityBot. Baiduspider and PetalBot
    were blocked before.
  - AI training crawlers (GPTBot, ClaudeBot, CCBot, Google-Extended and the
    others the managed block listed) may fetch the machine-readable data
    files: `llms.txt`, `llms-full.txt`, `providers.json`, `providers.csv`,
    `feed.xml`, `changes.xml`, the sitemaps and `/api/`. They may not fetch
    the HTML pages.
  - The `Content-Signal:` line that Search Console flagged is gone, and so is
    the duplicate `User-agent: *` group.
  - `scripts/robots.test.mjs` parses the file and checks these rules.
