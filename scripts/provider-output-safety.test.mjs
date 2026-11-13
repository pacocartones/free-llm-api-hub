import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  assertCredentialFree, configuredCredentials, safeModelIds, safeRateLimits,
  UnsafeProviderOutputError,
} from './lib/provider-output-safety.mjs';

const SECRET = 'sk/live-AbC1234567890+private';
const rejects = (fn) => assert.throws(fn, (error) =>
  error instanceof UnsafeProviderOutputError && !error.message.includes(SECRET));

test('configured credentials include every provider key present in the environment', () => {
  const providers = [{ env_key: 'FIRST_KEY' }, { env_key: 'SECOND_KEY' }, { env_key: 'ABSENT_KEY' }];
  assert.deepEqual(configuredCredentials(providers, { FIRST_KEY: 'first-secret', SECOND_KEY: 'second-secret' }),
    ['first-secret', 'second-secret']);
});

test('ordinary model IDs retain their existing syntax and order', () => {
  const ids = ['openai/gpt-oss-120b', '@cf/meta/llama-3.3-70b-instruct', 'cohere/model:free'];
  assert.deepEqual(safeModelIds(ids, [SECRET]), ids);
});

test('model metadata rejects raw, encoded, split and structurally unsafe credentials', () => {
  const base64 = Buffer.from(SECRET).toString('base64');
  const hex = Buffer.from(SECRET).toString('hex');
  rejects(() => safeModelIds([`vendor/${SECRET}:free`], [SECRET]));
  rejects(() => safeModelIds([base64], [SECRET]));
  rejects(() => safeModelIds([hex.replace(/[a-f]/g, (char, i) => i % 2 ? char.toUpperCase() : char)], [SECRET]));
  rejects(() => safeModelIds([SECRET.slice(0, 12), SECRET.slice(12)], [SECRET]));
  rejects(() => safeModelIds(['model\nforged-log'], [SECRET]));
});

test('rate-limit metadata preserves bounded values and rejects credential reflections', () => {
  const ordinary = {
    'x-ratelimit-limit-requests': '30',
    'x-ratelimit-reset-requests': '1m 30s',
    'retry-after': 'Thu, 13 Nov 2026 18:00:00 GMT',
  };
  assert.deepEqual(safeRateLimits(ordinary, [SECRET]), ordinary);
  rejects(() => safeRateLimits({ 'retry-after': Buffer.from(SECRET).toString('base64url') }, [SECRET]));
  rejects(() => safeRateLimits({ 'retry-after': '30\r\nforged: true' }, [SECRET]));
  rejects(() => safeRateLimits({ 'unreviewed-header': '30' }, [SECRET]));
});

test('a credential split across different metadata fields is rejected', () => {
  const fields = [SECRET.slice(0, 14), SECRET.slice(14)];
  rejects(() => assertCredentialFree(fields.join(''), [SECRET]));
});

test('final serialized output cannot contain a configured credential', () => {
  const mixedPercent = encodeURIComponent(SECRET).replace(/%[0-9A-F]{2}/g,
    (part, i) => i % 2 ? part.toLowerCase() : part);
  rejects(() => assertCredentialFree({ models_free: [`prefix-${mixedPercent}-suffix`] }, [SECRET]));
  assert.doesNotThrow(() => assertCredentialFree({ models_free: ['vendor/ordinary-model'] }, [SECRET]));
});

test('the cron prepares a reviewed diff without staging or publishing it', () => {
  const cron = readFileSync(new URL('./probe-cron.sh', import.meta.url), 'utf8');
  assert.match(cron, /review it and open a pull request/);
  assert.doesNotMatch(cron, /\bgit\s+(?:add|commit|push)\b/);
});
