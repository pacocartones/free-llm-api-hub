// Integrity tests for the editorial ranking (data/best.json).
// The /best page, the README top-20 and /api/v1/best.json all claim every pick
// is a verified provider with editorial copy. These tests pin that invariant
// to the data and to the shared checker in lib/best.mjs (#165).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bestPickErrors, assertBestPicks, resolveBestEntries } from './lib/best.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data/providers.json');

test('every editorial /best pick is verified and carries why + tag', () => {
  const data = JSON.parse(readFileSync(DATA, 'utf8'));
  const best = JSON.parse(readFileSync(join(ROOT, 'data/best.json'), 'utf8'));
  assert.deepEqual(bestPickErrors(best, data.providers), []);
  const bySlug = new Map(data.providers.map((x) => [x.slug, x]));
  for (const e of best.entries) {
    const p = bySlug.get(e.slug);
    assert.equal(p.verified, true, `${e.slug}: editorial pick must be verified`);
    assert.ok(typeof e.why === 'string' && e.why.trim().length > 0, `${e.slug}: missing why`);
    assert.ok(typeof e.tag === 'string' && e.tag.trim().length > 0, `${e.slug}: missing tag`);
  }
});

test('assertBestPicks rejects an unverified, copy-empty, unknown or duplicate pick', () => {
  const providers = [
    { slug: 'alpha', name: 'Alpha', verified: true },
    { slug: 'beta', name: 'Beta', verified: false },
  ];
  const ok = { entries: [{ slug: 'alpha', why: 'solid free tier', tag: "Editor's pick" }] };
  assert.deepEqual(bestPickErrors(ok, providers), []);
  assert.equal(resolveBestEntries(ok, providers)[0].p.slug, 'alpha');

  const unverified = { entries: [{ slug: 'beta', why: 'looks fine', tag: 'Sleeper' }] };
  assert.match(bestPickErrors(unverified, providers)[0], /not verified/);
  assert.throws(() => assertBestPicks(unverified, providers), /not verified/);

  const noWhy = { entries: [{ slug: 'alpha', why: '   ', tag: "Editor's pick" }] };
  assert.match(bestPickErrors(noWhy, providers)[0], /"why"/);

  const noTag = { entries: [{ slug: 'alpha', why: 'solid free tier', tag: '' }] };
  assert.match(bestPickErrors(noTag, providers)[0], /"tag"/);

  const unknown = { entries: [{ slug: 'ghost', why: 'nope', tag: 'Nope' }] };
  assert.match(bestPickErrors(unknown, providers)[0], /unknown slug: ghost/);

  const dup = { entries: [
    { slug: 'alpha', why: 'one', tag: 'A' },
    { slug: 'alpha', why: 'two', tag: 'B' },
  ] };
  assert.match(bestPickErrors(dup, providers)[0], /more than once/);

  assert.match(bestPickErrors({ entries: [] }, providers)[0], /non-empty entries array/);
});

test('the validator and check-best consume the shared best-pick checker', () => {
  const validate = readFileSync(join(ROOT, 'scripts/validate.mjs'), 'utf8');
  assert.match(validate, /from '\.\/lib\/best\.mjs'/, 'validate.mjs must import lib/best.mjs');
  assert.match(validate, /bestPickErrors/, 'validate.mjs must run bestPickErrors on the real dataset');
  const check = readFileSync(join(ROOT, 'scripts/check-best.mjs'), 'utf8');
  assert.match(check, /from '\.\/lib\/best\.mjs'/, 'check-best.mjs must import lib/best.mjs');
  assert.match(check, /assertBestPicks/, 'check-best.mjs must call assertBestPicks');
});

test('/api/v1/best.json does not expose an unverified pick', () => {
  const p = join(ROOT, 'site/api/v1/best.json');
  if (!existsSync(p)) {
    execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: ROOT, stdio: 'pipe' });
  }
  const payload = JSON.parse(readFileSync(p, 'utf8'));
  assert.ok(payload.picks.length > 0, 'best.json should list editorial picks');
  for (const pick of payload.picks) {
    assert.equal(pick.verified, true, `${pick.slug}: /api/v1/best.json must not expose an unverified pick`);
    assert.ok(pick.why && String(pick.why).trim(), `${pick.slug}: pick is missing why`);
  }
});
