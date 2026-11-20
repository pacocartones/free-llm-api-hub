import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readBoundedJson, readBoundedText, ResponseTooLargeError } from './lib/bounded-read.mjs';
import { getJson, sample } from './fetch-models.mjs';

const chunked = (chunks, headers = {}) => new Response(new ReadableStream({
  start(controller) {
    for (const c of chunks) controller.enqueue(new TextEncoder().encode(c));
    controller.close();
  },
}), { status: 200, headers });

test('readBoundedJson parses a body within the limit', async () => {
  assert.deepEqual(await readBoundedJson(chunked(['{"data":', '[1,2]}']), 64), { data: [1, 2] });
});

test('readBoundedText rejects a declared Content-Length above the limit before reading', async () => {
  const res = chunked(['x'], { 'content-length': '999' });
  await assert.rejects(readBoundedText(res, 10), ResponseTooLargeError);
});

test('readBoundedText stops once streamed bytes exceed the limit', async () => {
  await assert.rejects(readBoundedText(chunked(['12345', '67890', 'X']), 10), ResponseTooLargeError);
});

test('readBoundedText compares a huge declared Content-Length exactly', async () => {
  const res = chunked(['x'], { 'content-length': '99999999999999999999' });
  await assert.rejects(readBoundedText(res, 10), ResponseTooLargeError);
});

test('readBoundedText reads a missing body as empty unless a body is required', async () => {
  const empty = { headers: new Headers(), body: null };
  assert.equal(await readBoundedText(empty, 10), '');
  await assert.rejects(readBoundedText(empty, 10, { requireBody: true }), /not a readable stream/);
});

test('the source checker and the re-verification fetcher use the shared bounded reader', async () => {
  const { readFileSync } = await import('node:fs');
  for (const rel of ['./lib/check-sources.mjs', './lib/reverify-fetch.mjs', './fetch-models.mjs', './discover.mjs']) {
    const src = readFileSync(new URL(rel, import.meta.url), 'utf8');
    assert.match(src, /from '\.\/(?:lib\/)?bounded-read\.mjs'/, `${rel} imports the shared reader`);
    assert.doesNotMatch(src, /getReader\(\)/, `${rel} has no private streaming reader`);
  }
});

test('keyed catalogue requests refuse redirects; public ones follow them', async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push(init.redirect);
    return Response.json({ data: [] });
  };
  await getJson('https://api.example.test/v1/models', { Authorization: 'Bearer synthetic' }, { fetchImpl });
  await getJson('https://api.example.test/v1/models', undefined, { fetchImpl });
  assert.deepEqual(seen, ['error', 'follow']);
});

test('an oversized catalogue is reported as a fetch failure, not parsed', async () => {
  const fetchImpl = async () => new Response('{}', { status: 200, headers: { 'content-length': String(64 * 1024 * 1024) } });
  await assert.rejects(getJson('https://api.example.test/v1/models', undefined, { fetchImpl }), /response too large/);
});

test('with more publishers than slots, the largest publisher catalogues are sampled first', () => {
  const ids = [
    'aaa/one', 'bbb/one', 'ccc/one', 'ddd/one', 'eee/one', 'fff/one', 'ggg/one', 'hhh/one',
    'meta/llama-a', 'meta/llama-b', 'meta/llama-c',
    'nvidia/nemotron-a', 'nvidia/nemotron-b', 'nvidia/nemotron-c', 'nvidia/nemotron-d',
    'qwen/qwen-a', 'qwen/qwen-b',
  ];
  const out = sample(ids);
  assert.equal(out.length, 8);
  for (const big of ['meta/', 'nvidia/', 'qwen/']) {
    assert.ok(out.some((id) => id.startsWith(big)), `${big} is represented`);
  }
  assert.deepEqual(sample([...ids].reverse()), out, 'input order does not change the sample');
});
