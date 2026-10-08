# free-llm-api-hub-mcp

An [MCP](https://modelcontextprotocol.io) server over the free-llm-api-hub dataset. An MCP client (Claude Desktop, an IDE agent, any MCP host) can use it to search free-tier and trial-credit LLM API providers, read one entry, and get a ready-to-paste OpenAI-client config.

> **Not published yet.** `package.json` sets `"private": true` so that nothing can be published to npm by accident. Publishing, and the final package name, are a maintainer decision. Until then, run it from a local checkout (see below).

**Free-tier terms change without notice.** Every result carries the provider's `docs_url` (its own pricing or rate-limit page, which is authoritative) and `last_verified` (the date the entry was last checked against it). Check the docs before relying on a number.

## Data source

The server reads two files of the static API, each fetched once (on first use) and kept in memory for the life of the process:

| File | Used by | Local override |
|---|---|---|
| `https://freellmapihub.com/api/v1/providers.json` | every tool | `--data <path>` or `FLAH_DATA=<path>` |
| `https://freellmapihub.com/api/v1/openai-clients.json` | `openai_client_config` | `--clients <path>` or `FLAH_CLIENTS=<path>` |

Both the published `providers.json` and the repository's `data/providers.json` work as `--data`. After `npm run build`, the repository's `site/api/v1/openai-clients.json` works as `--clients`. The `env_key` field is dropped from `providers.json` on load, as it is from every public output. The API-key variable name comes only from `openai-clients.json`, the one file the project publishes it in.

## Run it

### From a local checkout (now)

```bash
git clone https://github.com/pacocartones/free-llm-api-hub
cd free-llm-api-hub/packages/mcp
npm ci --ignore-scripts
node src/index.js                              # live dataset
node src/index.js --data ../../data/providers.json   # local dataset
# after `npm run build` at the repository root:
node src/index.js --data ../../data/providers.json --clients ../../site/api/v1/openai-clients.json
```

The server speaks MCP over stdio, so on its own it just waits for a client. Requires Node 18 or later.

### With npx (once published)

```bash
npx -y free-llm-api-hub-mcp
npx -y free-llm-api-hub-mcp --data ./providers.json --clients ./openai-clients.json
```

## Client configuration

Claude Desktop (`claude_desktop_config.json`), from a local checkout:

```json
{
  "mcpServers": {
    "free-llm-api-hub": {
      "command": "node",
      "args": ["/absolute/path/to/free-llm-api-hub/packages/mcp/src/index.js"]
    }
  }
}
```

Once published, replace `command`/`args` with `"command": "npx", "args": ["-y", "free-llm-api-hub-mcp"]`. To pin local files, add `"env": { "FLAH_DATA": "/absolute/path/to/providers.json", "FLAH_CLIENTS": "/absolute/path/to/openai-clients.json" }`.

Any other MCP host that launches stdio servers takes the same three things: the command (`node`), the arguments (the path to `src/index.js`, optionally `--data <path>` and `--clients <path>`), and optionally the `FLAH_DATA` / `FLAH_CLIENTS` environment variables.

## Tools

All tools are read-only.

| Tool | Arguments | Returns |
|---|---|---|
| `search_providers` | `query?`, `modality?` (`text`, `vision`, `image`, `audio`, `embeddings`, `rerank`, `ocr`), `category?` (`ongoing`, `trial`), `no_card?`, `no_phone?`, `commercial_ok?`, `openai_compatible?` | Compact list: `slug`, `name`, `category`, `free_tier`, `rate_limits`, `docs_url`, `last_verified`, `verified` |
| `get_provider` | `slug` | The full entry, the tri-state flags spelled out (`yes` / `no` / `not confirmed`) and the list of unconfirmed fields. An unknown slug is an error that suggests close matches. |
| `openai_client_config` | `slug`, `model?` | For a provider listed in `openai-clients.json` (verified, OpenAI-compatible, with a base URL): its `base_url`, the API-key variable name published there (`env_key`, returned as `env_var`), and Python and JavaScript snippets for the official `openai` SDK. For any other provider, `available: false` and the reason: not verified, not OpenAI-compatible (or not confirmed), or no base URL. If a provider qualifies but is missing from the list, the reply says the two files may come from different builds. |
| `dataset_info` | none | Dataset `version` and `generated` date, counts, and freshness (oldest, median and newest `last_verified`, never-verified count, the oldest entries). |

### Unconfirmed is not "no"

`phone_required`, `card_required`, `commercial_ok` and `openai_compatible` are true / false / null, and **null means nobody has confirmed it yet**. The server never presents null as false:

- the flag filters of `search_providers` match only confirmed values. `no_card: true` returns providers confirmed not to need a card. Providers whose `card_required` is null are left out and counted in `excluded_unconfirmed`, because they may still qualify;
- `get_provider` labels null as `not confirmed`;
- `openai_client_config` says "not confirmed" for a null `openai_compatible`, and "not OpenAI-compatible" only for an explicit false.

The model in the snippets defaults to the first entry of `models_free`, which is a sample and may be out of date.

## Tests

```bash
npm --prefix packages/mcp ci --ignore-scripts
npm --prefix packages/mcp test
```

The tests run the tool logic against `test/fixtures/providers.json` and `test/fixtures/openai-clients.json`, and one end-to-end test spawns the server over stdio with the SDK client. None of them touch the network.

## License

MIT, like the rest of the repository.
