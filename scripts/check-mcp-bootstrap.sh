#!/usr/bin/env bash
# Run from packages/mcp by publish-mcp.yml (the one-time first npm publication).
# Stops unless publication is enabled, the package is public, server.json carries the same
# version, and that exact version is absent from npm (an explicit 404, never a network error).
set -euo pipefail

[ "${NPM_PUBLISH_ENABLED:-}" = 'true' ] || { echo "::error::NPM_PUBLISH_ENABLED must be true; publishing is disabled" >&2; exit 1; }
[ "${GITHUB_REF:-}" = 'refs/heads/main' ] || { echo "::error::run this workflow from main, not ${GITHUB_REF:-an unknown ref}" >&2; exit 1; }

version=$(node -p "require('./package.json').version")
[ "$(node -p "require('./server.json').version")" = "$version" ] || { echo "::error::server.json version differs from package.json ($version)" >&2; exit 1; }
[ "$(node -p "require('./server.json').packages[0].version")" = "$version" ] || { echo "::error::server.json packages[0].version differs from package.json ($version)" >&2; exit 1; }
node -e "if (require('./package.json').private) { console.error('::error::MCP package is private; publishing is disabled'); process.exit(1); }"

npm_name=$(node -p "encodeURIComponent(require('./package.json').name)")
status=$(curl --silent --show-error --connect-timeout 10 --max-time 30 --output /dev/null --write-out '%{http_code}' "https://registry.npmjs.org/$npm_name/$(node -p "encodeURIComponent('$version')")")
case "$status" in
  404) echo "npm has no $npm_name@$version yet: OK to publish" ;;
  200) echo "::error::$npm_name@$version is already on npm; release later versions with release-mcp.yml" >&2; exit 1 ;;
  *) echo "::error::npm registry lookup failed (HTTP $status)" >&2; exit 1 ;;
esac
