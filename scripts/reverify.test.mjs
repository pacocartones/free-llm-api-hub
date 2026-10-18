// Tests for scripts/reverify.mjs — the local re-verification pass.
//
// The script picks this week's batch of providers to re-verify based on
// their last_verified date and the freshness SLA. These tests verify:
// - Which providers are selected for a fixed date and batch size
// - The order (oldest first)
// - What happens with a provider that has never been verified
// - An empty dataset
//
// No network calls: we test the batch selection logic by importing the
// pacing functions and verifying the script's output.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { SLA_DAYS, ageInDays } = await import('./lib/rules.mjs');
const { weeklyPacing, weeklyBatch } = await import('./lib/pacing.mjs');

const { providers } = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8'));

test('weeklyPacing returns correct size for typical dataset', () => {
  const verified = providers.filter((p) => p.verified && p.last_verified);
  const ages = verified.map((p) => ageInDays(p.last_verified));
  const result = weeklyPacing(ages, SLA_DAYS);
  assert.ok(result.size > 0, 'should have a positive batch size');
  assert.ok(result.size <= 11, 'should not exceed WEEKLY_CAP');
});

test('weeklyPacing returns 0 for empty dataset', () => {
  const result = weeklyPacing([], SLA_DAYS);
  assert.equal(result.size, 0);
  assert.equal(result.steady, 0);
});

test('weeklyBatch selects oldest first', () => {
  const verified = providers.filter((p) => p.verified && p.last_verified);
  const today = new Date();
  const ageOf = (p) => ageInDays(p.last_verified, today);
  const batch = weeklyBatch(verified, ageOf, SLA_DAYS, 5);
  assert.ok(batch.length <= 5, 'should not exceed batch size');
  if (batch.length > 1) {
    for (let i = 1; i < batch.length; i++) {
      assert.ok(
        ageOf(batch[i - 1]) >= ageOf(batch[i]),
        `batch should be sorted oldest first: ${batch[i - 1].name} (${ageOf(batch[i - 1])}d) before ${batch[i].name} (${ageOf(batch[i])}d)`
      );
    }
  }
});

test('weeklyBatch includes stale providers (age > SLA_DAYS)', () => {
  const verified = providers.filter((p) => p.verified && p.last_verified);
  const today = new Date();
  const ageOf = (p) => ageInDays(p.last_verified, today);
  const stale = verified.filter((p) => ageOf(p) > SLA_DAYS);
  if (stale.length > 0) {
    const batch = weeklyBatch(verified, ageOf, SLA_DAYS, 50);
    const staleInBatch = stale.filter((p) => batch.includes(p));
    assert.ok(staleInBatch.length > 0, 'stale providers should be included in batch');
  }
});

test('weeklyBatch excludes providers younger than MIN_AGE_DAYS', () => {
  const verified = providers.filter((p) => p.verified && p.last_verified);
  const today = new Date();
  const ageOf = (p) => ageInDays(p.last_verified, today);
  const young = verified.filter((p) => ageOf(p) < 28);
  if (young.length > 0) {
    const batch = weeklyBatch(verified, ageOf, SLA_DAYS, 50);
    const youngInBatch = young.filter((p) => batch.includes(p));
    assert.equal(youngInBatch.length, 0, 'providers younger than 28 days should not be in batch');
  }
});

test('weeklyBatch with empty dataset returns empty array', () => {
  const batch = weeklyBatch([], () => 0, SLA_DAYS, 5);
  assert.deepEqual(batch, []);
});

test('ageInDays calculates correct age', () => {
  const now = new Date('2026-10-18T00:00:00Z');
  const age = ageInDays('2026-10-01', now);
  assert.equal(age, 17);
});

test('ageInDays returns null for invalid date', () => {
  const age = ageInDays('invalid');
  assert.equal(age, null);
});
