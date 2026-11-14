<!-- Title: vX.Y.Z — <one-line summary> -->

<One paragraph: what changes for people who use the data, and whether they need to do anything.>

No breaking changes.

### Added

- …

### Changed and fixed

- …

### Contributors

Thank you @… .

### Verify

Data commit: `<full commit at the official tag>`.
Tooling commit: `<snapshot.json toolingCommit>`; Node: `<snapshot.json nodeVersion>`.
Canonical JSON SHA-256: `<providers.canonical.json hash from SHA256SUMS>`.

The JSON, scalar CSV, schema and manifest are pinned snapshot assets. Verify all
asset bytes and the official tag (never an arbitrary local tag):

```bash
sha256sum -c SHA256SUMS
git fetch --no-tags origin "refs/tags/vX.Y.Z:refs/remotes/origin/tags/vX.Y.Z"
git rev-parse 'refs/remotes/origin/tags/vX.Y.Z^{commit}' # must equal the data commit above
git show refs/remotes/origin/tags/vX.Y.Z:data/providers.json | sha256sum
```

In a separate clean full checkout of that exact data commit:

```bash
git switch --detach <full-data-commit>
npm ci --ignore-scripts
npm test && npm run check
```

See [release preparation](../docs/release-preparation.md) for reproduction from
the recorded tooling commit and Node version. Keep the data commit and tooling
commit distinct; neither checksums nor a tag replace CI and owner approval.
