import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchDocs } from './lib/reverify-fetch.mjs';

const provider = { docs_url: 'https://provider.example/docs' };
const encoder = new TextEncoder();

const responseFrom = (chunks, headers = { 'content-type': 'text/html' }, onCancel = () => {}, { keepOpen = false } = {}) => new Response(
  new ReadableStream({
    pull(controller) {
      if (chunks.length) controller.enqueue(chunks.shift());
      else if (!keepOpen) controller.close();
    },
    cancel: onCancel,
  }),
  { status: 200, headers }
);

test('the total deadline remains active while the response body stalls', async () => {
  let aborted = false;
  const fetchImpl = async (_url, { signal }) => new Response(new ReadableStream({
    start(controller) {
      const fallback = setTimeout(() => controller.close(), 200);
      signal.addEventListener('abort', () => {
        clearTimeout(fallback);
        aborted = true;
        controller.error(new DOMException('aborted', 'AbortError'));
      }, { once: true });
    },
  }), { status: 200, headers: { 'content-type': 'text/plain' } });

  const result = await fetchDocs(provider, { fetchImpl, timeoutMs: 10, maxBytes: 100 });
  assert.deepEqual(result, { status: 'fetch error: timeout', text: '' });
  assert.equal(aborted, true);
});

test('an oversized Content-Length is rejected before reading and cancels the body', async () => {
  let cancelled = false;
  const fetchImpl = async () => responseFrom([], {
    'content-type': 'text/plain',
    'content-length': '101',
  }, () => { cancelled = true; }, { keepOpen: true });

  const result = await fetchDocs(provider, { fetchImpl, maxBytes: 100 });
  assert.deepEqual(result, { status: 'fetch error: response exceeds 100-byte limit', text: '' });
  assert.equal(cancelled, true);
});

test('a streamed body without Content-Length is cancelled as soon as it crosses the byte cap', async () => {
  let cancelled = false;
  const fetchImpl = async () => responseFrom(
    [encoder.encode('1234'), encoder.encode('56')],
    { 'content-type': 'text/plain' },
    () => { cancelled = true; },
    { keepOpen: true }
  );

  const result = await fetchDocs(provider, { fetchImpl, maxBytes: 5 });
  assert.deepEqual(result, { status: 'fetch error: response exceeds 5-byte limit', text: '' });
  assert.equal(cancelled, true);
});

test('a legitimate bounded body is decoded across chunks and extracted as before', async () => {
  const encoded = encoder.encode('<p>Hello € &amp; friends</p>');
  const fetchImpl = async () => responseFrom(
    [encoded.slice(0, 10), encoded.slice(10, 12), encoded.slice(12)],
    { 'content-type': 'text/html', 'content-length': String(encoded.byteLength) }
  );

  const result = await fetchDocs(provider, { fetchImpl, maxBytes: encoded.byteLength });
  assert.deepEqual(result, { status: '200', text: 'Hello € & friends' });
});

test('fetchDocs passes the same byte cap and total deadline into the public transport', async () => {
  let options;
  const fetchImpl = async (_url, received) => {
    options = received;
    return responseFrom([encoder.encode('okay')], { 'content-type': 'text/plain' });
  };

  const result = await fetchDocs(provider, { fetchImpl, timeoutMs: 1234, maxBytes: 8 });
  assert.deepEqual(result, { status: '200', text: 'okay' });
  assert.equal(options.timeoutMs, 1234);
  assert.equal(options.maxBytes, 8);
});

test('a cancellation promise that never settles cannot hold fetchDocs open', { timeout: 500 }, async () => {
  let cancelled = false;
  const fetchImpl = async () => ({
    status: 413,
    ok: false,
    headers: new Headers({ 'content-type': 'text/plain' }),
    body: {
      cancel() {
        cancelled = true;
        return new Promise(() => {});
      },
    },
  });

  const fallback = new Promise((resolve) => setTimeout(() => resolve({ fallback: true }), 100));
  const result = await Promise.race([fetchDocs(provider, { fetchImpl }), fallback]);
  assert.deepEqual(result, { status: 'HTTP 413', text: '' });
  assert.equal(cancelled, true);
});
