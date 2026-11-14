# MCP release setup

The [product checklist](mcp-productization.md) defines the distribution promises and
remaining host checks. This is the maintainer procedure for external setup and release.
The [workflow](../.github/workflows/release-mcp.yml) and
[guard](../scripts/check-mcp-release.sh) are the executable source of truth.

## Package and validation

`packages/mcp` is a public-ready npm package named `free-llm-api-hub-mcp`. Its
`mcpName` is `io.github.pacocartones/free-llm-api-hub`; the matching npm entry in
`server.json` uses stdio. Neither metadata nor a successful schema check establishes
publication or ownership. The vendored schema is from the official `$schema` URL;
refresh it with the manifest URL when the Registry changes its format.

Before release, from the repository root:

```bash
npm --prefix packages/mcp ci --ignore-scripts
npm --prefix packages/mcp test
npm --prefix packages/mcp run test:pack
npm --prefix packages/mcp run validate:server-json
node --test scripts/release-mcp.test.mjs
npm test
npm run check
```

The pack test installs a real archive in a temporary consumer directory and speaks
MCP to its installed CLI using public fixtures. It needs npm registry access for
dependencies, but no keys or provider account. All four tools remain read-only.
The package README has current checkout and version-pinned npm configuration for
Codex, Claude and VS Code; do not claim host certification from SDK-only tests.

## External setup required before enabling release

Only the maintainers named in [governance](../GOVERNANCE.md) decide releases. Do not
add publisher accounts or change repository permissions as part of this procedure.

1. **npm ownership and bootstrap.** Check the intended name with
   `npm view free-llm-api-hub-mcp versions --registry=https://registry.npmjs.org/`.
   A 404 means this name is not currently published, not that it is reserved for us.
   Confirm the maintainer's npm account, ownership and 2FA. npm documents trusted
   publisher setup in an existing package's settings. If the name has no package
   settings yet, resolve the initial-publication bootstrap with npm before enabling
   CI. A separately approved manual first publish would require maintainer login/2FA
   and cannot claim GitHub OIDC provenance; if provenance is required for the very
   first version, establish a supported bootstrap with npm rather than silently
   falling back to a token. No bootstrap publication is authorized by this guide.
2. **GitHub environment.** Configure the `release-mcp` environment with **LeonMAG as
   a required reviewer** and prevent self-review. Restrict deployments to the intended
   `mcp-v*` tags and protect tag creation using repository rulesets. Maintain the
   mandatory LeonMAG PR review before merging release changes. Referencing the
   environment in YAML does not configure these protections. Do not enable the
   workflow if the repository plan cannot enforce the required review.
3. **npm trusted publisher.** In package Settings → Trusted publishing, add GitHub
   Actions with owner `pacocartones`, repository `free-llm-api-hub`, workflow filename
   `release-mcp.yml` (filename only), environment `release-mcp`. The workflow uses
   direct `npm publish`, so its trusted connection must permit that action. No
   `NPM_TOKEN`/`NODE_AUTH_TOKEN` secret is needed or referenced. Use GitHub-hosted
   runners and an npm/Node combination meeting the
   [official prerequisites](https://docs.npmjs.com/trusted-publishers/). Configure the
   connection close to release: npm expires an unused new connection after two days.
   After successful OIDC publishing, disallow traditional publishing tokens in npm
   settings and revoke any obsolete tokens.
4. **Registry identity.** Confirm that GitHub OIDC from this repository can publish
   the `io.github.pacocartones/` namespace. `package.json.mcpName` must match the
   manifest and the public npm artifact. Check the official
   [authentication](https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/authentication.mdx)
   and [GitHub Actions](https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/github-actions.mdx)
   guidance. The workflow uses a release-pinned, checksum-verified publisher and
   `login github-oidc`; local schema validation does not test namespace rights.
5. **Explicit enablement.** Only after the above controls are checked, set the
   repository Actions variable `NPM_PUBLISH_ENABLED` to exactly `true`. Keep it
   absent/false while preparing or reviewing this PR. The guard checks it again in
   the protected publishing job, including failed-job reruns.

## Release and recovery

After mandatory review and merge, choose an unused version and align package,
lockfile and manifest versions in a reviewed change. A maintainer may then push its
matching `mcp-vX.Y.Z` tag at the intended commit on main. This guide does not create
tags or publish anything automatically.

The test job has no OIDC permission. It builds and exercises the tarball, then uploads
it as an artifact. Only the environment-protected publish job has `contents: read`
and `id-token: write`; it downloads that exact artifact and publishes with lifecycle
scripts disabled and provenance enabled. No test or dependency lifecycle script is
run with publishing identity. A signature check of the installed public version runs
before the Registry metadata is submitted.

Verify the npm version, contents, provenance/signatures and Registry entry after the
run. Registry publication is metadata indexing, not marketplace acceptance or an
extension release. If npm succeeds and Registry fails, inspect the failed stage and
rerun the job: exact-version checks skip the npm version already present. Existing
HTTP 200 responses alone do not prove artifact integrity. For propagation delays,
inspect registry state before retrying; never delete or overwrite a published version
just to rerun. Set the enablement variable to false to stop subsequent attempts.
