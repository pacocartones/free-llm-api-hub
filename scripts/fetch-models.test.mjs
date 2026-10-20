import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openaiPublic, sample } from './fetch-models.mjs';

test('preferred IDs lead the sample and remaining slots stay publisher-diverse', () => {
  const ids = [
    'alpha/featured', 'alpha/older', 'alpha/oldest',
    'beta/featured', 'beta/older',
    'gamma/featured', 'gamma/older',
    'delta/featured', 'epsilon/featured',
    'zeta/featured',
  ];
  const expected = [
    'alpha/featured', 'alpha/older', 'beta/featured',
    'beta/older', 'delta/featured', 'epsilon/featured',
    'gamma/featured', 'zeta/featured',
  ].sort();
  assert.deepEqual(sample(ids, ['beta/featured', 'alpha/featured']), expected);
  assert.deepEqual(sample([...ids].reverse(), ['beta/featured', 'alpha/featured']), expected);
});

test('missing preferred IDs are ignored and round-robin fills the sample', () => {
  const ids = [
    'alpha/a', 'alpha/b', 'alpha/c',
    'beta/a', 'beta/b', 'gamma/a',
    'delta/a', 'epsilon/a', 'zeta/a',
  ];
  const result = sample(ids, ['alpha/missing', 'beta/a']);
  assert.deepEqual(result, [
    'alpha/a', 'alpha/b', 'zeta/a', 'beta/a',
    'beta/b', 'delta/a', 'epsilon/a', 'gamma/a',
  ].sort());
  assert.equal(result.length, 8);
});

test('openaiPublic uses an injected /models response and is deterministic', async () => {
  const calls = [];
  const fetchJson = async (url) => {
    calls.push(url);
    return { data: [
      { id: 'obscure/vendor-a-model' },
      { id: 'headline/vendor-b-model' },
      { id: 'another/vendor-a-model' },
      { id: 'popular/vendor-c-model' },
      { id: 'vendor-d/model' },
      { id: 'vendor-e/model' },
      { id: 'vendor-f/model' },
      { id: 'vendor-g/model' },
      { id: 'vendor-h/model' },
    ] };
  };
  const fetchModels = openaiPublic('https://models.example.test/v1/models', [
    'headline/vendor-b-model', 'popular/vendor-c-model', 'not-in-catalog/model',
  ], fetchJson);
  const first = await fetchModels();
  const second = await fetchModels();
  assert.deepEqual(first, second);
  assert.deepEqual(first, [
    'another/vendor-a-model', 'headline/vendor-b-model',
    'obscure/vendor-a-model', 'popular/vendor-c-model',
    'vendor-d/model', 'vendor-e/model', 'vendor-f/model',
    'vendor-g/model',
  ].sort());
  assert.deepEqual(calls, [
    'https://models.example.test/v1/models',
    'https://models.example.test/v1/models',
  ]);
});
