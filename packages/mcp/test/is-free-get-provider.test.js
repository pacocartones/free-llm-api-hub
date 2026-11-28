// Offline fixture tests for is_free and get_provider covering ongoing and trial providers.

import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createLoader } from '../src/data.js';
import { getProvider, isFree } from '../src/tools.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(HERE, 'fixtures', 'is-free-providers.json');

async function loadOfflineFixture() {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('Unexpected network call in offline fixture test');
  };
  try {
    const loader = createLoader({ dataPath: FIXTURE_PATH });
    return await loader();
  } finally {
    globalThis.fetch = origFetch;
  }
}

test('is_free starts with Yes. for an ongoing provider and names the catch', async () => {
  const data = await loadOfflineFixture();
  const res = isFree(data, { slug: 'steady-ai' });

  assert.equal(res.slug, 'steady-ai');
  assert.match(res.answer, /^Yes\./);
  assert.match(res.answer, /500 requests\/day/);
  assert.match(res.answer, /commercial use: not allowed/i);
  assert.equal(res.last_verified, '2026-11-01');
});

test('is_free starts with No. for a trial provider with $N credit and names the catch', async () => {
  const data = await loadOfflineFixture();
  const res = isFree(data, { slug: 'spark-trial' });

  assert.equal(res.slug, 'spark-trial');
  assert.match(res.answer, /^No\./);
  assert.match(res.answer, /\$5 credit/);
  assert.match(res.answer, /14 days/);
  assert.match(res.answer, /one-time trial credit|not an ongoing free tier/i);
  assert.equal(res.last_verified, '2026-10-15');
});

test('get_provider returns last_verified for both ongoing and trial providers offline', async () => {
  const data = await loadOfflineFixture();

  const ongoing = getProvider(data, { slug: 'steady-ai' });
  assert.equal(ongoing.provider.slug, 'steady-ai');
  assert.equal(ongoing.provider.last_verified, '2026-11-01');

  const trial = getProvider(data, { slug: 'spark-trial' });
  assert.equal(trial.provider.slug, 'spark-trial');
  assert.equal(trial.provider.last_verified, '2026-10-15');
});
