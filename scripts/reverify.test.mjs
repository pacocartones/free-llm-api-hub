// Tests for scripts/reverify.mjs — the local re-verification pass (issue #466).
//
// The script picks this week's batch of providers to re-verify from their
// last_verified date and the freshness SLA. These tests drive the script itself
// through its exported reverifyBatch(): a fixed provider fixture, a fixed clock
// and an injected fetch. Nothing reads data/providers.json and nothing touches
// the network, so every test always checks something — including the stale and
// young-provider cases, which the old dataset-driven tests skipped whenever the
// live dataset happened not to contain such a provider.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTmpDir } from './lib/tmp.mjs';
import { reverifyBatch } from './reverify.mjs';
import { SLA_DAYS, ageInDays } from './lib/rules.mjs';
import { weeklyPacing, weeklyBatch, WEEKLY_CAP, MIN_AGE_DAYS } from './lib/pacing.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NOW = new Date('2026-10-18T12:00:00Z');
const DAY = 86400000;
const daysAgo = (n) => new Date(NOW.getTime() - n * DAY).toISOString().slice(0, 10);

// A fixed dataset: two stale entries, one exactly at the SLA, one due soon, one
// exactly at the minimum age, one younger than it, and two that can never be
// scheduled (never verified, and verified without a date). Ages are exact
// because NOW is midday UTC and ageInDays floors whole days.
const FIXTURE = [
  { slug: 'stale-oldest', name: 'Stale Oldest', verified: true, last_verified: daysAgo(139), docs_url: 'https://example.com/stale-oldest' },
  { slug: 'stale-newer', name: 'Stale Newer', verified: true, last_verified: daysAgo(91), docs_url: 'https://example.com/stale-newer' },
  { slug: 'at-sla', name: 'At SLA', verified: true, last_verified: daysAgo(SLA_DAYS), docs_url: 'https://example.com/at-sla' },
  { slug: 'due-soon', name: 'Due Soon', verified: true, last_verified: daysAgo(61), docs_url: 'https://example.com/due-soon' },
  { slug: 'at-min-age', name: 'At Min Age', verified: true, last_verified: daysAgo(MIN_AGE_DAYS), docs_url: 'https://example.com/at-min-age' },
  { slug: 'young', name: 'Young', verified: true, last_verified: daysAgo(MIN_AGE_DAYS - 1), docs_url: 'https://example.com/young' },
  { slug: 'never-verified', name: 'Never Verified', verified: false, last_verified: null },
  { slug: 'verified-no-date', name: 'Verified No Date', verified: true, last_verified: null },
];
const SCHEDULABLE = FIXTURE.filter((p) => p.verified && p.last_verified);
const ageOf = (p) => ageInDays(p.last_verified, NOW);

/** Collect everything the script logs, so a test can assert on its output. */
const captureLog = () => {
  const lines = [];
  return { text: () => lines.join('\n'), log: (line) => lines.push(line) };
};

/** A fetch that records what it was asked for and never leaves the machine. */
const stubFetch = () => {
  const calls = [];
  return { calls, fetch: async (p) => { calls.push(p.slug); return { status: '200', text: `docs for ${p.slug}` }; } };
};

test('the weekly batch is the oldest verified entries, oldest first', async () => {
  const out = captureLog();
  const { batch } = await reverifyBatch(FIXTURE, { now: NOW, noFetch: true, log: out.log });

  // Pacing sizes this fixture at 3 a week, so the batch is the three entries
  // that would breach the SLA before next week: 139d, 91d and exactly 90d.
  assert.deepEqual(batch.map((p) => p.slug), ['stale-oldest', 'stale-newer', 'at-sla']);
  assert.deepEqual(batch.map((p) => ageOf(p)), [139, 91, 90], 'oldest verification first');
  assert.match(out.text(), /^Re-verification batch — 3 of 6 verified \(oldest first\):\n/);
  assert.match(out.text(), /- Stale Oldest \(stale-oldest\) — \d{4}-\d{2}-\d{2} \(139d\) · https:\/\/example\.com\/stale-oldest/);
});

test('--batch N takes the N oldest verified entries, oldest first', async () => {
  const expected = {
    1: ['stale-oldest'],
    2: ['stale-oldest', 'stale-newer'],
    4: ['stale-oldest', 'stale-newer', 'at-sla', 'due-soon'],
    // --batch overrides the pacing size and takes the N oldest verified as-is,
    // so it can include an entry the weekly batch would leave out (27d old).
    6: SCHEDULABLE.map((p) => p.slug),
  };
  for (const [size, slugs] of Object.entries(expected)) {
    const { batch } = await reverifyBatch(FIXTURE, { now: NOW, batchSize: Number(size), noFetch: true, log: () => {} });
    assert.deepEqual(batch.map((p) => p.slug), slugs, `--batch ${size}`);
  }
});

test('providers that were never verified are never scheduled', async () => {
  for (const opts of [{ batchSize: null }, { batchSize: 6 }]) {
    const out = captureLog();
    const { batch } = await reverifyBatch(FIXTURE, { now: NOW, noFetch: true, log: out.log, ...opts });
    assert.deepEqual(batch.filter((p) => !p.verified || !p.last_verified), [], `unschedulable provider in batch: ${JSON.stringify(opts)}`);
    assert.ok(batch.every((p) => p.verified && p.last_verified), `every batch entry is schedulable: ${JSON.stringify(opts)}`);
    assert.match(out.text(), /of 6 verified/, `header should count the schedulable entries: ${JSON.stringify(opts)}`);
  }
});

test('--no-fetch prints the batch and fetches nothing', async () => {
  const out = captureLog();
  const stub = stubFetch();
  const { dossiers } = await reverifyBatch(FIXTURE, { now: NOW, noFetch: true, fetchDocs: stub.fetch, log: out.log });

  assert.deepEqual(stub.calls, [], 'no provider docs should be fetched');
  assert.deepEqual(dossiers, []);
  assert.match(out.text(), /--no-fetch: dossiers not written\./);
  assert.doesNotMatch(out.text(), /Fetching provider docs/);
});

test('dossiers are written for the batch, in order, with the injected fetch', async () => {
  const outDir = makeTmpDir();
  const out = captureLog();
  const stub = stubFetch();
  const { batch, dossiers } = await reverifyBatch(FIXTURE, { now: NOW, batchSize: 2, fetchDocs: stub.fetch, outDir, log: out.log });

  assert.deepEqual(stub.calls, ['stale-oldest', 'stale-newer'], 'one fetch per batch entry, in batch order');
  assert.deepEqual(dossiers.map((d) => d.slug), ['stale-oldest', 'stale-newer']);
  assert.equal(batch.length, 2);

  const dossier = readFileSync(join(outDir, 'stale-oldest.md'), 'utf8');
  assert.match(dossier, /^# Stale Oldest \(`stale-oldest`\)/);
  assert.match(dossier, /- docs: https:\/\/example\.com\/stale-oldest/);
  assert.match(dossier, /- last_verified: .* \(139d ago\) · fetched 2026-10-18/, 'the dossier is stamped with the injected clock');
  assert.match(dossier, /- fetch status: 200/);
  assert.match(dossier, /## Provider docs \(extracted text\)\n\ndocs for stale-oldest/);
  assert.ok(existsSync(join(outDir, 'stale-newer.md')));
  assert.equal(existsSync(join(outDir, 'at-sla.md')), false, 'only the batch is fetched');

  assert.match(out.text(), /Fetching provider docs…\n {2}✓ stale-oldest \(200\)\n {2}✓ stale-newer \(200\)/);
  assert.match(out.text(), new RegExp(`Dossiers written to ${outDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.`));
});

test('an empty dataset prints an empty batch and writes nothing', async () => {
  const outDir = makeTmpDir();
  const out = captureLog();
  const stub = stubFetch();
  const { batch, dossiers } = await reverifyBatch([], { now: NOW, fetchDocs: stub.fetch, outDir, log: out.log });

  assert.deepEqual(batch, []);
  assert.deepEqual(dossiers, []);
  assert.deepEqual(stub.calls, []);
  assert.match(out.text(), /^Re-verification batch — 0 of 0 verified \(oldest first\):\n$/);
});

// --- the pacing helpers, on fixed inputs ---

test('weeklyPacing returns a positive size within WEEKLY_CAP for a fixed age list', () => {
  const result = weeklyPacing(SCHEDULABLE.map(ageOf), SLA_DAYS);
  assert.ok(result.size > 0, 'should have a positive batch size');
  assert.ok(result.size <= WEEKLY_CAP, 'should not exceed WEEKLY_CAP');
});

test('weeklyPacing returns 0 for an empty dataset', () => {
  const result = weeklyPacing([], SLA_DAYS);
  assert.equal(result.size, 0);
  assert.equal(result.steady, 0);
});

test('weeklyBatch selects oldest first', () => {
  const batch = weeklyBatch(FIXTURE, ageOf, SLA_DAYS, 10);
  const ages = batch.map(ageOf);
  assert.deepEqual(ages, [...ages].sort((a, b) => b - a), 'oldest verification first');
});

test('weeklyBatch includes providers older than the SLA', () => {
  const batch = weeklyBatch(FIXTURE, ageOf, SLA_DAYS, 10);
  assert.deepEqual(batch.map((p) => p.slug), ['stale-oldest', 'stale-newer', 'at-sla', 'due-soon', 'at-min-age']);
});

test(`weeklyBatch excludes providers younger than MIN_AGE_DAYS (${MIN_AGE_DAYS})`, () => {
  const batch = weeklyBatch(FIXTURE, ageOf, SLA_DAYS, 10);
  assert.ok(!batch.some((p) => p.slug === 'young'), 'a provider verified 27 days ago should not be proposed');
  assert.ok(batch.some((p) => p.slug === 'at-min-age'), 'a provider verified exactly MIN_AGE_DAYS ago is old enough');
});

test('weeklyBatch with an empty dataset returns an empty array', () => {
  assert.deepEqual(weeklyBatch([], () => 0, SLA_DAYS, 5), []);
});

test('ageInDays calculates the correct age', () => {
  assert.equal(ageInDays('2026-10-01', NOW), 17);
  assert.equal(ageInDays(daysAgo(SLA_DAYS), NOW), SLA_DAYS);
});

test('ageInDays returns null for an invalid date', () => {
  assert.equal(ageInDays('invalid'), null);
});

// --- the CLI itself, offline ---

test('the CLI prints the batch and exits 0 with --no-fetch (no network)', () => {
  const cli = execFileSync('node', [join(ROOT, 'scripts/reverify.mjs'), '--no-fetch'], { encoding: 'utf8' });
  assert.match(cli, /^Re-verification batch — \d+ of \d+ verified \(oldest first\):\n/);
  assert.match(cli, /--no-fetch: dossiers not written\./);
});
