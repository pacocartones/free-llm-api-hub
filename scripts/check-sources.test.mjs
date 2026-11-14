import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { collectSources, checkOne, checkSources, formatReport, waybackSnapshot, USER_AGENT } from './lib/check-sources.mjs';
import { createPublicFetch } from './lib/public-fetch.mjs';

const response = (status, body = '') => new Response(body, { status });
const abort = () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; };
const entry = (url, source = 'fixture') => ({ url, sources: [source] });

const streamResponse = ({ status = 200, headers = {}, chunks = [], end = true } = {}) => {
  const response = new PassThrough();
  response.statusCode = status;
  response.headers = headers;
  queueMicrotask(() => {
    for (const chunk of chunks) response.write(chunk);
    if (end) response.end();
  });
  return response;
};

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

test('checkSources: a live link uses one bounded request with the descriptive User-Agent and no Wayback call', async () => {
  const calls = [];
  const results = await checkSources([entry('https://live.example')], {
    fetchImpl: async (url, options) => { calls.push([url, options.method, options.headers['User-Agent']]); return response(200); },
    sleepImpl: async () => {},
  });
  assert.deepEqual(results.map((r) => [r.url, r.ok, r.status]), [['https://live.example', true, 200]]);
  assert.deepEqual(calls, [['https://live.example', undefined, USER_AGENT]]);
  assert.match(formatReport(results), /no dead or unreachable sources/);
});

test('checkSources: a 404 is dead after one source request, and Wayback is asked once', async () => {
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
    ['https://dead.example', undefined],
    ['https://archive.org/wayback/available?url=https%3A%2F%2Fdead.example', undefined],
  ]);
  assert.match(formatReport(results), /\| HTTP 404 \| data\/providers\.json:dead \| https:\/\/dead\.example \| - \|/);
});

test('checkSources: a timeout is reported as unreachable before Wayback is checked', async () => {
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
  assert.deepEqual(calls.map(([, method]) => method), [undefined, undefined]);
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

test('checkSources: every network request after the first is paced', async () => {
  const calls = [];
  const sleeps = [];
  const results = await checkSources([entry('https://one.example'), entry('https://two.example')], {
    fetchImpl: async (url, options) => {
      calls.push([url, options.method]);
      return response(200);
    },
    sleepImpl: async (ms) => { sleeps.push(ms); },
  });
  assert.deepEqual(results.map((r) => [r.ok, r.status]), [[true, 200], [true, 200]]);
  assert.deepEqual(calls, [
    ['https://one.example', undefined],
    ['https://two.example', undefined],
  ]);
  assert.deepEqual(sleeps, [500], 'one 500 ms gap before each request after the first');
});

test('checkOne uses one bounded GET and cancels the response body it does not inspect', async () => {
  let options;
  let cancelled = false;
  const result = await checkOne('https://docs.example.com', {
    timeoutMs: 1234,
    maxBytes: 17,
    fetchImpl: async (_url, received) => {
      options = received;
      return {
        ok: true,
        status: 200,
        body: { cancel: async () => { cancelled = true; } },
      };
    },
  });

  assert.deepEqual(result, { url: 'https://docs.example.com', ok: true, status: 200 });
  assert.equal(options.timeoutMs, 1234);
  assert.equal(options.maxBytes, 17);
  assert.equal(options.method, undefined);
  assert.equal(options.redirect, undefined);
  assert.equal(cancelled, true);
});

test('the default checker rejects a private target without consulting native fetch', async () => {
  const originalFetch = globalThis.fetch;
  let nativeFetchCalled = false;
  globalThis.fetch = async () => {
    nativeFetchCalled = true;
    throw new Error('native fetch must not be used');
  };
  try {
    const result = await checkOne('https://127.0.0.1/admin');
    assert.equal(result.ok, false);
    assert.match(result.error, /non-public IP address/);
    assert.equal(nativeFetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('redirect DNS is revalidated by the checker transport before the second socket', async () => {
  const hosts = [];
  const requestImpl = (url, options, callback) => {
    const request = new EventEmitter();
    request.end = () => queueMicrotask(() => {
      options.lookup(url.hostname, {}, (error) => {
        if (error) { request.emit('error', error); return; }
        callback(streamResponse({
          status: 302,
          headers: { location: 'https://redirect.example/internal' },
          end: false,
        }));
      });
    });
    request.destroy = (error) => { if (error) queueMicrotask(() => request.emit('error', error)); };
    return request;
  };
  const fetchImpl = createPublicFetch({
    requestImpl,
    resolver: (hostname, _options, callback) => {
      hosts.push(hostname);
      callback(null, [{ address: hostname === 'redirect.example' ? '10.0.0.7' : '93.184.216.34', family: 4 }]);
    },
    agent: {},
  });

  const result = await checkOne('https://docs.example.com/start', { fetchImpl });
  assert.equal(result.ok, false);
  assert.match(result.error, /DNS resolved redirect\.example to non-public address 10\.0\.0\.7/);
  assert.deepEqual(hosts, ['docs.example.com', 'redirect.example']);
});

test('Wayback parsing stops at its byte cap and cancels the oversized body', async () => {
  let cancelled = false;
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    headers: new Headers(),
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('1234'));
        controller.enqueue(new TextEncoder().encode('56'));
      },
      cancel() { cancelled = true; },
    }),
  });

  assert.equal(await waybackSnapshot('https://dead.example', { fetchImpl, maxBytes: 5 }), null);
  assert.equal(cancelled, true);
});

test('external cancellation stops the source sweep instead of continuing to Wayback', async () => {
  const controller = new AbortController();
  let requests = 0;
  const fetchImpl = async (_url, { signal }) => {
    requests++;
    return new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      controller.abort(new DOMException('stop sweep', 'AbortError'));
    });
  };

  await assert.rejects(
    checkSources([entry('https://one.example'), entry('https://two.example')], {
      fetchImpl,
      signal: controller.signal,
      sleepImpl: async () => {},
    }),
    (error) => error?.name === 'AbortError'
  );
  assert.equal(requests, 1);
});
