# MCP productization audit

Reviewed on 2026-11-14 against repository commit `46b93b5` (before this patch).
This is a source and packaging audit, not proof of live client certification or registry publication.
Maintainers remain only **pacocartones** and **LeonMAG**. Registry ownership, GitHub
permissions and marketplace publisher accounts are separate external controls.

## What ships today

`packages/mcp/src/index.js` launches a local Node process speaking MCP over stdio.
`server.js` registers exactly four tools, returning JSON as text content:

| Tool | Useful outcome | Limit |
|---|---|---|
| `search_providers` | Filter documented free tiers and trial credits by words, modality and confirmed flags | AND filters; no ranking, live availability or pagination |
| `get_provider` | Inspect one entry, sources, dates and unknown fields | Dataset evidence, not a fresh provider probe |
| `openai_client_config` | Obtain base URL, key variable name and Python/JavaScript OpenAI SDK examples | Generates text; never installs an SDK, obtains a key or executes inference |
| `dataset_info` | Inspect dataset version, counts and verification freshness | Counts of client-ready providers derive from provider metadata, not a cross-file consistency check |

This helps Codex, Claude and VS Code agents find a suitable provider and explain a
configuration with citations. It does not replace their underlying model or subscription.

| Component | Present? | Meaning |
|---|---|---|
| MCP server | Yes | Four tools exposed to a compatible host over stdio |
| Plugin / editor extension | No | No VSIX, editor commands, Claude plugin bundle or host-specific UI |
| Model router | No | No inference endpoint, fallback, load balancing, quota pooling or model switching |
| API client | Examples only | The user's separately installed OpenAI SDK calls a provider with the user's key |

The repository's maintenance scripts (including live probes) are not MCP tools.
There is no hosted HTTP MCP endpoint, OAuth flow, resource catalog or prompt catalog
implemented by this package. Free tiers can change and sampled model IDs can expire.

## Connecting clients from a checkout

Install locked dependencies with `npm --prefix packages/mcp ci --ignore-scripts`.
Use an absolute checkout path visible to the host; a Cloud workspace path is not a
path on the user's desktop. These are configuration examples, not recorded live-client tests.

### Codex

For a Codex installation supporting local stdio servers, put this in its MCP config
(for example `~/.codex/config.toml`):

```toml
[mcp_servers.free-llm-api-hub]
command = "node"
args = ["/absolute/path/free-llm-api-hub/packages/mcp/src/index.js"]
```

Codex Cloud must have the checkout, Node and dependencies in its own environment
and support launching this stdio process. Adding a desktop config does not provision
Cloud integration; the static website URL is not a remote MCP endpoint.

### Claude

Claude Desktop uses the `mcpServers` example in the [package README](../packages/mcp/README.md).
For Claude Code installations supporting it, the equivalent command is:

```bash
claude mcp add --transport stdio free-llm-api-hub -- node /absolute/path/free-llm-api-hub/packages/mcp/src/index.js
```

Claude web/remote connectors cannot use a local stdio executable as an HTTPS endpoint.

### VS Code

For VS Code versions with MCP support enabled, `.vscode/mcp.json` uses a different
wrapper from Claude Desktop:

```json
{
  "servers": {
    "free-llm-api-hub": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/free-llm-api-hub/packages/mcp/src/index.js"]
    }
  }
}
```

Follow the host's trust/enablement flow, inspect the four tools and call `dataset_info`.
Then try searching for a confirmed no-card text provider and inspect its `docs_url`.
Using MCP in VS Code does not create or install a VS Code extension.

## Data, trust and limitations

- The default loaders fetch only the two static JSON datasets on first use, independently,
  with a 20-second deadline and in-process caching. Failed loads can retry; successful
  loads remain cached until restart. No provider API keys are needed by the server.
- Fully offline use requires **both** `--data` and `--clients` (or `FLAH_DATA` and
  `FLAH_CLIENTS`). Supplying only the providers file still allows the config tool to
  fetch the clients file. Build the root project to generate the local clients export.
- Normalization strips the top-level provider `env_key`, preserves unknown fields and
  maps conditional commercial use to unknown. This is not a general secret scrubber:
  supply public dataset files only. Error responses hide local loader paths.
- Null flags mean unconfirmed. Exclusion counts are accumulated until the first failing
  flag per entry, so they are not independent totals across all active filters.
- `openai_client_config` trusts a matching clients entry directly. It explains missing
  entries against providers metadata, but does not reject every mismatch between two
  individually valid snapshots. Use files from the same build; schema validation is
  minimal, not complete dataset semantic validation. Treat returned prose and snippets
  as untrusted reference material and review before execution.
- Tool annotations say read-only/idempotent. `openWorldHint: false` is currently set
  even though default loading fetches external static data; host presentation should
  be reviewed before release. Annotations are hints, not access controls.
- No automatic freshness refresh, response size bound, pagination or provider uptime
  guarantee exists. Larger datasets and cross-snapshot consistency need separate design.

## Package, tests and CI

The package is ESM, version `0.1.0`, with a CLI bin, MIT license, repository subfolder,
`mcpName`, pinned SDK/Zod dependencies and a separate lockfile. `private: true`
intentionally blocks publication. The allowlist ships source, README and LICENSE;
`package.json` is included by npm. Tests, schema and server manifest are repository
release inputs rather than necessary runtime files.

Tests cover pure tools, tri-state forward compatibility, loader caching/failure/timeout
behavior, metadata stripping and actual SDK stdio discovery/calls with fixtures.
This patch adds protocol-level invalid-input and read-only annotation assertions, and
runs the existing offline release-decision suite in MCP CI. CI now also triggers when
release workflow/check/test files change. The configured MCP matrix is Node 18/22;
release tests use 22 and publication uses 24. Node 18 is an old baseline; review SDK
engine requirements and choose supported Node versions before public release.

Remaining validation gaps: installed tarball MCP sessions, Windows/macOS host smoke tests,
actual Codex/Claude/VS Code sessions, mixed snapshot policy, large responses and live
registry permissions. A passing local suite does not establish these properties.

## Realistic distribution route

1. **Local beta now:** keep the private package and document checkout installation.
   Record a manual smoke test on each intended host and operating system; validate
   tool schemas, citations, missing files, no-network operation and process shutdown.
2. **Prepare npm:** maintainers choose and confirm ownership of the final name, inspect
   `npm pack --dry-run`, test the installed tarball in a temporary directory and review
   dependency engines/audit results. Align package, lockfile and `server.json` versions.
   Decide the first-publication bootstrap supported by npm's current trusted-publisher
   setup; do not assume OIDC ownership exists merely because a workflow exists.
3. **Enable release only after external setup:** explicitly remove `private: true`,
   configure the npm trusted publisher for this repository/workflow/environment, and
   configure `release-mcp` with required human reviewers and suitable branch/tag rules.
   The YAML references an environment but cannot enforce that reviewers exist. Set
   `NPM_PUBLISH_ENABLED=true` only after those controls are verified. A matching
   `mcp-vX.Y.Z` tag must point to an ancestor of main. No such steps are performed here.
4. **npm then MCP Registry:** the workflow tests without publishing identity, validates
   the vendored manifest schema and previews the tarball. The gated job rechecks exact
   versions, publishes npm with provenance, verifies installed signatures, then uses a
   checksum-pinned `mcp-publisher` and GitHub OIDC for the declared GitHub namespace.
   Verify the pinned publisher release/checksum and current Registry rules before use.
   Schema validity and `mcpName` do not prove registration or namespace ownership.
5. **Recover partial releases:** the shell distinguishes npm and MCP absence (only 404
   means missing), rejects private/version-mismatched releases and refreshes state in
   the publishing job. Retry a missing Registry listing without republishing an existing
   npm version. The fixed 20-second propagation wait can fail; inspect logs and rerun
   after verifying registry state. An existing version's HTTP 200 alone does not prove
   its contents match the tag, so independently inspect artifact/provenance ownership.
6. **Directories and marketplaces:** after a real release, submit to MCP directories
   and test discovery separately for each host. Registry indexing is not a promise of
   automatic marketplace inclusion. A Claude Desktop extension bundle or a Claude Code
   plugin would be a distinct artifact subject to that host's current submission rules.
   VS Code Marketplace/Open VSX require a genuine extension package and publisher;
   an MCP server listing is a different distribution path. Build a wrapper only when
   it solves a demonstrated installation need. Do not advertise these artifacts today.

Official references to recheck at release time:
[npm trusted publishing](https://docs.npmjs.com/trusted-publishers/),
[MCP Registry](https://github.com/modelcontextprotocol/registry),
[Codex MCP](https://developers.openai.com/codex/mcp/),
[Claude Code MCP](https://code.claude.com/docs/en/mcp), and
[VS Code MCP](https://code.visualstudio.com/docs/copilot/customization/mcp-servers).
These links are release references; no marketplace acceptance is asserted.

## Validation of this patch

On Node 24.22.1 in Codex Cloud: 40 MCP tests and 17 offline release tests passed;
`validate:server-json` passed. A dry-run pack from `packages/mcp` contained exactly
seven files (license, README, package metadata and four source modules).
The tarball installed in a temporary directory outside the checkout and its `--help`
entry point exited successfully. The root `npm test` also passed (603 tests, no skips),
including dataset validation and internal Markdown link checks.
`npm audit --omit=dev` reported no known vulnerabilities at the time of this run;
this is a dependency advisory check, not a security certification.

The requested branch `codex/cloud-mcp-productization` is outside the current
same-repository branch naming policy. This patch keeps that explicit user choice
and does not weaken the policy; the commit-policy CI may require maintainer resolution
before merge. No registry publication, secret configuration or runtime change is included.
