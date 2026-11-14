# Dataset release audit and preparation (#608)

Observed 2026-11-14 against main `46b93b5` (GitHub REST releases endpoint,
all pages, and a full clone's `refs/tags`). This is a dated observation, not a
claim that every tag is an approved release. No release was created or changed.

| Dataset tags | GitHub Release | Uploaded assets |
| --- | --- | --- |
| v2.1.0, v2.2.0 | Published | None |
| v2.3.0, v2.4.0, v2.5.0, v2.6.0, v2.7.0, v2.8.0, v2.9.0 | Absent | None |
| v2.9.1 | Published | None |
| v2.10.0 | Absent | None |
| v2.11.0 | Published | None |
| v2.12.0, v2.13.0 | Absent | None |

There are 14 dataset tags, four published releases and ten tags without a
release. GitHub's automatically generated source archives are not uploaded
snapshot assets. No published release has JSON/CSV/schema/checksum assets.
`data/providers.json` is 2.13.0; package.json and package-lock.json still say
2.11.0. The dataset version is authoritative under RELEASING.md; this task
neither bumps versions nor changes tags. CHANGELOG.md's last dated version is
2.9.1 and Unreleased still includes tagged work, as #608 describes. Its existing
prose and contributor credits are retained for editorial reconciliation.

`Tag release` only creates a tag on a data push. It does not publish releases,
upload assets, or gate tagging on the completion of the verification workflow.
Tag presence alone therefore proves neither CI success nor owner approval.
The tag creation date can differ from the release publication date (notably
v2.11.0); do not invent changelog dates from either one without reviewing the
actual snapshot. Do not bulk-backfill releases or move existing tags.

## Local, reviewable preparation

1. Fetch main and tags in a full clone. Select an existing dataset tag explicitly
   and record its full commit (`git rev-parse vX.Y.Z^{commit}`). Check its version,
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

   Choose a new directory: the tool refuses to overwrite one. It resolves an
   existing tag, checks ancestry against fetched `origin/main`, checks the
   dataset version, and reads JSON/schema directly from that immutable commit.
   Dirty working data never becomes a snapshot. It makes no network requests.

   - `providers.canonical.json`: byte-exact tagged `data/providers.json`.
   - `providers.json`: dataset JSON with `env_key` removed, matching the site's
     public dataset projection (not the API v1 compatibility projection).
   - `providers.csv`: the existing scalar CSV projection, using the reviewed
     tooling checkout's formatter and columns; nested data remains in JSON and
     formula-like strings retain spreadsheet escaping.
   - `schema.json`: byte-exact tagged canonical schema for the dataset JSON.
   - `snapshot.json`: tag, full commit, version and file roles.
   - `SHA256SUMS`: sorted SHA-256 hashes of every other asset.

   Record the tooling commit as well as the data commit in the review. Old tags
   can have different schema shapes; independently validate the JSON against
   its tagged schema before approval. Checksums establish byte identity, not
   signatures, provenance or CI success.
4. Reconcile CHANGELOG.md manually. `npm run changelog-draft` starts at the highest
   reachable dataset version, so it intentionally does not reconstruct missing
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

To repeat the observation without writes:

```bash
git fetch origin main --tags
git tag --list 'v*' --sort=version:refname
gh api repos/pacocartones/free-llm-api-hub/releases --paginate --jq '.[] | {tag_name, draft, published_at, assets: [.assets[].name]}'
```
