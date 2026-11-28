// Tests for the small exported helpers in lib/compare.mjs and lib/sort.mjs (#883).
// Pure functions: no build needed, run with `node --test scripts/compare-helpers.test.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comparePath, sharedModalities } from './lib/compare.mjs';
import { nameCmp } from './lib/sort.mjs';

test('comparePath joins the two slugs with -vs-, and order matters', () => {
  assert.equal(comparePath('groq', 'cerebras'), 'groq-vs-cerebras');
  assert.equal(comparePath('cerebras', 'groq'), 'cerebras-vs-groq');
});

test('sharedModalities keeps the first provider\'s order', () => {
  const a = { modalities: ['text', 'image', 'audio'] };
  const b = { modalities: ['audio', 'text'] };
  assert.deepEqual(sharedModalities(a, b), ['text', 'audio']);
});

test('sharedModalities: no overlap gives an empty list', () => {
  assert.deepEqual(sharedModalities({ modalities: ['text'] }, { modalities: ['image'] }), []);
});

test('sharedModalities: a missing modalities list reads as empty', () => {
  assert.deepEqual(sharedModalities({}, { modalities: ['text'] }), []);
  assert.deepEqual(sharedModalities({ modalities: ['text'] }, {}), []);
});

test('nameCmp compares raw name strings: -1, 1 and 0', () => {
  assert.equal(nameCmp({ name: 'alpha' }, { name: 'beta' }), -1);
  assert.equal(nameCmp({ name: 'beta' }, { name: 'alpha' }), 1);
  assert.equal(nameCmp({ name: 'same' }, { name: 'same' }), 0);
});

test('nameCmp as a sort comparator orders by raw string, so capitals come first', () => {
  const sorted = [{ name: 'beta' }, { name: 'Zeta' }, { name: 'alpha' }].sort(nameCmp).map((p) => p.name);
  assert.deepEqual(sorted, ['Zeta', 'alpha', 'beta']);
});
