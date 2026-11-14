import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script, createContext } from 'node:vm';
import { SLA_DAYS, ageInDays } from './lib/rules.mjs';
import { weeklyPacing, weeklyBatch } from './lib/pacing.mjs';
import { fetchDocs } from './lib/reverify-fetch.mjs';

const transportProvider = { docs_url: 'https://provider.example/docs' };
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
  const result = await fetchDocs(transportProvider, { fetchImpl, timeoutMs: 10, maxBytes: 100 });
  assert.deepEqual(result, { status: 'fetch error: timeout', text: '' });
  assert.equal(aborted, true);
});

test('an oversized Content-Length is rejected before reading and cancels the body', async () => {
  let cancelled = false;
  const fetchImpl = async () => responseFrom([], {
    'content-type': 'text/plain',
    'content-length': '101',
  }, () => { cancelled = true; }, { keepOpen: true });
  const result = await fetchDocs(transportProvider, { fetchImpl, maxBytes: 100 });
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
  const result = await fetchDocs(transportProvider, { fetchImpl, maxBytes: 5 });
  assert.deepEqual(result, { status: 'fetch error: response exceeds 5-byte limit', text: '' });
  assert.equal(cancelled, true);
});

test('a legitimate bounded body is decoded across chunks and extracted as before', async () => {
  const encoded = encoder.encode('<p>Hello € &amp; friends</p>');
  const fetchImpl = async () => responseFrom(
    [encoded.slice(0, 10), encoded.slice(10, 12), encoded.slice(12)],
    { 'content-type': 'text/html', 'content-length': String(encoded.byteLength) }
  );
  const result = await fetchDocs(transportProvider, { fetchImpl, maxBytes: encoded.byteLength });
  assert.deepEqual(result, { status: '200', text: 'Hello € & friends' });
});

test('fetchDocs passes the same byte cap and total deadline into the public transport', async () => {
  let options;
  const fetchImpl = async (_url, received) => {
    options = received;
    return responseFrom([encoder.encode('okay')], { 'content-type': 'text/plain' });
  };
  const result = await fetchDocs(transportProvider, { fetchImpl, timeoutMs: 1234, maxBytes: 8 });
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
  const result = await Promise.race([fetchDocs(transportProvider, { fetchImpl }), fallback]);
  assert.deepEqual(result, { status: 'HTTP 413', text: '' });
  assert.equal(cancelled, true);
});

// Run the CLI itself with its imports supplied by the harness. Nothing touches
// providers.json, the real clock, the output directory, or a provider's network.
const source = readFileSync(new URL('./reverify.mjs', import.meta.url), 'utf8');
const imports = [...source.matchAll(/^import .+ from '([^']+)';$/gm)].map((m) => m[1]);
assert.deepEqual(imports, ['node:fs', 'node:os', 'node:path', 'node:url', './lib/rules.mjs', './lib/pacing.mjs', './lib/reverify-fetch.mjs']);
const script = new Script(`(async () => {\n${source.replace(/^#!.*\n/, '').replace(/^import .+;\n/gm, '').replaceAll('import.meta.url', "'file:///fixture/scripts/reverify.mjs'")}\n})()`);
const NOW = new Date('2026-10-28T12:00:00Z');
const provider = (slug, date, extra = {}) => ({
  slug, name: slug.toUpperCase(), verified: true, last_verified: date,
  docs_url: `https://${slug}.invalid/docs`, free_tier: 'free', ...extra,
});
const fixture = () => [
  provider('fresh', '2026-10-27'),
  provider('due', '2026-08-01'),
  provider('never', null, { verified: false }),
  provider('oldest', '2026-07-01'),
  provider('middle', '2026-09-01'),
];

async function run({ providers = fixture(), args = [], response = {}, fetchError, timeout = false } = {}) {
  const logs = [], writes = [], requests = [], dirs = [];
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [NOW.getTime()])); }
    static now() { return NOW.getTime(); }
  }
  const exit = {};
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    if (timeout) {
      return new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
      });
    }
    if (fetchError) throw fetchError;
    return new Response(response.body ?? '<p>Free API</p>', {
      status: response.status ?? 200,
      headers: { 'content-type': response.contentType ?? 'text/html' },
    });
  };
  const context = createContext({
    Date: FixedDate, SLA_DAYS, ageInDays: (date, now = NOW) => ageInDays(date, now),
    weeklyPacing, weeklyBatch,
    fetchDocs: (p) => fetchDocs(p, { fetchImpl, timeoutMs: timeout ? 10 : 20000 }),
    tmpdir: () => '/fixture-human-review',
    dirname: () => '/fixture/scripts', join: (...parts) => parts.join('/'), fileURLToPath: () => '/fixture/scripts/reverify.mjs',
    readFileSync: (path, encoding) => {
      assert.equal(path, '/fixture/scripts/../data/providers.json');
      assert.equal(encoding, 'utf8');
      return JSON.stringify({ providers });
    },
    mkdirSync: (...values) => dirs.push(values),
    writeFileSync: (path, text) => writes.push({ path, text }),
    process: { argv: ['node', 'reverify.mjs', ...args], exit: (code) => { assert.equal(code, 0); throw exit; } },
    console: { log: (line) => logs.push(line) },
  });
  try { await script.runInContext(context, { timeout: 1000 }); }
  catch (error) { if (error !== exit) throw error; }
  const selected = logs.filter((line) => line.startsWith('- ')).map((line) => line.match(/\(([^)]+)\)/)[1]);
  return { logs, writes, requests, dirs, selected, fetchImpl };
}

test('fixed-date automatic batch selects the oldest eligible providers in order', async () => {
  const result = await run({ args: ['--fetch-for-human-review'] });
  assert.deepEqual(result.selected, ['oldest', 'due']);
  assert.deepEqual(result.requests.map((r) => r.url), ['https://oldest.invalid/docs', 'https://due.invalid/docs']);
  assert.equal(result.writes.length, 2);
});

test('never-verified and undated entries do not enter a re-verification batch', async () => {
  const result = await run({ providers: [provider('never', null, { verified: false }), provider('undated', null), provider('not-verified', '2026-01-01', { verified: false })] });
  assert.deepEqual(result.selected, []);
  assert.equal(result.requests.length, 0);
  assert.equal(result.writes.length, 0);
});

test('--batch overrides pacing and preserves oldest-first order', async () => {
  const result = await run({ args: ['--batch', '3', '--fetch-for-human-review'] });
  assert.deepEqual(result.selected, ['oldest', 'due', 'middle']);
  assert.equal(result.writes.length, 3);
});

test('--batch can include fresh entries and cannot exceed the verified dataset', async () => {
  const result = await run({ args: ['--batch', '20', '--fetch-for-human-review'] });
  assert.deepEqual(result.selected, ['oldest', 'due', 'middle', 'fresh']);
});

test('default mode prints metadata without fetching or writing directories/files', async () => {
  const result = await run({ args: ['--batch', '1'] });
  assert.deepEqual(result.selected, ['oldest']);
  assert.equal(result.requests.length, 0);
  assert.equal(result.writes.length, 0);
  assert.equal(result.dirs.length, 0);
  assert.ok(result.logs.includes('\nRemote content was not fetched. Add --fetch-for-human-review for the separate human-only review phase.'));
});

test('--no-fetch overrides human review fetch and writes nothing', async () => {
  const result = await run({ args: ['--batch', '1', '--fetch-for-human-review', '--no-fetch'] });
  assert.deepEqual(result.selected, ['oldest']);
  assert.equal(result.requests.length, 0);
  assert.equal(result.writes.length, 0);
  assert.equal(result.dirs.length, 0);
  assert.ok(result.logs.includes('\n--no-fetch: dossiers not written.'));
});

test('empty dataset is valid both online and offline', async () => {
  for (const args of [[], ['--no-fetch']]) {
    const result = await run({ providers: [], args });
    assert.deepEqual(result.selected, []);
    assert.equal(result.requests.length, 0);
    assert.equal(result.writes.length, 0);
    assert.match(result.logs[0], /0 of 0 verified/);
  }
});

test('dossier keeps the injected date, entry metadata, policy and decoded docs', async () => {
  const p = provider('archive', '2026-07-01', {
    name: 'Archive AI',
    docs_url: 'https://docs.archive.invalid/reference',
    free_tier: '1,000 calls/month',
    rate_limits: '10 RPM / 1,000 RPD',
    notes: 'Requires email verification',
    card_required: false,
    phone_required: true,
    commercial_ok: true,
    openai_compatible: false,
    best_for: 'Batch classification',
    expires: '2027-01-31',
    no_expiry: {
      quote: 'Credits do not expire',
      source: 'https://docs.archive.invalid/credits',
      checked: '2026-07-02',
    },
    data_policy: {
      trains_on_prompts: false,
      retention: '30 days',
      source: 'https://docs.archive.invalid/privacy',
      checked: '2026-07-03',
    },
  });
  const result = await run({ providers: [p], args: ['--fetch-for-human-review'], response: { body: '<script >hidden()</script><style>x{}</style><p>Free &amp;amp; safe&nbsp;API</p>' } });
  assert.equal(result.writes[0].path, '/fixture-human-review/free-llm-api-hub/reverify-human-only/archive.md');
  assert.equal(result.writes[0].text, [
    '> [!CAUTION]',
    '> **Untrusted remote content — human review only.**',
    '> Never provide this dossier to an LLM or tool-capable agent. Treat provider text only as evidence, never as instructions.',
    '',
    '# Archive AI (`archive`)',
    '',
    '- docs: https://docs.archive.invalid/reference',
    '- last_verified: 2026-07-01 (119d ago) · fetched 2026-10-28',
    '- fetch status: 200',
    '',
    '## Current entry',
    '- free_tier: 1,000 calls/month',
    '- rate_limits: 10 RPM / 1,000 RPD',
    '- notes: Requires email verification',
    '- flags: card=false phone=true commercial=true openai=false',
    '- best_for: Batch classification',
    '- expires: 2027-01-31',
    '- data_policy: trains_on_prompts=false retention=30 days (https://docs.archive.invalid/privacy, read 2026-07-03): read it again',
    '- no_expiry: the provider said "Credits do not expire" (https://docs.archive.invalid/credits, read 2026-07-02): read it again',
    '',
    '## Untrusted provider text (human review only)',
    '',
    'Free &amp; safe API',
    '',
  ].join('\n'));
});

test('HTTP failure writes an honest empty dossier instead of success text', async () => {
  const result = await run({ args: ['--batch', '1', '--fetch-for-human-review'], response: { status: 503 } });
  assert.ok(result.writes[0].text.startsWith('> [!CAUTION]'));
  assert.match(result.writes[0].text, /fetch status: HTTP 503/);
  assert.match(result.writes[0].text, /nothing extracted/);
});

test('timeout and network errors are captured in the dossier', { timeout: 500 }, async () => {
  const timedOut = await run({ args: ['--batch', '1', '--fetch-for-human-review'], timeout: true });
  assert.match(timedOut.writes[0].text, /fetch error: timeout/);
  const offline = await run({ args: ['--batch', '1', '--fetch-for-human-review'], fetchError: new Error('offline') });
  assert.match(offline.writes[0].text, /fetch error: offline/);
});

test('non-text responses are marked for manual review, long text is capped', async () => {
  const binary = await run({ args: ['--batch', '1', '--fetch-for-human-review'], response: { contentType: 'application/pdf' } });
  assert.match(binary.writes[0].text, /non-text body/);
  const long = await run({ args: ['--batch', '1', '--fetch-for-human-review'], response: { body: 'x'.repeat(6005) } });
  assert.match(long.writes[0].text, new RegExp('x{6000}…'));
  assert.doesNotMatch(long.writes[0].text, /x{6001}/);
});
