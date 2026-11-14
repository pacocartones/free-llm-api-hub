import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import * as publicFetch from './lib/public-fetch.mjs';

const { createPublicLookup, isPublicAddress, publicHttpsUrlError, resolvePublicRedirect } = publicFetch;

const responseStream = ({ status = 200, headers = {}, chunks = [], end = true } = {}) => {
  const response = new PassThrough();
  response.statusCode = status;
  response.headers = headers;
  queueMicrotask(() => {
    for (const chunk of chunks) response.write(chunk);
    if (end) response.end();
  });
  return response;
};

const queuedRequest = (responses, calls) => (url, options, callback) => {
  const request = new EventEmitter();
  let activeResponse;
  request.destroyed = false;
  request.end = () => queueMicrotask(() => {
    activeResponse = responses.shift();
    callback(activeResponse);
  });
  request.destroy = (error) => {
    if (request.destroyed) return;
    request.destroyed = true;
    activeResponse?.destroy(error);
    if (error) queueMicrotask(() => request.emit('error', error));
  };
  options.signal?.addEventListener('abort', () => request.destroy(options.signal.reason), { once: true });
  calls.push({ url, options, request });
  return request;
};

test('public URL policy rejects private, metadata and disguised addresses while preserving public HTTPS documentation', () => {
  for (const url of [
    'http://docs.example.com/pricing',
    'https://user:password@docs.example.com/pricing',
    'https://localhost/admin',
    'https://127.0.0.1/admin',
    'https://127.1/admin',
    'https://0x7f000001/admin',
    'https://2130706433/admin',
    'https://10.0.0.1/admin',
    'https://168.63.129.16/machine',
    'https://169.254.169.254/latest/meta-data',
    'https://metadata.google.internal/computeMetadata/v1',
    'https://[::1]/admin',
    'https://[::ffff:7f00:1]/admin',
  ]) assert.ok(publicHttpsUrlError(url), url);
  assert.equal(publicHttpsUrlError('https://docs.example.com/pricing?plan=free'), null);
  assert.equal(publicHttpsUrlError('https://8.8.8.8/'), null);
});

test('address policy covers private IPv4 and IPv6 ranges without rejecting public unicast addresses', () => {
  for (const address of ['0.0.0.0', '10.1.2.3', '100.64.0.1', '172.31.1.2', '192.168.1.2', '224.0.0.1', '::', '::1', 'fc00::1', 'fe80::1', 'ff02::1', '::ffff:10.0.0.1', '2002:0a00:0001::']) {
    assert.equal(isPublicAddress(address), false, address);
  }
  for (const address of ['93.184.216.34', '2606:4700:4700::1111', '::ffff:5db8:d822']) {
    assert.equal(isPublicAddress(address), true, address);
  }
});

const lookupOnce = (lookup, hostname = 'docs.example.com') => new Promise((resolve, reject) => {
  lookup(hostname, {}, (error, address, family) => error ? reject(error) : resolve({ address, family }));
});

test('socket lookup checks every answer and rechecks changed DNS results before connection', async () => {
  const mixed = createPublicLookup((_hostname, options, callback) => {
    assert.equal(options.all, true);
    callback(null, [{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.7', family: 4 }]);
  });
  await assert.rejects(lookupOnce(mixed), /non-public address 10\.0\.0\.7/);

  let call = 0;
  const changed = createPublicLookup((_hostname, _options, callback) => {
    call++;
    callback(null, [{ address: call === 1 ? '93.184.216.34' : '169.254.169.254', family: 4 }]);
  });
  assert.deepEqual(await lookupOnce(changed), { address: '93.184.216.34', family: 4 });
  await assert.rejects(lookupOnce(changed), /non-public address 169\.254\.169\.254/);
});

test('redirect policy allows public HTTPS hops and rejects downgrade or private destinations', () => {
  assert.equal(resolvePublicRedirect('https://docs.example.com/start', '/pricing').href, 'https://docs.example.com/pricing');
  assert.equal(resolvePublicRedirect('https://docs.example.com/start', 'https://cdn.example.net/pricing').href, 'https://cdn.example.net/pricing');
  assert.throws(() => resolvePublicRedirect('https://docs.example.com/start', 'http://docs.example.com/pricing'), /must use HTTPS/);
  assert.throws(() => resolvePublicRedirect('https://docs.example.com/start', 'https://127.0.0.1/admin'), /non-public IP/);
});

test('transport uses its owned direct agent and the validated lookup for the socket', async () => {
  assert.equal(typeof publicFetch.createPublicFetch, 'function');
  const calls = [];
  const directAgent = {};
  const resolver = (_hostname, options, callback) => {
    assert.equal(options.all, true);
    callback(null, [{ address: '93.184.216.34', family: 4 }]);
  };
  const fetchImpl = publicFetch.createPublicFetch({
    requestImpl: queuedRequest([
      responseStream({ headers: { 'content-type': 'text/plain' }, chunks: ['hello'] }),
    ], calls),
    resolver,
    agent: directAgent,
  });

  const response = await fetchImpl('https://docs.example.com/readme');
  assert.equal(await response.text(), 'hello');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.agent, directAgent);
  assert.equal(typeof calls[0].options.lookup, 'function');
  assert.deepEqual(await lookupOnce(calls[0].options.lookup), { address: '93.184.216.34', family: 4 });
});

test('a rejected redirect destroys its still-open response before returning the error', async () => {
  const calls = [];
  const redirect = responseStream({
    status: 302,
    headers: { location: 'https://127.0.0.1/admin' },
    end: false,
  });
  const fetchImpl = publicFetch.createPublicFetch({
    requestImpl: queuedRequest([redirect], calls),
    resolver: (_hostname, _options, callback) => callback(null, [{ address: '93.184.216.34', family: 4 }]),
    agent: {},
  });

  await assert.rejects(fetchImpl('https://docs.example.com/start'), /non-public IP/);
  assert.equal(redirect.destroyed, true);
  assert.equal(calls.length, 1);
});

test('a streamed body is destroyed and rejected at the first byte over the cap', async () => {
  const calls = [];
  const source = responseStream({
    headers: { 'content-type': 'text/plain' },
    chunks: [Buffer.from('1234'), Buffer.from('56')],
  });
  const fetchImpl = publicFetch.createPublicFetch({
    requestImpl: queuedRequest([source], calls),
    resolver: (_hostname, _options, callback) => callback(null, [{ address: '93.184.216.34', family: 4 }]),
    agent: {},
  });

  const response = await fetchImpl('https://docs.example.com/readme', { maxBytes: 5 });
  await assert.rejects(response.text(), /exceeds 5-byte limit/);
  assert.equal(source.destroyed, true);
});

test('an oversized Content-Length is rejected before reading and destroys the body', async () => {
  const calls = [];
  const source = responseStream({
    headers: { 'content-type': 'text/plain', 'content-length': '6' },
    end: false,
  });
  const fetchImpl = publicFetch.createPublicFetch({
    requestImpl: queuedRequest([source], calls),
    resolver: (_hostname, _options, callback) => callback(null, [{ address: '93.184.216.34', family: 4 }]),
    agent: {},
  });

  await assert.rejects(
    fetchImpl('https://docs.example.com/readme', { maxBytes: 5 }),
    /exceeds 5-byte limit/
  );
  assert.equal(source.destroyed, true);
});

test('a compressed response is rejected explicitly and destroyed instead of decoded without a cap', async () => {
  const calls = [];
  const source = responseStream({
    headers: { 'content-type': 'text/plain', 'content-encoding': 'gzip' },
    end: false,
  });
  const fetchImpl = publicFetch.createPublicFetch({
    requestImpl: queuedRequest([source], calls),
    resolver: (_hostname, _options, callback) => callback(null, [{ address: '93.184.216.34', family: 4 }]),
    agent: {},
  });

  await assert.rejects(fetchImpl('https://docs.example.com/readme'), /unsupported Content-Encoding: gzip/);
  assert.equal(source.destroyed, true);
  assert.equal(calls[0].options.headers['accept-encoding'], 'identity');
});

test('callers cannot opt the bounded transport into compressed representations', async () => {
  let requested = false;
  const fetchImpl = publicFetch.createPublicFetch({
    requestImpl() { requested = true; throw new Error('request must not start'); },
    resolver: (_hostname, _options, callback) => callback(null, [{ address: '93.184.216.34', family: 4 }]),
    agent: {},
  });

  await assert.rejects(
    fetchImpl('https://docs.example.com/readme', { headers: { 'Accept-Encoding': 'gzip' } }),
    /Accept-Encoding must be identity/
  );
  assert.equal(requested, false);
});

test('one total deadline remains active while the final response body stalls', { timeout: 500 }, async () => {
  const calls = [];
  const source = responseStream({ headers: { 'content-type': 'text/plain' }, end: false });
  const fetchImpl = publicFetch.createPublicFetch({
    requestImpl: queuedRequest([source], calls),
    resolver: (_hostname, _options, callback) => callback(null, [{ address: '93.184.216.34', family: 4 }]),
    agent: {},
  });

  const response = await fetchImpl('https://docs.example.com/readme', { timeoutMs: 10 });
  const fallback = setTimeout(() => source.destroy(new Error('test fallback: deadline did not fire')), 100);
  await assert.rejects(response.text(), (error) => error?.name === 'TimeoutError');
  clearTimeout(fallback);
  assert.equal(source.destroyed, true);
  assert.equal(calls[0].request.destroyed, true);
});

test('a legitimate UTF-8 body exactly at the cap survives split code points', async () => {
  const calls = [];
  const encoded = new TextEncoder().encode('Hello €');
  const source = responseStream({
    headers: { 'content-type': 'text/plain', 'content-length': String(encoded.byteLength) },
    chunks: [encoded.slice(0, 7), encoded.slice(7, 8), encoded.slice(8)],
  });
  const fetchImpl = publicFetch.createPublicFetch({
    requestImpl: queuedRequest([source], calls),
    resolver: (_hostname, _options, callback) => callback(null, [{ address: '93.184.216.34', family: 4 }]),
    agent: {},
  });

  const response = await fetchImpl('https://docs.example.com/readme', { maxBytes: encoded.byteLength });
  assert.equal(await response.text(), 'Hello €');
});

test('cancelling the exposed body destroys the live response', async () => {
  const calls = [];
  const source = responseStream({ headers: { 'content-type': 'text/plain' }, end: false });
  const fetchImpl = publicFetch.createPublicFetch({
    requestImpl: queuedRequest([source], calls),
    resolver: (_hostname, _options, callback) => callback(null, [{ address: '93.184.216.34', family: 4 }]),
    agent: {},
  });

  const response = await fetchImpl('https://docs.example.com/readme');
  await response.body.cancel('not needed');
  assert.equal(source.destroyed, true);
});

test('a public redirect destroys the prior body and keeps one deadline for the final hop', { timeout: 500 }, async () => {
  const calls = [];
  const redirect = responseStream({ status: 302, headers: { location: '/final' }, end: false });
  const final = responseStream({ headers: { 'content-type': 'text/plain' }, end: false });
  const fetchImpl = publicFetch.createPublicFetch({
    requestImpl: queuedRequest([redirect, final], calls),
    resolver: (_hostname, _options, callback) => callback(null, [{ address: '93.184.216.34', family: 4 }]),
    agent: {},
  });

  const response = await fetchImpl('https://docs.example.com/start', { timeoutMs: 10 });
  await assert.rejects(response.text(), (error) => error?.name === 'TimeoutError');
  assert.equal(redirect.destroyed, true);
  assert.equal(final.destroyed, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url.href, 'https://docs.example.com/final');
});
