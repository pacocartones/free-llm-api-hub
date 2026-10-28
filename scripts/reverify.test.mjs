import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script, createContext } from 'node:vm';
import { SLA_DAYS, ageInDays } from './lib/rules.mjs';
import { weeklyPacing, weeklyBatch } from './lib/pacing.mjs';

// Run the CLI itself with its imports supplied by the harness. Nothing touches
// providers.json, the real clock, the output directory, or a provider's network.
const source = readFileSync(new URL('./reverify.mjs', import.meta.url), 'utf8');
const imports = [...source.matchAll(/^import .+ from '([^']+)';$/gm)].map((m) => m[1]);
assert.deepEqual(imports, ['node:fs', 'node:path', 'node:url', './lib/rules.mjs', './lib/pacing.mjs']);
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

async function run({ providers = fixture(), args = [], response = {}, fetchError } = {}) {
  const logs = [], writes = [], requests = [], dirs = [], timers = [];
  let cleared = 0;
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [NOW.getTime()])); }
    static now() { return NOW.getTime(); }
  }
  const exit = {};
  const context = createContext({
    Date: FixedDate, SLA_DAYS, ageInDays: (date, now = NOW) => ageInDays(date, now),
    weeklyPacing, weeklyBatch,
    dirname: () => '/fixture/scripts', join: (...parts) => parts.join('/'), fileURLToPath: () => '/fixture/scripts/reverify.mjs',
    readFileSync: (path, encoding) => {
      assert.equal(path, '/fixture/scripts/../data/providers.json');
      assert.equal(encoding, 'utf8');
      return JSON.stringify({ providers });
    },
    mkdirSync: (...args) => dirs.push(args),
    writeFileSync: (path, text) => writes.push({ path, text }),
    process: { argv: ['node', 'reverify.mjs', ...args], exit: (code) => { assert.equal(code, 0); throw exit; } },
    console: { log: (line) => logs.push(line) },
    AbortController,
    setTimeout: (fn, delay) => { assert.equal(delay, 20000); timers.push(fn); return timers.length; },
    clearTimeout: () => { cleared++; },
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (fetchError) throw fetchError;
      return {
        ok: response.ok ?? true, status: response.status ?? 200,
        headers: { get: () => response.contentType ?? 'text/html' },
        text: async () => response.body ?? '<p>Free API</p>',
      };
    },
  });
  try { await script.runInContext(context, { timeout: 1000 }); }
  catch (error) { if (error !== exit) throw error; }
  const selected = logs.filter((line) => line.startsWith('- ')).map((line) => line.match(/\(([^)]+)\)/)[1]);
  return { logs, writes, requests, dirs, timers, cleared, selected };
}

test('fixed-date automatic batch selects the oldest eligible providers in order', async () => {
  const result = await run();
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
  const result = await run({ args: ['--batch', '3'] });
  assert.deepEqual(result.selected, ['oldest', 'due', 'middle']);
  assert.equal(result.writes.length, 3);
});

test('--batch can include fresh entries and cannot exceed the verified dataset', async () => {
  const result = await run({ args: ['--batch', '20'] });
  assert.deepEqual(result.selected, ['oldest', 'due', 'middle', 'fresh']);
});

test('--no-fetch prints the chosen batch without fetching or writing directories/files', async () => {
  const result = await run({ args: ['--batch', '1', '--no-fetch'] });
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
  const p = provider('oldest', '2026-07-01', { data_policy: { trains_on_prompts: false, retention: '30 days', source: 'https://oldest.invalid/privacy', checked: '2026-07-01' } });
  const result = await run({ providers: [p], response: { body: '<script >hidden()</script><style>x{}</style><p>Free &amp;amp; safe&nbsp;API</p>' } });
  assert.equal(result.writes[0].path, '/fixture/scripts/../.freebuff/reverify/oldest.md');
  assert.match(result.writes[0].text, /fetched 2026-10-28/);
  assert.match(result.writes[0].text, /fetch status: 200/);
  assert.match(result.writes[0].text, /trains_on_prompts=false retention=30 days/);
  assert.match(result.writes[0].text, /Free &amp; safe API/);
  assert.doesNotMatch(result.writes[0].text, /hidden\(\)|x\{\}/);
  assert.equal(result.cleared, 1);
});

test('HTTP failure writes an honest empty dossier instead of success text', async () => {
  const result = await run({ args: ['--batch', '1'], response: { ok: false, status: 503 } });
  assert.match(result.writes[0].text, /fetch status: HTTP 503/);
  assert.match(result.writes[0].text, /nothing extracted/);
});

test('timeout and network errors are captured in the dossier', async () => {
  for (const [fetchError, expected] of [[{ name: 'AbortError' }, /fetch error: timeout/], [new Error('offline'), /fetch error: offline/]]) {
    const result = await run({ args: ['--batch', '1'], fetchError });
    assert.match(result.writes[0].text, expected);
  }
});

test('non-text responses are marked for manual review, long text is capped', async () => {
  const binary = await run({ args: ['--batch', '1'], response: { contentType: 'application/pdf' } });
  assert.match(binary.writes[0].text, /non-text body/);
  const long = await run({ args: ['--batch', '1'], response: { body: 'x'.repeat(6005) } });
  assert.match(long.writes[0].text, new RegExp('x{6000}…'));
  assert.doesNotMatch(long.writes[0].text, /x{6001}/);
});
