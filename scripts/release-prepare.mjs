#!/usr/bin/env node
// release-prepare.mjs — the edits of a dataset release pull request, in one command. Local only: no tag, no push.
//
//   npm run release:prepare -- X.Y.Z [--date YYYY-MM-DD]   the release: version, release stamp and changelog
//   npm run changelog:collect                             only move changes/unreleased/*.md under ## [Unreleased]
//
// For a release it sets `version` and `generated` (the release stamp, today in UTC unless --date) in
// data/providers.json, the same version in the root package.json and package-lock.json, and moves every
// changelog fragment (changes/unreleased/*.md) and the current `## [Unreleased]` entries under
// `## [X.Y.Z] — <date>` in CHANGELOG.md. Then: write the summary paragraph, `npm run build`, `npm test`, and open the
// release pull request. The `Tag release` workflow creates the tag after the merge (RELEASING.md).
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { serialize, roundTripError } from './_serialize.mjs';
import { collectFragments, readFragments, FRAGMENT_DIR } from './lib/changelog-fragments.mjs';
import { newestProviderDate, utcToday, DATE_RE } from './lib/release-stamp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

const semverParts = (v) => SEMVER_RE.exec(v || '')?.slice(1).map(Number) ?? null;
export function semverGreater(a, b) {
  const x = semverParts(a); const y = semverParts(b);
  if (!x || !y) return false;
  for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}

/** Collect the fragments under ## [Unreleased]; returns the names moved. */
export function collectOnly(root = ROOT) {
  const fragments = readFragments(root);
  const path = join(root, 'CHANGELOG.md');
  writeFileSync(path, collectFragments(readFileSync(path, 'utf8'), fragments));
  for (const f of fragments) unlinkSync(join(root, FRAGMENT_DIR, f.name));
  return fragments.map((f) => f.name);
}

/** Prepare release `version` dated `date` (today in UTC by default). Throws before writing anything if a rule fails. */
export function prepareRelease(version, { root = ROOT, date = utcToday(process.env.VALIDATE_TODAY) } = {}) {
  const dataPath = join(root, 'data/providers.json');
  const raw = readFileSync(dataPath, 'utf8');
  const rt = roundTripError(raw);
  if (rt) throw new Error(`data/providers.json is not in canonical form: ${rt}`);
  const data = JSON.parse(raw);
  const today = utcToday(process.env.VALIDATE_TODAY);
  if (!SEMVER_RE.test(version || '')) throw new Error('Usage: npm run release:prepare -- X.Y.Z [--date YYYY-MM-DD]');
  if (!semverGreater(version, data.version)) throw new Error(`version ${version} must be greater than the current ${data.version}`);
  if (!DATE_RE.test(date)) throw new Error('--date must be YYYY-MM-DD');
  if (date > today) throw new Error(`release date ${date} is after today in UTC (${today})`);
  const newest = newestProviderDate(data);
  if (newest && date < newest) throw new Error(`release date ${date} is older than the newest last_verified/added (${newest})`);
  if (date < data.generated) throw new Error(`release date ${date} is older than the previous release stamp (${data.generated})`);

  const changelogPath = join(root, 'CHANGELOG.md');
  const fragments = readFragments(root);
  const changelog = collectFragments(readFileSync(changelogPath, 'utf8'), fragments, { version, date });

  const pkgPath = join(root, 'package.json');
  const lockPath = join(root, 'package-lock.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  pkg.version = version;
  lock.version = version;
  if (lock.packages && lock.packages['']) lock.packages[''].version = version;

  writeFileSync(dataPath, serialize({ ...data, version, generated: date }));
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
  writeFileSync(changelogPath, changelog);
  for (const f of fragments) unlinkSync(join(root, FRAGMENT_DIR, f.name));
  return { from: data.version, version, date, fragments: fragments.map((f) => f.name) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    if (args[0] === '--collect') {
      const moved = collectOnly();
      console.log(moved.length ? `Moved ${moved.length} fragment(s) under ## [Unreleased]: ${moved.join(', ')}` : 'No changelog fragments to collect.');
    } else {
      const at = args.indexOf('--date');
      const r = prepareRelease(args[0], at >= 0 ? { date: args[at + 1] } : {});
      console.log(`Release ${r.from} → ${r.version}, dated ${r.date}; ${r.fragments.length} changelog fragment(s) collected.`);
      console.log('Next: write the summary paragraph under the new heading in CHANGELOG.md, run `npm run contributors`, `npm run build && npm test`, commit, and open the release pull request (RELEASING.md).');
    }
  } catch (error) { console.error(`release-prepare: ${error.message}`); process.exitCode = 1; }
}
