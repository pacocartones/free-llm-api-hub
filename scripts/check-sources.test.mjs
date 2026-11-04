import test from 'node:test';
import assert from 'node:assert/strict';
import { collectSources, checkSources, formatReport, USER_AGENT } from './lib/check-sources.mjs';

const response = (status, body = '') => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => body,
  json: async () => (body ? JSON.parse(body) : {}),
});
const abort = () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; };
const entry = (url, source = 'fixture') => ({ url, sources: [source] });

test('collectSources: provider docs and external docs/sources links are collected once, internal links ignored', () => {
  const providers = [
    { slug: 'alpha', docs_url: 'https://alpha.example/docs.' },
    { slug: 'beta', docs_url: 'https://alpha.example/docs.' },
    { slug: 'none', docs_url: null },
  ];
  const md = '[lead](https://source.example/list) and <https://auto.example/a>, plus https://bare.example/b. Internal [docs](api.md) stay out.';
  assert.deepEqual(collectSources(providers, md), [
    { url: 'https://alpha.example/docs', sources: ['data/providers.json:alpha', 'data/providers.json:beta'] },
    { url: 'https://source.example/list', sources: ['docs/sources.md'] },
    { url: 'https://auto.example/a', sources: ['docs/sources.md'] },
    { url: 'https://bare.example/b', sources: ['docs/sources.md'] },
  ]);
});

test('checkSources: a live link uses one HEAD request with the descriptive User-Agent and no Wayback call', async () => {
  const calls = [];
  const results = await checkSources([entry('https://live.example')], {
    fetchImpl: async (url, options) => { calls.push([url, options.method, options.headers['User-Agent']]); return response(200); },
    sleepImpl: async () => {},
  });
  assert.deepEqual(results.map((r) => [r.url, r.ok, r.status]), [['https://live.example', true, 200]]);
  assert.deepEqual(calls, [['https://live.example', 'HEAD', USER_AGENT]]);
  assert.match(formatReport(results), /no dead or unreachable sources/);
});

test('checkSources: a 404 is dead without a source GET, and Wayback is asked once', async () => {
  const calls = [];
  const results = await checkSources([entry('https://dead.example', 'data/providers.json:dead')], {
    fetchImpl: async (url, options) => {
      calls.push([url, options.method]);
      if (url === 'https://dead.example') return response(404);
      return response(200, '{"archived_snapshots":{}}');
    },
    sleepImpl: async () => {},
  });
  assert.equal(results[0].ok, false);
  assert.equal(results[0].error, 'HTTP 404');
  assert.equal(results[0].wayback, null);
  assert.deepEqual(calls, [
    ['https://dead.example', 'HEAD'],
    ['https://archive.org/wayback/available?url=https%3A%2F%2Fdead.example', 'GET'],
  ]);
  assert.match(formatReport(results), /\| HTTP 404 \| data\/providers\.json:dead \| https:\/\/dead\.example \| - \|/);
});

test('checkSources: a timeout falls back from HEAD to GET and is reported as unreachable', async () => {
  const calls = [];
  const results = await checkSources([entry('https://slow.example')], {
    fetchImpl: async (url, options) => {
      calls.push([url, options.method]);
      if (url === 'https://slow.example') abort();
      return response(200, '{"archived_snapshots":{}}');
    },
    sleepImpl: async () => {},
  });
  assert.equal(results[0].ok, false);
  assert.equal(results[0].error, 'timeout');
  assert.equal(results[0].headError, 'timeout');
  assert.deepEqual(calls.map(([, method]) => method), ['HEAD', 'GET', 'GET']);
  assert.match(formatReport(results), /\| timeout \|/);
});

test('checkSources: a 404 with an available Wayback snapshot prints the snapshot', async () => {
  const snapshot = 'https://web.archive.org/web/20261001000000/https://dead.example';
  const results = await checkSources([entry('https://dead.example')], {
    fetchImpl: async (url) => url === 'https://dead.example'
      ? response(404)
      : response(200, JSON.stringify({ archived_snapshots: { closest: { available: true, url: snapshot } } })),
    sleepImpl: async () => {},
  });
  assert.equal(results[0].wayback, snapshot);
  assert.match(formatReport(results), new RegExp(snapshot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('checkSources: a non-definitive HEAD answer falls back to GET, and every network request is paced', async () => {
  const calls = [];
  const sleeps = [];
  const results = await checkSources([entry('https://one.example'), entry('https://two.example')], {
    fetchImpl: async (url, options) => {
      calls.push([url, options.method]);
      return response(url === 'https://one.example' && options.method === 'HEAD' ? 405 : 200);
    },
    sleepImpl: async (ms) => { sleeps.push(ms); },
  });
  assert.deepEqual(results.map((r) => [r.ok, r.note || '']), [[true, 'HEAD failed; GET answered'], [true, '']]);
  assert.deepEqual(calls, [
    ['https://one.example', 'HEAD'],
    ['https://one.example', 'GET'],
    ['https://two.example', 'HEAD'],
  ]);
  assert.deepEqual(sleeps, [500, 500], 'one 500 ms gap before each request after the first');
});
