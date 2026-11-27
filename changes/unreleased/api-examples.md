### Added

- Copy-paste examples on the [API page](https://freellmapihub.com/api/#examples)
  and in `docs/api.md`, for `providers.json`, `status.json`, `providers.csv`
  and `llms.txt`, in curl, JavaScript (fetch, no dependencies) and Python
  (standard library only): ongoing free tiers with no card, providers that are
  fresh and free now, OpenAI-compatible base URLs, the provider with the
  highest daily request limit for a model, no-card commercial providers from
  the CSV, and every provider's Markdown page from `llms.txt`. Both places are
  generated from `scripts/lib/api-examples.mjs`, and
  `scripts/api-examples.test.mjs` runs every snippet against the built files
  with no network, checking that the languages print the same lines. The API
  page also points to the MCP server in `packages/mcp`, which runs from a
  checkout and is not published on npm.
