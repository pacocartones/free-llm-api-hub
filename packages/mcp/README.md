# free-llm-api-hub-mcp

An [MCP](https://modelcontextprotocol.io) server over the free-llm-api-hub dataset. An MCP client (Claude Desktop, an IDE agent, any MCP host) can use it to search free-tier and trial-credit LLM API providers, read one entry, and get a ready-to-paste OpenAI-client config.

> **Publication is maintainer-gated.** This package is configured for public npm distribution;
> that alone does not establish that a version exists on npm or in the MCP Registry.
> Use a checkout until a maintainer announces a published version. See the
> [release setup](https://github.com/pacocartones/free-llm-api-hub/blob/main/docs/mcp-release.md)
> for external ownership, OIDC and review prerequisites.

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

The server speaks MCP over stdio, so on its own it just waits for a client. Requires Node 22.14 or later.

### With npx (after verifying a published version)

Replace `VERSION` with an announced version shown by `npm view free-llm-api-hub-mcp versions`.
Pin that version in client configurations too:

```bash
npx -y free-llm-api-hub-mcp@VERSION
npx -y free-llm-api-hub-mcp@VERSION --data ./providers.json --clients ./openai-clients.json
```

## Client configuration

For product boundaries, stable limitations and the canonical distribution checklist, see the
[productization audit](https://github.com/pacocartones/free-llm-api-hub/blob/main/docs/mcp-productization.md).

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

Once published, replace `command`/`args` with `"command": "npx", "args": ["-y", "free-llm-api-hub-mcp@VERSION"]`. To pin local files, add `"env": { "FLAH_DATA": "/absolute/path/to/providers.json", "FLAH_CLIENTS": "/absolute/path/to/openai-clients.json" }`.

Any other MCP host that launches stdio servers takes the same three things: the command (`node`), the arguments (the path to `src/index.js`, optionally `--data <path>` and `--clients <path>`), and optionally the `FLAH_DATA` / `FLAH_CLIENTS` environment variables.

### Codex

For a Codex installation supporting local stdio servers, configure its MCP settings
(for example `~/.codex/config.toml`):

```toml
[mcp_servers.free-llm-api-hub]
command = "node"
args = ["/absolute/path/to/free-llm-api-hub/packages/mcp/src/index.js"]
```

See [Codex MCP configuration](https://developers.openai.com/codex/mcp/).
The path and dependencies must be available in the environment running the server;
a local desktop configuration does not provision Codex Cloud.

### Claude Code

Claude Desktop uses the JSON example above. For Claude Code:

```bash
claude mcp add --transport stdio free-llm-api-hub -- node /absolute/path/to/free-llm-api-hub/packages/mcp/src/index.js
```

See [Claude Code MCP configuration](https://code.claude.com/docs/en/mcp).
Remote/web connectors need a supported remote transport; this package offers stdio.

### VS Code with the Copilot harness

For new configuration, use `.mcp.json` at the workspace root or the personal file
`$COPILOT_HOME/mcp-config.json` (`~/.copilot/mcp-config.json` when `COPILOT_HOME` is
unset). Both use a top-level `mcpServers` object:

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

Use **Chat: Open Customizations → MCP Servers → Add Server** in a Copilot session.
The guided workspace-root destination requires `chat.mcp.workspaceRootConfig.enabled`;
existing workspace-root files remain available when that setting is off. In remote
or container sessions, paths must be accessible where the server runs.

Legacy `.vscode/mcp.json` and profile `mcp.json` use `servers` and belong to the
**deprecated Local harness**. Do not use them for new Copilot configuration; eligible
existing definitions can be forwarded, but Copilot does not read those files directly.
Follow the [official configuration reference](https://code.visualstudio.com/docs/agents/reference/mcp-configuration)
for migration, authentication and configuration availability.

For each host, follow its enablement/trust flow and call `dataset_info` to verify an
actual tool call. These examples are not host certification or an extension install.

## Tools

All tools are read-only and idempotent. They advertise `openWorldHint: true` because
first use can fetch the published datasets over HTTPS, even though they never call
provider inference APIs or modify data. Both local overrides avoid those dataset
fetches. Annotations describe capabilities; they do not grant permissions.

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

The unit and stdio tests use local fixtures without network access. Distribution tests
are separate because installing npm dependencies needs registry access:

```bash
npm --prefix packages/mcp run validate:server-json
npm --prefix packages/mcp run test:pack
```

`test:pack` checks public metadata, packs the actual archive, installs it in a temporary
consumer directory and calls its installed CLI over stdio with local fixtures. It never
calls a provider API. CI tests this archive before publication; the release job consumes
the same uploaded tarball. Source, README, license and Registry manifest ship in the
package; tests, schemas and fixtures remain in the repository.

## License

MIT, like the rest of the repository.
