#!/usr/bin/env bash
# Publish only version transitions at the trusted main event commit. Ordinary
# data updates accumulate without touching tags. For an actual release,
# existing tags must satisfy the same contract; never replace a published tag.
set -euo pipefail

fail() { echo "::error::$*" >&2; exit 1; }
[[ "${GITHUB_REF:-}" == 'refs/heads/main' ]] || fail 'can only release from refs/heads/main'
: "${GITHUB_SHA:?event commit required}" "${DATASET_VERSION:?dataset version required}" \
  "${EVENT_BEFORE_SHA:?event before commit required}"
[[ "$GITHUB_SHA" =~ ^[0-9a-f]{40}$ ]] || fail 'invalid GITHUB_SHA'
[[ "$EVENT_BEFORE_SHA" =~ ^[0-9a-f]{40}$ ]] || fail 'invalid EVENT_BEFORE_SHA'
V="v${DATASET_VERSION}"
git check-ref-format "refs/tags/$V"
[[ "$(git rev-parse HEAD)" == "$GITHUB_SHA" ]] || fail 'HEAD does not match GITHUB_SHA'

# Refresh main and fail closed if remote state cannot be established. A later
# main push may already exist, so ancestry (rather than equality) is required.
git fetch --no-tags origin '+refs/heads/main:refs/remotes/origin/main'
git merge-base --is-ancestor "$GITHUB_SHA" refs/remotes/origin/main || fail 'GITHUB_SHA is not reachable from origin/main'

# Compare the whole push, not just HEAD's first parent: one push can contain a
# version bump followed by other commits. The all-zero ref denotes an initial
# push, where no previous dataset exists. GitHub supplies this trusted context.
if [[ "$EVENT_BEFORE_SHA" != '0000000000000000000000000000000000000000' ]]; then
  git merge-base --is-ancestor "$EVENT_BEFORE_SHA" "$GITHUB_SHA" || fail 'before commit is not an ancestor of GITHUB_SHA'
  previous_version="$(git show "${EVENT_BEFORE_SHA}:data/providers.json" | node -e '
    const data = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
    if (typeof data.version !== "string" || !data.version) throw new Error("previous dataset version required");
    process.stdout.write(data.version);
  ')"
  if [[ "$previous_version" == "$DATASET_VERSION" ]]; then
    echo "dataset version unchanged ($DATASET_VERSION); no release tag requested"
    exit 0
  fi
fi

# --exit-code distinguishes an absent tag (2) from a failed lookup. Use an exact
# fully qualified ref, then inspect the remote object rather than a local tag.
if git ls-remote --exit-code --refs origin "refs/tags/$V" > /dev/null; then
  git fetch --no-tags origin "refs/tags/$V"
  [[ "$(git cat-file -t FETCH_HEAD)" == 'tag' ]] || fail "tag $V is not annotated"
  [[ "$(git rev-parse 'FETCH_HEAD^{commit}')" == "$GITHUB_SHA" ]] || fail "tag $V does not resolve to GITHUB_SHA"
  echo "tag $V verified: annotated, at GITHUB_SHA, reachable from main"
  exit 0
else
  status=$?
  [[ "$status" == 2 ]] || fail "cannot query tag $V (git exit $status)"
fi

: "${GH_TOKEN:?token required for tag publication}"
# An annotated tag needs a tagger identity; the runner has none.
git -c user.name='github-actions[bot]' -c user.email='41898282+github-actions[bot]@users.noreply.github.com' \
  tag -a "$V" "$GITHUB_SHA" -m "Dataset $V"
# Supply authentication only to this push; never store it in Git config.
auth="$(printf 'x-access-token:%s' "$GH_TOKEN" | base64 -w0)"
echo "::add-mask::$auth"
git -c "http.https://github.com/.extraheader=AUTHORIZATION: basic $auth" push origin "refs/tags/$V"
echo "created and pushed tag $V"
