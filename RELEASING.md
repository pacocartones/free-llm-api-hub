# Releasing

How releases of this repository are made and what every release looks like. The same standard
applies to the maintainer's other public repositories, adapted here to a dataset: there is no
npm package to publish, so a release is a pinned snapshot of the data.

## Rules

1. **Versioning:** SemVer on the dataset. A change to the shape of a published file (the
   JSON Schema, the API under `/api/v1/`) that breaks a consumer is a major version; new fields,
   providers or pages are minor; re-verifications and corrections are patch.
2. **Tags:** `vX.Y.Z`, never moved. The tag is created by the `Tag release` workflow, from the
   bump of `version` in `data/providers.json`; nobody tags by hand. A release in GitHub is
   written on an existing tag.
3. **Source:** only from `main`, with every check green, from the exact commit the tag points to.
4. **Approval:** publishing a GitHub release is done by the maintainer, after the owner's OK.
   Nothing is published to a package registry, with one scoped exception: `packages/mcp` (the
   MCP server) may be published to npm and listed in the MCP registry, only after the owner's explicit
   OK for that release, from CI with provenance (`.github/workflows/release-mcp.yml`: tag
   `mcp-vX.Y.Z`, environment `release-mcp` with a required reviewer, npm trusted publishing, no token).
   The package has its own SemVer, independent of the dataset's; `server.json` carries the same
   version. Until the owner enables it the package stays `"private": true` and the workflow does
   nothing.
5. **Notes:** written from the pull requests merged between the previous tag and this one, in
   English. Every pull request that changes something for users is cited by number; related ones
   may share a line. An entry for an outside contributor ends with
   `Thanks @user`; the contributor is the author of the merged pull request, not the committer
   (in a squash merge the committer is GitHub).
6. **Attribution:** no AI attribution or AI co-author trailers in the title, the notes or the tags.
7. **Pre-releases:** none today. A release candidate would be `vX.Y.Z-rc.N`, marked as a
   pre-release on GitHub.
8. **Verification:** the notes say how to check the snapshot (see *Verify* below).
9. **Cadence:** changes accumulate; merging a pull request is not releasing. The dataset `version`
   is bumped, and so tagged and released, only when one of these holds:
   (a) a correction users are relying on, or a security fix: release soon, the same day if needed;
   (b) a milestone of the roadmap is reached;
   (c) at least 14 days since the last release, with at least one minor change users would notice.
   At most one minor release a week, and never two releases on the same day except under (a). The
   owner's OK for a release names which of (a), (b) or (c) applies.
   **Not a reason to release:** documentation, tests, CI, refactors with no visible effect, metadata,
   or crediting a contributor. Those merge without a version bump; the thanks go in the notes of the
   next real release.
10. **Language:** the notes are always in English.
11. **0.x, 1.0 and 2.0** (for `packages/mcp`; the dataset is already 2.x): **0.x** may change its
    tools or output in a minor version, said in the notes. **1.0** needs the public interface fully
    documented and tested, a deprecation policy (what will be removed warns for at least one minor
    release first), at least one real outside user, and the owner's approval as a milestone. **A
    major version** needs the breaking change justified in writing, a migration guide in the notes,
    at least one `-rc.N` first, and breaking changes grouped rather than spent one at a time.

## What a release looks like

**Title:** `vX.Y.Z — <one-line summary>`

**Notes**, in this order (sections with nothing to say are left out):

- A one-paragraph summary: what changes for people who use the data and whether they need to do anything.
- `### Breaking changes and upgrade` (major versions only; otherwise the notes say "No breaking changes.").
- `### Added` and `### Changed and fixed`.
- `### Contributors`, when an entry thanks someone.
- `### Verify`: how to check the snapshot.

The skeleton is in [`.github/release-template.md`](.github/release-template.md).

## Verify

A release is a snapshot of `data/providers.json`. To check the one you downloaded:

```bash
git rev-parse vX.Y.Z^{commit}
git show vX.Y.Z:data/providers.json | sha256sum
npm ci && npm run check
```

The notes of each release give the commit and the sha256 of `data/providers.json` at the tag.
