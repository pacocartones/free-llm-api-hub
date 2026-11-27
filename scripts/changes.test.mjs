import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatValue, weekSummary, weekTitle } from './lib/changes.mjs';

test('formatValue renders nulls, booleans, arrays, and scalars consistently', () => {
  assert.equal(formatValue(null), 'unknown');
  assert.equal(formatValue(undefined), 'unknown');
  assert.equal(formatValue(true), 'yes');
  assert.equal(formatValue(false), 'no');
  assert.equal(formatValue('conditional'), 'conditional');
  assert.equal(formatValue(0), '0');
  assert.equal(formatValue([]), '');
  assert.equal(formatValue(['a', 'b']), 'a, b');
});

test('weekSummary deduplicates labels per provider and preserves order', () => {
  assert.equal(
    weekSummary({
      changes: [
        { name: 'Groq', label: 'rate limits' },
        { name: 'Groq', label: 'free tier' },
      ],
    }),
    'Groq: rate limits, free tier.',
  );

  assert.equal(
    weekSummary({
      changes: [
        { name: 'Groq', label: 'rate limits' },
        { name: 'Groq', label: 'rate limits' },
        { name: 'Mistral', label: 'free tier' },
        { name: 'Mistral', label: 'the catch' },
      ],
    }),
    'Groq: rate limits; Mistral: free tier, the catch.',
  );
});

test('weekTitle uses singular and plural counts across providers and field changes', () => {
  assert.equal(
    weekTitle({
      week: '2026-W47',
      start: '2026-11-16',
      end: '2026-11-22',
      count: 1,
      providers: ['Groq'],
    }),
    '2026-W47 (2026-11-16 to 2026-11-22): 1 field change across 1 provider',
  );

  assert.equal(
    weekTitle({
      week: '2026-W48',
      start: '2026-11-23',
      end: '2026-11-29',
      count: 3,
      providers: ['Groq', 'Mistral'],
    }),
    '2026-W48 (2026-11-23 to 2026-11-29): 3 field changes across 2 providers',
  );
});
