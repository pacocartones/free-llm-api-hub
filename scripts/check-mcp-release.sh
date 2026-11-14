#!/usr/bin/env bash
# Run from packages/mcp; emit independent exact-version registry decisions.
set -euo pipefail

# Check again inside the protected job: reruns must respect a disabled release switch.
[ "${NPM_PUBLISH_ENABLED:-}" = 'true' ] || { echo "::error::NPM_PUBLISH_ENABLED must be true; publishing is disabled" >&2; exit 1; }

version=$(node -p "require('./package.json').version")
[ "mcp-v$version" = "$GITHUB_REF_NAME" ] || { echo "::error::tag $GITHUB_REF_NAME does not match package version $version"; exit 1; }
[ "$(node -p "require('./server.json').version")" = "$version" ] || { echo "::error::server.json version differs"; exit 1; }
# Recovery must not bypass the package's explicit publication opt-in.
node -e "if (require('./package.json').private) { console.error('::error::MCP package is private; publishing is disabled'); process.exit(1); }"
npm_name=$(node -p "encodeURIComponent(require('./package.json').name)")
mcp_name=$(node -p "encodeURIComponent(require('./server.json').name)")
encoded_version=$(node -p "encodeURIComponent(require('./package.json').version)")
needed() {
  local target="$1" url="$2" status
  status=$(curl --silent --show-error --connect-timeout 10 --max-time 30 --output /dev/null --write-out '%{http_code}' "$url")
  case "$status" in
    200) echo "${target}_needed=false" >> "$GITHUB_OUTPUT" ;;
    404) echo "${target}_needed=true" >> "$GITHUB_OUTPUT" ;;
    *) echo "::error::$target registry lookup failed (HTTP $status)" >&2; exit 1 ;;
  esac
}
# Only an explicit 404 means absent; registry/network failures stop the release.
needed npm "https://registry.npmjs.org/$npm_name/$encoded_version"
needed mcp "https://registry.modelcontextprotocol.io/v0.1/servers/$mcp_name/versions/$encoded_version?include_deleted=true"
