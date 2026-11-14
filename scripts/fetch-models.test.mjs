import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openaiPublic, PREFERRED_MODELS, sample } from './fetch-models.mjs';

test('preferred model configuration contains only IDs verified in the public catalogues', () => {
  assert.deepEqual(PREFERRED_MODELS['nvidia-nim'], [
    'nvidia/nemotron-3-super-120b-a12b',
  ]);
  assert.deepEqual(PREFERRED_MODELS.modelscope, [
    'deepseek-ai/DeepSeek-V4-Flash-0731',
    'MiniMax/MiniMax-M3',
    'Qwen/Qwen3.5-397B-A17B',
    'ZhipuAI/GLM-5.2',
  ]);
});

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

test('openaiPublic returns an injected /models response without sampling before safety checks', async () => {
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
  const fetchModels = openaiPublic('https://models.example.test/v1/models', fetchJson);
  const first = await fetchModels();
  const second = await fetchModels();
  assert.deepEqual(first, second);
  assert.deepEqual(first, [
    'obscure/vendor-a-model', 'headline/vendor-b-model',
    'another/vendor-a-model', 'popular/vendor-c-model',
    'vendor-d/model', 'vendor-e/model', 'vendor-f/model',
    'vendor-g/model', 'vendor-h/model',
  ]);
  assert.deepEqual(calls, [
    'https://models.example.test/v1/models',
    'https://models.example.test/v1/models',
  ]);
});
