#!/usr/bin/env bash
# Commit policy for pull requests (new commits only: BASE..HEAD, never the history before).
# The rules apply to commits written under a maintainer identity only: a maintainer name
# (pacocartones, Paco Cartones, maintainer, agent:*) or a maintainer address (the account's
# noreply, or an internal @hq.local address). A contributor is never checked, whatever their
# name: they may use any address and may be assisted by AI tools if their change is verified.
# Bots are exempt.
#  1. No AI attribution trailers or footers in the commit message.
#  2. The maintainer identity is exactly "Paco Cartones" with the account's noreply address,
#     never a tool or agent name.
#  3. On a pull request from a branch of this repository, the branch name follows CONTRIBUTING
#     ("Branch names and commit identity"). Branches in contributors' forks are not checked.
# Usage: scripts/check-commit-policy.sh <base-sha> <head-sha>
set -euo pipefail

base="${1:?base sha}"
head="${2:?head sha}"

ai_pattern='co-authored-by:[[:space:]]*(claude|gpt|chatgpt|copilot|codebuff|gemini|cursor|aider|devin|anthropic|openai|agent:)|generated (with|by) (claude|chatgpt|copilot|codex|gemini|an? ai)|🤖'
maintainer_names='^(pacocartones|paco cartones|maintainer|agent:.*)$'
maintainer_emails='(^|\+)pacocartones@users\.noreply\.github\.com$|@hq\.local$'
maintainer_name='Paco Cartones'
maintainer_email='253313177+pacocartones@users.noreply.github.com'
branch_pattern='^((feat|fix|docs|data|test|ci|chore|refactor)/[a-z0-9][a-z0-9-]*|changeset-release/main|bot/[a-z0-9][a-z0-9/-]*)$'

fail=0
while IFS= read -r sha; do
  msg="$(git log -1 --format=%B "$sha")"
  maintainer=0
  for pair in "$(git log -1 --format='%an|%ae' "$sha")" "$(git log -1 --format='%cn|%ce' "$sha")"; do
    name="${pair%%|*}"; email="${pair#*|}"
    lower="$(printf '%s' "$name" | tr '[:upper:]' '[:lower:]')"
    if printf '%s' "$lower" | grep -Eq "$maintainer_names" || printf '%s' "$email" | grep -Eiq "$maintainer_emails"; then
      maintainer=1
      if [ "$name" != "$maintainer_name" ] || [ "$email" != "$maintainer_email" ]; then
        echo "::error title=Maintainer identity::${sha:0:10} is written as '$name <$email>'; maintainer commits use '$maintainer_name <$maintainer_email>' (git config user.name and user.email)."
        fail=1
      fi
    fi
  done
  if [ "$maintainer" -eq 1 ] && printf '%s\n' "$msg" | grep -Eiq "$ai_pattern"; then
    echo "::error title=AI attribution in a maintainer commit::${sha:0:10} carries an AI trailer or footer; remove it (git rebase -i, reword)."
    fail=1
  fi
done < <(git rev-list --no-merges "${base}..${head}")

# Rule 3: branch name, only for a pull request whose head branch lives in this repository.
if [ -n "${GITHUB_HEAD_REF:-}" ] && [ -n "${GITHUB_EVENT_PATH:-}" ] && [ -f "$GITHUB_EVENT_PATH" ]; then
  head_repo="$(jq -r '.pull_request.head.repo.full_name // empty' "$GITHUB_EVENT_PATH")"
  if [ "$head_repo" = "${GITHUB_REPOSITORY:-}" ] && ! printf '%s' "$GITHUB_HEAD_REF" | grep -Eq "$branch_pattern"; then
    echo "::error title=Branch name::'$GITHUB_HEAD_REF' does not follow <type>/<short-slug> (feat, fix, docs, data, test, ci, chore, refactor) or a reserved name; see CONTRIBUTING."
    fail=1
  fi
fi

[ "$fail" -eq 0 ] && echo "commit policy: ok"
exit "$fail"
