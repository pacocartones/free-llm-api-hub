import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { modelKey, bareModelId, displayName, groupModels, MODEL_ALIASES, MODEL_KEY_RE, RESERVED_MODEL_KEYS } from './lib/model-keys.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const providers = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8')).providers;

test('deployment names of the same model share one key', () => {
  const same = [
    ['gpt-oss-120b', ['gpt-oss-120b', 'openai/gpt-oss-120b']],
    ['gpt-oss-20b', ['openai/gpt-oss-20b', 'gpt-oss-20b']],
    ['gemma-4-26b-a4b-it', ['google/gemma-4-26b-a4b-it:free', '@cf/google/gemma-4-26b-a4b-it', 'gemma-4-26b-a4b-it']],
    ['gemma-4-31b-it', ['gemma-4-31B-it', 'google/gemma-4-31B-it']],
    ['llama-3.3-70b-instruct', ['llama-3.3-70b-instruct', 'meta/llama-3.3-70b-instruct', 'meta-llama/Llama-3.3-70B-Instruct']],
    ['minimax-m3', ['MiniMax/MiniMax-M3', 'minimax/minimax-m3', 'MiniMaxAI/MiniMax-M3']],
    ['glm-5.2', ['ZhipuAI/GLM-5.2', 'zai-org/GLM-5.2']],
    ['deepseek-v4-flash-0731', ['deepseek-ai/DeepSeek-V4-Flash-0731']],
    ['qwen3.8-27b', ['qwen/qwen3.8-27b', 'qwen-3.8-27b']],
  ];
  for (const [key, ids] of same) for (const id of ids) assert.equal(modelKey(id), key, id);
});

test('a different size, version, date, quantisation or base/instruct suffix stays a separate key', () => {
  const apart = [
    ['gpt-oss-20b', 'gpt-oss-120b'],
    ['deepseek-v4-flash', 'deepseek-v4-flash-0731'],
    ['llama-3.3-70b-instruct', '@cf/meta/llama-3.3-70b-instruct-fp8-fast'],
    ['gemma-3-12b', 'google/gemma-3-12b-it'],
    ['glm-5.3-flash', 'glm5.3-flash'], // looks alike, not reviewed: stays apart until MODEL_ALIASES says otherwise
  ];
  for (const [a, b] of apart) assert.notEqual(modelKey(a), modelKey(b), `${a} vs ${b}`);
  assert.equal(modelKey('@cf/meta/llama-3.3-70b-instruct-fp8-fast'), 'llama-3.3-70b-instruct-fp8-fast');
});

test('bareModelId keeps the case and drops only the prefixes and the :free suffix', () => {
  assert.equal(bareModelId('meta-llama/Llama-3.3-70B-Instruct'), 'Llama-3.3-70B-Instruct');
  assert.equal(bareModelId('google/gemma-4-26b-a4b-it:free'), 'gemma-4-26b-a4b-it');
  assert.equal(bareModelId('@cf/qwen/qwen2.5-coder-32b-instruct'), 'qwen2.5-coder-32b-instruct');
});

test('an ID that cannot make a safe key, or a reserved one, gets none', () => {
  assert.equal(modelKey('my model'), null);
  assert.equal(modelKey('org/under_score'), null);
  assert.equal(modelKey(''), null);
  for (const k of RESERVED_MODEL_KEYS) assert.equal(modelKey(`org/${k}`), null, k);
});

test('every alias is lower-case, points at a key that exists in the dataset, and has no chain or cycle', () => {
  const keys = new Set(groupModels(providers).map((g) => g.key));
  for (const [from, to] of Object.entries(MODEL_ALIASES)) {
    assert.equal(from, from.toLowerCase());
    assert.match(to, MODEL_KEY_RE);
    assert.ok(!Object.hasOwn(MODEL_ALIASES, to), `${from} -> ${to} is a chain`);
    assert.notEqual(from, to);
    assert.ok(keys.has(to), `${to} (alias target of ${from}) is not a key in the dataset`);
  }
});

test('every key of the real dataset fits the URL pattern and none is reserved', () => {
  const groups = groupModels(providers);
  assert.ok(groups.length > 0);
  for (const g of groups) {
    assert.match(g.key, MODEL_KEY_RE);
    assert.ok(!RESERVED_MODEL_KEYS.includes(g.key), g.key);
    assert.ok(g.entries.length >= 1);
    assert.equal(new Set(g.entries.map((e) => e.p.slug)).size, g.entries.length, `${g.key}: a provider appears once`);
  }
  assert.deepEqual(groups.map((g) => g.key), [...groups.map((g) => g.key)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)), 'sorted by key');
});

test('the display name is the most frequent bare ID, ties broken by code-point order (input order does not matter)', () => {
  assert.equal(displayName(['MiniMax/MiniMax-M3', 'minimax/minimax-m3', 'MiniMaxAI/MiniMax-M3']), 'MiniMax-M3');
  assert.equal(displayName(['openai/gpt-oss-120b', 'gpt-oss-120b']), 'gpt-oss-120b');
  assert.equal(displayName(['b/Zeta-1', 'a/zeta-1']), displayName(['a/zeta-1', 'b/Zeta-1']));
});

test('empty or missing samples give no groups', () => {
  assert.deepEqual(groupModels([]), []);
  assert.deepEqual(groupModels(undefined), []);
  assert.deepEqual(groupModels([{ slug: 'a', models_free: null }, { slug: 'b', models_free: [] }, { slug: 'c' }]), []);
});
