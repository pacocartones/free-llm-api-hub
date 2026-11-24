// The release stamp: `generated` moves only with `version`, and the build ranks at a day never older than the data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { datasetAsOf, newestProviderDate, releaseStampErrors } from './lib/release-stamp.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ds = (version, generated, dates = []) => ({ version, generated, providers: dates.map(([last_verified, added]) => ({ last_verified, added })) });

test('newestProviderDate and datasetAsOf: the newest of the stamp and every last_verified/added', () => {
  const d = ds('1.0.0', '2026-11-20', [['2026-11-22', '2026-01-01'], [null, '2026-11-23'], ['bad', undefined]]);
  assert.equal(newestProviderDate(d), '2026-11-23');
  assert.equal(datasetAsOf(d), '2026-11-23', 'a verification after the release stamp moves the reference day');
  assert.equal(datasetAsOf(ds('1.0.0', '2026-11-25', [['2026-11-22', null]])), '2026-11-25', 'never older than the stamp');
  assert.equal(datasetAsOf(ds('1.0.0', '2026-11-25')), '2026-11-25', 'no dated provider');
  const checked = { version: '1.0.0', generated: '2026-11-20', providers: [{ last_verified: '2026-11-21', data_policy: { checked: '2026-11-23' }, free_limits: { checked: '2026-11-22' } }] };
  assert.equal(datasetAsOf(checked), '2026-11-23', 'a policy-only check is a dataset change too');
});

test('a data change keeps the release stamp', () => {
  const base = ds('2.14.2', '2026-11-22', [['2026-11-22', null]]);
  assert.deepEqual(releaseStampErrors(base, ds('2.14.2', '2026-11-22', [['2026-11-24', null]])), [], 'a newer verification needs no bump');
  const errs = releaseStampErrors(base, ds('2.14.2', '2026-11-24', [['2026-11-24', null]]));
  assert.equal(errs.length, 1);
  assert.match(errs[0], /generated changed from 2026-11-22 to 2026-11-24 without a release/);
  assert.match(errs[0], /Leave "generated": "2026-11-22"/);
});

test('a release sets the stamp to cover the data and never moves it back', () => {
  const base = ds('2.14.2', '2026-11-22', [['2026-11-24', null]]);
  assert.deepEqual(releaseStampErrors(base, ds('2.15.0', '2026-11-25', [['2026-11-24', null]])), []);
  assert.match(releaseStampErrors(base, ds('2.15.0', '2026-11-22', [['2026-11-24', null]])).join(), /older than the newest date in the data \(2026-11-24\)/);
  assert.match(releaseStampErrors(ds('2.14.2', '2026-11-22'), ds('2.15.0', '2026-11-21')).join(), /moves generated back/);
  assert.deepEqual(releaseStampErrors(null, base), [], 'nothing to compare with');
});

test('check-release-stamp passes against the committed parent and with an unknown base', () => {
  const run = (args) => spawnSync(process.execPath, [join(ROOT, 'scripts/check-release-stamp.mjs'), ...args], { cwd: ROOT, encoding: 'utf8' });
  const missing = run(['--base', 'no-such-revision-for-this-test']);
  assert.equal(missing.status, 0, missing.stderr);
  assert.match(missing.stdout, /skipped/);
  const head = run(['--base', 'HEAD']);
  const data = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8'));
  // Against HEAD the working tree may hold a local edit; it only fails when that edit moves the stamp.
  if (head.status !== 0) assert.match(head.stderr, /generated changed/);
  else assert.match(head.stdout, new RegExp(data.generated));
});
