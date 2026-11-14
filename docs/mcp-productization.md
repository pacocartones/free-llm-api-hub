# MCP product boundaries and release checklist

The [package README](../packages/mcp/README.md) is the reference for installation,
client configuration, tool arguments and data sources. This document defines the
product limits and the checks required before public distribution.

## Value and boundaries

Codex, Claude and VS Code agents can use the server to discover documented free
LLM API tiers, inspect sources and verification dates, and obtain OpenAI SDK examples.
The host must support launching a local stdio process. This does not change the
host's underlying model, subscription or available provider quota.

| Component | What this project provides |
|---|---|
| MCP server | Four read-only tools over stdio; see the README for their contracts |
| Plugin / extension | No editor extension, VSIX, Claude plugin or host-specific UI |
| Model router | No inference endpoint, fallback, load balancing or automatic model selection |
| API client | Generated Python/JavaScript examples; the user's separately installed SDK makes API calls |

There is no hosted HTTP MCP endpoint or OAuth flow. A static dataset URL is not an
MCP endpoint. Maintenance scripts and provider probes are not exposed as MCP tools.
A desktop configuration does not provision a Codex Cloud integration: Node, the
checkout and dependencies must exist wherever the host launches the server.

## Stable limitations to communicate

- Data is a dated reference, not a live quota or uptime guarantee. Sampled model IDs
  can expire. Null flags mean unconfirmed, never a confirmed negative.
- The two data files load independently and cache successful results until restart.
  Fully offline operation requires **both** local overrides. Use public files from
  the same build; a matching clients entry is trusted directly and not checked
  against every provider eligibility flag or snapshot version.
- Normalization removes the provider's top-level `env_key`; it is not a general
  secret scrubber. Unknown fields survive. Review returned prose and snippets before
  execution. The server needs no provider key and never executes inference.
- Search has no pagination or response size bound. Exclusion counts stop at the first
  failing flag per entry, rather than independently counting every active filter.
- Tool annotations are hints, not access controls. `openWorldHint: true` reflects
  default HTTPS dataset loading; it does not imply inference or write capabilities.

## Canonical distribution checklist

Keep `NPM_PUBLISH_ENABLED` unset or false until the maintainers complete the relevant
checks. The package itself is publishable; the workflow switch and protected environment
control automated release. [Release setup](mcp-release.md) defines the external steps.
[GOVERNANCE.md](../GOVERNANCE.md) defines maintainer roles; repository roles do
not imply npm ownership, Registry namespace rights or marketplace publisher access.

- [ ] Validate checkout and installed-tarball MCP sessions in the intended Codex,
  Claude and VS Code hosts, including shutdown, invalid input, missing files and
  offline operation. Record host/platform evidence in the release PR, not this guide.
- [ ] Review supported Node/dependency engines, dependency advisories and
  `npm pack --dry-run` contents. Run package tests, manifest validation and offline
  release tests; the commands and CI matrix live in [MCP CI](../.github/workflows/mcp-ci.yml).
- [ ] Resolve cross-snapshot behavior and large-response limits before claiming
  stronger guarantees than the implementation provides.
- [ ] Confirm npm ownership and the first-publication bootstrap, then align package,
  lockfile and manifest metadata. Follow [release setup](mcp-release.md) for OIDC
  and provenance prerequisites.
- [ ] Verify external release controls: npm trusted publisher binding, Registry
  namespace/OIDC authorization, required human reviewers on `release-mcp`, and
  branch/tag protections. Referencing an environment in YAML does not create its
  required reviewers. Only then explicitly opt in to publication.
- [ ] Follow the [release workflow](../.github/workflows/release-mcp.yml) and
  [release guard](../scripts/check-mcp-release.sh) as the canonical implementation.
  Recheck the pinned publisher/checksum and current
  [MCP Registry requirements](https://github.com/modelcontextprotocol/registry).
  Manifest validation does not establish namespace ownership or registration.
- [ ] Verify the actual npm artifact/provenance and Registry entry after release.
  For partial releases, inspect destination state and retry only the missing stage;
  never assume HTTP existence proves that an artifact matches the intended commit.
- [ ] Test discovery and submit separately to each directory or marketplace. MCP
  Registry publication does not guarantee marketplace inclusion. Claude bundles or
  plugins are separate artifacts; VS Code Marketplace/Open VSX require a genuine
  extension and publisher. Build a wrapper only for a demonstrated installation need,
  and advertise it only when it exists and meets the host's current requirements.
