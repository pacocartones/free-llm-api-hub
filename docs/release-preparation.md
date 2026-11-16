# Preparing dataset releases

This is the stable local preparation procedure. Tags pin data; GitHub Releases
and uploaded snapshot assets are separate. A tag does not prove green CI or
owner approval. Never move an existing tag or bulk-publish missing releases.

## Fetch official dataset tags

Use a full clone whose `origin` is the official repository. Fetch main and an
explicit, pruned copy of origin tags before either CLI:

```bash
git remote get-url origin
git fetch --no-tags --prune origin \
  "+refs/heads/main:refs/remotes/origin/main" \
  "+refs/tags/*:refs/remotes/origin/tags/*"
```

The separate `refs/remotes/origin/tags/` namespace is the local snapshot of
official origin tags. It must be refreshed using that exact refspec: ordinary
`git fetch --tags` is insufficient. The CLIs never fetch or modify refs themselves.
Arbitrary local `refs/tags/` cannot become a baseline. A candidate must have a
strict dataset SemVer name, match `data/providers.json.version` at its commit,
and belong to fetched `origin/main`. Changelog candidates must also be reachable
from HEAD; the highest coherent version wins. Missing/unusable fetched tags
fail explicitly. This trusts the configured official origin and the last fetch,
not a signature or a live guarantee that the remote has not changed.

## Local, reviewable preparation

1. Fetch as above. Select an existing dataset tag explicitly and record its
   full commit (`git rev-parse refs/remotes/origin/tags/vX.Y.Z^{commit}`). Check its version,
   membership in main and green CI at that exact commit. A current main build is
   not verification of a historical tag.
2. In a separate checkout of that exact commit, run `npm ci --ignore-scripts`,
   `npm test` and `npm run check`. Review any historical failure rather than
   replacing historical data with today's build. Do not execute an unreviewed
   historical workflow or grant it credentials.
3. From the reviewed tooling checkout at the repository root, run:

   ```bash
   npm run release-snapshot -- v2.13.0 /tmp/free-llm-api-hub-v2.13.0
   cd /tmp/free-llm-api-hub-v2.13.0
   sha256sum -c SHA256SUMS
   ```

   Choose a new directory: the tool refuses to overwrite one. It resolves a
   fetched origin tag, checks ancestry against fetched `origin/main`, checks the
   dataset version, and reads JSON/schema directly from that immutable commit.
   Dirty working data never becomes a snapshot. It makes no network requests.
   Run from a committed tooling checkout: modifications or staged changes to
   `scripts/release-snapshot.mjs`, `scripts/lib/provider-csv.mjs`,
   `scripts/lib/release-tags.mjs` or `package.json` are rejected. Each required
   generator must be tracked. Unrelated working data is ignored, since the
   snapshot reads its data from the resolved tag commit.

   - `providers.canonical.json`: byte-exact tagged `data/providers.json`.
   - `providers.json`: dataset JSON with `env_key` removed, matching the site's
     public dataset projection (not the API v1 compatibility projection).
   - `providers.csv`: the existing scalar CSV projection, using the reviewed
     tooling checkout's formatter and columns; nested data remains in JSON and
     formula-like strings retain spreadsheet escaping.
   - `schema.json`: byte-exact tagged canonical schema for the dataset JSON.
   - `snapshot.json`: tag, full data commit, full `toolingCommit`, `nodeVersion`,
     dataset version and file roles.
   - `SHA256SUMS`: sorted SHA-256 hashes of every other asset.

   To reproduce, check out the manifest's `toolingCommit` in a clean full clone,
   use its recorded Node version, fetch official tags as above, and run the same
   command for the recorded tag. Verify the resolved data commit equals the
   manifest's `commit` (do not accept a moved tag), then compare `SHA256SUMS`.
   Both commits and Node version are part of artifact identity; identical data
   prepared by another tooling commit intentionally yields a different manifest.
   Record both commits in the review. Old tags
   can have different schema shapes; independently validate the JSON against
   its tagged schema before approval. Checksums establish byte identity, not
   signatures, provenance or CI success.
4. Reconcile CHANGELOG.md manually. `npm run changelog-draft` starts at the highest
   reachable coherent fetched-origin dataset version, so it intentionally does not reconstruct missing
   historical releases. For a past release review the previous-tag comparison,
   merged PRs and original notes. Cite every user-facing PR and preserve `Thanks
   @user` using the merged PR author, never the squash committer. Do not treat
   git authors as verified GitHub identities. The miner tracks only its explicit
   HISTORY_FIELDS plus additions: removals, other fields and schema changes need
   manual review. Review major-version migration guidance separately.
5. Prepare English notes using `.github/release-template.md`, including the
   exact data commit, canonical JSON hash and `sha256sum -c SHA256SUMS` instructions.
   Have the maintainer review the notes, asset hashes, CI evidence, contributor
   credits and cadence reason (a), (b) or (c) from RELEASING.md.
6. Only after the owner's explicit OK may the maintainer create/publish a GitHub
   Release on the existing tag and upload those reviewed assets. Do not pass an
   automatic tag-creation option. No publication workflow or write token is
   introduced here; the local tools require no secrets. Never auto-promote old
   tags or silently fill the release gap.
