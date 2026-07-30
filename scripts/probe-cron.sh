#!/usr/bin/env bash
# probe-cron.sh — the VPS-side weekly runner. Colocated with a self-hosted
# Infisical, it live-tests every provider whose key is in the secrets folder,
# refreshes the dataset, rebuilds the site, and publishes — with ZERO GitHub
# Actions minutes.
#
# Prereqs on the VPS (once):
#   - node >= 18, git, and the Infisical CLI installed.
#   - A read-only Infisical Machine Identity scoped to the project's secrets
#     folder. Export its creds + API URL in this script's environment (e.g. a
#     root-only /etc/free-llm-api-hub.env sourced below) — NEVER commit them:
#         INFISICAL_API_URL=http://127.0.0.1:8080   # localhost: secrets never leave the box
#         INFISICAL_TOKEN=...                        # or INFISICAL_CLIENT_ID/SECRET for universal-auth
#         INFISICAL_PROJECT_ID=...
#         INFISICAL_ENV=prod
#         INFISICAL_PATH=/free-llm-api-hub
#   - A git remote with push rights (deploy key or PAT), and the repo cloned.
#
# Cron example (Mondays 08:10 UTC):
#   10 8 * * 1  /path/to/repo/scripts/probe-cron.sh >> /var/log/flah-probe.log 2>&1
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

# Load the Machine-Identity creds (root-only file, not in the repo).
[ -f /etc/free-llm-api-hub.env ] && . /etc/free-llm-api-hub.env

git pull --ff-only

# infisical run injects every secret in the folder as an env var; probe.mjs
# reads process.env[env_key] and only tests providers whose key is present.
infisical run \
  --projectId "${INFISICAL_PROJECT_ID}" \
  --env "${INFISICAL_ENV:-prod}" \
  --path "${INFISICAL_PATH:-/free-llm-api-hub}" \
  -- node scripts/probe.mjs --write

# Also refresh the public model catalogs, then validate + build.
node scripts/fetch-models.mjs --write || true
node scripts/validate.mjs
node scripts/build.mjs

# Commit data changes (probe report, models, statuses) to main.
if ! git diff --quiet; then
  git add -A
  git -c user.name='flah-bot' -c user.email='bot@localhost' commit -m "data: weekly live-probe + model refresh [skip ci]"
  git push origin main
fi

# Publish the built site to the gh-pages branch (deploy-from-branch = 0 Actions).
# Uncomment once the deploy approach is chosen:
#   npx --yes gh-pages -d site -b gh-pages -m "deploy $(date -u +%F)" || \
#   git subtree push --prefix site origin gh-pages
echo "probe-cron done."
