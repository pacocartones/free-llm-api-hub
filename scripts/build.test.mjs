// Minimal real tests over the build pipeline (node --test, zero dependencies).
// Covers: serializer round-trip, validator honesty rules, existing self-tests,
// build idempotency, and one generated README row matching the data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { roundTripError } from './_serialize.mjs';
import { freshnessBadge, freshnessColor, recScore, SLA_DAYS, DUE_SOON_DAYS } from './lib/rules.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data/providers.json');
const run = (args) => execFileSync(process.execPath, args, { cwd: ROOT, stdio: 'pipe' });
const exitOk = (args) => {
  try {
    run(args);
    return true;
  } catch {
    return false;
  }
};

test('serializer round-trips data/providers.json byte-exactly', () => {
  assert.equal(roundTripError(readFileSync(DATA, 'utf8')), null);
});

test('validate passes on the real dataset', () => {
  run(['scripts/validate.mjs']); // throws unless exit 0
});

test('validate rejects a verified entry with no last_verified date', () => {
  const data = JSON.parse(readFileSync(DATA, 'utf8'));
  data.providers[0].verified = true;
  data.providers[0].last_verified = null;
  const fixture = join(mkdtempSync(join(tmpdir(), 'flah-')), 'providers.json');
  writeFileSync(fixture, JSON.stringify(data));
  assert.equal(exitOk(['scripts/validate.mjs', fixture]), false);
});

test('validate rejects an unverified entry that still carries a date', () => {
  const data = JSON.parse(readFileSync(DATA, 'utf8'));
  data.providers[0].verified = false;
  data.providers[0].last_verified = '2026-01-01';
  const fixture = join(mkdtempSync(join(tmpdir(), 'flah-')), 'providers.json');
  writeFileSync(fixture, JSON.stringify(data));
  assert.equal(exitOk(['scripts/validate.mjs', fixture]), false);
});

test('validate accepts a credential-only probe result', () => {
  const data = JSON.parse(readFileSync(DATA, 'utf8'));
  data.providers[0].last_probed = '2026-08-03';
  data.providers[0].probe_status = 'auth-ok';
  const fixture = join(mkdtempSync(join(tmpdir(), 'flah-')), 'providers.json');
  writeFileSync(fixture, JSON.stringify(data));
  assert.equal(exitOk(['scripts/validate.mjs', fixture]), true);
});

test('existing script self-tests pass (fetch-models, probe)', () => {
  run(['scripts/fetch-models.mjs', '--self-test']);
  run(['scripts/probe.mjs', '--self-test']);
});

const GENERATED = [
  'README.md',
  'badge-freshness.json',
  'data/providers.csv',
  'data/providers.yaml',
  'site/index.html',
];
const hashAll = () =>
  GENERATED.map((f) => createHash('sha256').update(readFileSync(join(ROOT, f))).digest('hex')).join('|');

test('build is idempotent — a second run changes not a single byte', () => {
  run(['scripts/build.mjs']);
  const first = hashAll();
  run(['scripts/build.mjs']);
  assert.equal(hashAll(), first);
});

test('a generated README row matches the data it was built from', () => {
  const data = JSON.parse(readFileSync(DATA, 'utf8'));
  const p = data.providers.find((x) => x.slug === 'groq');
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  assert.ok(readme.includes(`[${p.name}](${p.docs_url})`), 'README links the provider docs');
  assert.ok(readme.includes(`✅ ${p.last_verified}`), 'README shows the verification date');
});

test('the explorer does not claim a column sort before the user chooses one', () => {
  const explorer = readFileSync(join(ROOT, 'site/index.html'), 'utf8');
  assert.match(explorer, /<th data-key="name" tabindex="0" role="button" aria-sort="none">API<\/th>/);
});

// ---------- the freshness badge has to be able to go amber and red ----------
// The previous badge was graded on the share of entries inside the 90-day SLA.
// With the list re-verified in sweeps it could not leave brightgreen without
// months of silence, so it never reported anything. These cases pin the three
// states to fabricated dates: if someone re-grades the badge on a number that
// cannot decay, one of them fails.
const NOW = new Date('2026-08-07T00:00:00Z');
const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000).toISOString().slice(0, 10);
const entries = (...ages) => ages.map((a) => ({ verified: true, last_verified: daysAgo(a) }));

test('badge is brightgreen while every entry is inside the due-soon window', () => {
  const { badge, oldest } = freshnessBadge(entries(4, 8, DUE_SOON_DAYS), NOW);
  assert.equal(oldest, DUE_SOON_DAYS);
  assert.equal(badge.color, 'brightgreen');
  assert.equal(badge.message, `3/3 verified · oldest ${DUE_SOON_DAYS}d`);
});

test('badge turns yellow as soon as one entry is due for re-verification', () => {
  const { badge } = freshnessBadge(entries(4, 8, DUE_SOON_DAYS + 1), NOW);
  assert.equal(badge.color, 'yellow');
  assert.match(badge.message, new RegExp(`oldest ${DUE_SOON_DAYS + 1}d$`));
});

test('badge turns red as soon as one entry breaches the SLA', () => {
  const { badge } = freshnessBadge(entries(4, 8, SLA_DAYS + 1), NOW);
  assert.equal(badge.color, 'red');
  assert.match(badge.message, new RegExp(`oldest ${SLA_DAYS + 1}d$`));
});

test('badge decays on its own: the same data goes green → yellow → red as time passes', () => {
  const data = entries(0, 10, 27); // roughly today's real spread
  const at = (d) => freshnessBadge(data, new Date(NOW.getTime() + d * 86400000)).badge.color;
  assert.equal(at(0), 'brightgreen');
  assert.equal(at(40), 'yellow'); // oldest is now 67d — nothing was re-verified
  assert.equal(at(70), 'red'); // oldest is now 97d — SLA breached
});

test('badge cannot be brightgreen when most rows were never verified', () => {
  const half = [...entries(1, 1), { verified: false, last_verified: null }, { verified: false, last_verified: null }];
  const { badge, coverage } = freshnessBadge(half, NOW);
  assert.equal(coverage, 0.5);
  assert.equal(badge.color, 'yellow');
  assert.equal(badge.message, '2/4 verified · oldest 1d');
});

test('badge is red with nothing verified at all', () => {
  const { badge } = freshnessBadge([{ verified: false, last_verified: null }], NOW);
  assert.equal(badge.color, 'red');
  assert.equal(badge.message, '0/1 verified');
});

// Deliberately not compared against a freshly built badge: the committed file
// ages a day at a time between the weekly refresh commits, and this suite is a
// blocking check on every pull request. What must always hold is that the file
// is internally consistent — the colour is the one the rule gives to the age the
// message itself states — which catches a hand-edited or half-migrated badge
// without turning the clock into a source of red builds.
test('the shipped badge grades its own stated age by the rule', () => {
  const onDisk = JSON.parse(readFileSync(join(ROOT, 'badge-freshness.json'), 'utf8'));
  assert.equal(onDisk.schemaVersion, 1);
  assert.equal(onDisk.label, 'freshness');
  const m = onDisk.message.match(/^(\d+)\/(\d+) verified · oldest (\d+)d$/);
  assert.ok(m, `unexpected badge message: ${onDisk.message}`);
  const [, verified, total, oldest] = m.map(Number);
  const expected = freshnessColor(Number(oldest));
  assert.equal(onDisk.color, expected === 'brightgreen' && verified / total < 0.7 ? 'yellow' : expected);
});

// ---------- a confirmed "yes" must never look like an unknown ----------
test('the README shows a card wall for every provider confirmed to have one', () => {
  const { providers } = JSON.parse(readFileSync(DATA, 'utf8'));
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  const walled = providers.filter((p) => p.card_required === true);
  assert.ok(walled.length, 'dataset has at least one card-gated provider to check');
  for (const p of walled) {
    const row = readme.split('\n').find((l) => l.includes(`](${p.docs_url})`));
    assert.ok(row, `${p.slug}: no README row found`);
    assert.match(row, /💳 card required/, `${p.slug}: README row hides the card requirement`);
  }
});

test('an unconfirmed flag ranks between a confirmed yes and a confirmed no', () => {
  const base = { category: 'ongoing', free_type: 'perpetual' };
  const no = recScore({ ...base, card_required: false });
  const unknown = recScore({ ...base, card_required: null });
  const yes = recScore({ ...base, card_required: true });
  assert.ok(no > unknown && unknown > yes, `expected ${no} > ${unknown} > ${yes}`);
});
