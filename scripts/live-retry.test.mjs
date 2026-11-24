import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { retryConfig, backoffDelay, retryFailing, MAX_ATTEMPTS, MAX_DELAY_MS } from './lib/live-retry.mjs';

test('no variables means one attempt and a 10 s first delay; bad values fall back, attempts are capped', () => {
  assert.deepEqual(retryConfig({}), { attempts: 1, baseDelayMs: 10_000 });
  assert.deepEqual(retryConfig({ FLLM_LIVE_ATTEMPTS: '5', FLLM_LIVE_RETRY_DELAY: '3' }), { attempts: 5, baseDelayMs: 3000 });
  assert.deepEqual(retryConfig({ FLLM_LIVE_ATTEMPTS: '0', FLLM_LIVE_RETRY_DELAY: '-1' }), { attempts: 1, baseDelayMs: 10_000 });
  assert.deepEqual(retryConfig({ FLLM_LIVE_ATTEMPTS: 'x', FLLM_LIVE_RETRY_DELAY: 'y' }), { attempts: 1, baseDelayMs: 10_000 });
  assert.equal(retryConfig({ FLLM_LIVE_ATTEMPTS: '999' }).attempts, MAX_ATTEMPTS);
});

test('the delay doubles on every retry and never exceeds the cap', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map((n) => backoffDelay(n, 10_000)), [10_000, 20_000, 40_000, MAX_DELAY_MS, MAX_DELAY_MS]);
  assert.equal(backoffDelay(1, 0), 0);
});

test('only the failing items are checked again, and they recover', async () => {
  const seen = [];
  const waits = [];
  const answers = { a: [200], b: [404, 200], c: [0, 503, 200] };
  const results = await retryFailing(['a', 'b', 'c'], async (batch) => {
    seen.push([...batch]);
    return batch.map((url) => { const status = answers[url].shift(); return { url, status, ok: status === 200 }; });
  }, { attempts: 4, baseDelayMs: 1000, sleep: async (ms) => { waits.push(ms); } });
  assert.deepEqual(seen, [['a', 'b', 'c'], ['b', 'c'], ['c']]);
  assert.deepEqual(waits, [1000, 2000]);
  assert.deepEqual(results.map((r) => [r.url, r.ok]), [['a', true], ['b', true], ['c', true]]);
});

test('a URL that keeps failing is reported with its last result after the bounded attempts', async () => {
  let calls = 0;
  const results = await retryFailing(['ok', 'gone'], async (batch) => {
    calls++;
    return batch.map((url) => ({ url, status: url === 'ok' ? 200 : 404, ok: url === 'ok' }));
  }, { attempts: 3, baseDelayMs: 0, sleep: async () => {} });
  assert.equal(calls, 3);
  assert.deepEqual(results.map((r) => [r.url, r.status, r.ok]), [['ok', 200, true], ['gone', 404, false]]);
});

test('one attempt means no retry and no wait', async () => {
  let waited = false;
  const results = await retryFailing(['x'], async (batch) => batch.map((url) => ({ url, ok: false })), { sleep: async () => { waited = true; } });
  assert.equal(waited, false);
  assert.equal(results[0].ok, false);
});

test('the deploy workflow gives the smoke test the same bounded retries as the sitemap check', () => {
  const wf = readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const step = wf.slice(wf.indexOf('node scripts/smoke-live.mjs'));
  assert.match(step.slice(0, 300), /FLLM_LIVE_ATTEMPTS: \d+/);
  assert.match(step.slice(0, 300), /FLLM_LIVE_RETRY_DELAY: \d+/);
  assert.match(readFileSync(new URL('./smoke-live.mjs', import.meta.url), 'utf8'), /retryFailing\(urls, checkUrls, RETRY\)/);
});
