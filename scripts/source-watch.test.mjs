// The weekly source-watch, with fixture pages and no network: statuses, the two-run rule for fetch errors, the issue body and what is
// done with the one tracking issue. The workflow itself is checked here too (schedule, permissions, no pull request code).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { htmlToText, sha256 } from './lib/page-text.mjs';
import { ISSUE_TITLE, FLAG_AFTER_RUNS, readAll, judge, parseState, buildReport, renderIssue, plan, fetchReason } from './lib/source-watch.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILLER = ' This paragraph is padding so that the page has enough text to count as a real page that was read.'.repeat(4);
const page = (body, lang = 'en') => `<!doctype html><html lang="${lang}"><head><title>T</title><script>var x = 1;</script></head><body><p>${body}</p><p>${FILLER}</p></body></html>`;

const A_HTML = page('Free tier: 1,000 requests per day. We do not train on your prompts.');
const B_HTML = page('Free tier: 500 requests per day.'); // the sentence quoted from B is gone
const C_HTML_OLD = page('Prompts are kept for 30 days.');
const C_HTML_NEW = page('Prompts are kept for 30 days. A new paragraph appeared.');
const entry = (id, url, text, html, extra = {}) => ({ id, slug: id.split('.')[0], kind: 'sentence', text, source_url: url, read_on: '2026-11-01', lang: 'en', method: 'html-text-v1', page_sha256: html ? sha256(htmlToText(html)) : undefined, ...extra });

const ENTRIES = [
  entry('alpha.sentence', 'https://a.example/terms', 'We do not train on your prompts.', A_HTML),
  entry('alpha.note_passage.1', 'https://a.example/terms', '1,000 requests per day', A_HTML, { kind: 'note_passage' }),
  entry('beta.sentence', 'https://b.example/limits', 'Free tier: 1,000 requests per day.', B_HTML),
  entry('gamma.sentence', 'https://c.example/privacy', 'Prompts are kept for 30 days.', C_HTML_OLD),
  entry('delta.sentence', 'https://d.example/policy', 'Anything.', null),
  entry('epsilon.sentence', 'https://e.example/gone', 'Anything.', null),
];
const READINGS = {
  'https://a.example/terms': { status: 200, html: A_HTML },
  'https://b.example/limits': { status: 200, html: B_HTML },
  'https://c.example/privacy': { status: 200, html: C_HTML_NEW },
  'https://d.example/policy': { status: 403 },
  'https://e.example/gone': { status: 404 },
};

async function run(entries = ENTRIES, readings = READINGS) {
  const calls = [];
  const pages = await readAll(entries, async (url, lang) => { calls.push({ url, lang }); return readings[url]; }, { delayMs: 0 });
  return { calls, rows: await judge(entries, pages) };
}

test('each page is read once, and every quote gets one of the four statuses', async () => {
  const { calls, rows } = await run();
  assert.equal(calls.length, 5, 'two quotes share a.example/terms: one request');
  const status = Object.fromEntries(rows.map((r) => [r.id, r.status]));
  assert.deepEqual(status, {
    'alpha.sentence': 'present', 'alpha.note_passage.1': 'present', 'beta.sentence': 'missing',
    'gamma.sentence': 'changed', 'delta.sentence': 'fetch_error', 'epsilon.sentence': 'fetch_error',
  });
  const d = rows.find((r) => r.id === 'delta.sentence');
  assert.equal(d.http, 403); assert.equal(d.reason, 'HTTP 403');
});

test('a page in another language, a page with no text and a network error are fetch errors with our own reason', async () => {
  const entries = [entry('x.sentence', 'https://x.example/', 'Hello.', null), entry('y.sentence', 'https://y.example/', 'Hello.', null), entry('z.sentence', 'https://z.example/', 'Hello.', null)];
  const { rows } = await run(entries, {
    'https://x.example/': { status: 200, html: page('Bonjour.', 'fr') },
    'https://y.example/': { status: 200, html: '<html><body><div id="app"></div></body></html>' },
    'https://z.example/': { error: 'connect ETIMEDOUT' },
  });
  assert.deepEqual(rows.map((r) => [r.status, r.reason]), [
    ['fetch_error', 'page came in another language'],
    ['fetch_error', 'too little text (a page that needs scripts, or a scanned PDF)'],
    ['fetch_error', 'error: connect ETIMEDOUT'],
  ]);
  assert.equal(fetchReason(undefined), 'not read');
});

test('requests are capped in concurrency and never run two at a time on the same host', async () => {
  const entries = [];
  for (const h of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']) for (const p of ['a', 'b', 'c']) entries.push(entry(`${h}.${p}`, `https://${h}.example/${p}`, 'x', null));
  let active = 0; let peak = 0; const perHost = new Map(); let hostClash = false;
  await readAll(entries, async (url) => {
    const host = new URL(url).host;
    active++; peak = Math.max(peak, active);
    if (perHost.get(host)) hostClash = true;
    perHost.set(host, true);
    await new Promise((r) => setTimeout(r, 2));
    perHost.set(host, false); active--;
    return { status: 200 };
  }, { concurrency: 3, delayMs: 0 });
  assert.ok(peak <= 3, `peak ${peak}`);
  assert.equal(hostClash, false);
  const waits = [];
  await readAll(entries.slice(0, 2), async () => ({ status: 200 }), { delayMs: 700, wait: async (ms) => { waits.push(ms); } });
  assert.deepEqual(waits, [700, 700], 'a pause before every request');
});

test('a 403 or 5xx is only flagged on the second run in a row; a 404 at once; a page read again drops out of the state', async () => {
  const { rows } = await run();
  const first = buildReport(rows, parseState(''), { ranAt: '2026-11-30T06:00:00Z' });
  assert.deepEqual(first.state.fetch_errors, { 'https://d.example/policy': 1, 'https://e.example/gone': 1 });
  assert.equal(first.results.find((r) => r.id === 'delta.sentence').flagged, false, 'first 403: a lead, not yet flagged');
  assert.equal(first.results.find((r) => r.id === 'epsilon.sentence').flagged, true, '404: the page is gone');
  assert.equal(first.summary.flagged_fetch_errors, 1);

  const second = buildReport(rows, parseState(renderIssue(first)), { ranAt: '2026-12-07T06:00:00Z' });
  const d = second.results.find((r) => r.id === 'delta.sentence');
  assert.equal(d.runs_in_a_row, FLAG_AFTER_RUNS); assert.equal(d.flagged, true);

  const recovered = { ...READINGS, 'https://d.example/policy': { status: 200, html: page('Anything.') } };
  const third = buildReport((await run(ENTRIES, recovered)).rows, second.state, { ranAt: '2026-12-14T06:00:00Z' });
  assert.deepEqual(third.state.fetch_errors, { 'https://e.example/gone': 3 });
});

test('the summary counts and "clean" means no missing quote and no flagged fetch error', async () => {
  const { rows } = await run();
  const report = buildReport(rows, null, { ranAt: '2026-11-30T06:00:00Z' });
  assert.deepEqual(report.summary, { present: 2, changed: 1, missing: 1, fetch_error: 2, total: 6, flagged_fetch_errors: 1, urls: 5 });
  assert.equal(report.clean, false);
  const onlyFirstRun403 = buildReport(rows.filter((r) => r.status !== 'missing' && r.id !== 'epsilon.sentence'), null, { ranAt: '2026-11-30T06:00:00Z' });
  assert.equal(onlyFirstRun403.clean, true, 'a first-run 403 alone does not keep the issue open');
});

test('the issue lists missing quotes per provider and flagged errors, with ids and URLs only, never page text', async () => {
  const { rows } = await run();
  const body = renderIssue(buildReport(rows, null, { ranAt: '2026-11-30T06:00:00Z', runUrl: 'https://github.com/o/r/actions/runs/1' }));
  assert.match(body, /## Missing quotes, per provider\n[\s\S]*### beta\n\n\| Quote id \| Kind \| Source \| Read on \|\n\|---\|---\|---\|---\|\n\| `beta\.sentence` \| sentence \| https:\/\/b\.example\/limits \| 2026-11-01 \|/);
  assert.match(body, /## Fetch errors to re-check[\s\S]*\| epsilon \| `epsilon\.sentence` \| https:\/\/e\.example\/gone \| HTTP 404 \| 1 \|/);
  assert.match(body, /1 fetch error on the first run \(not flagged yet\)<\/summary>\n\n- https:\/\/d\.example\/policy/);
  assert.match(body, /1 quote still present on a changed page[\s\S]*- gamma: `gamma\.sentence`/);
  assert.match(body, /\[workflow run\]\(https:\/\/github\.com\/o\/r\/actions\/runs\/1\)/);
  for (const text of ['500 requests', 'padding', 'A new paragraph', 'Free tier: 1,000']) assert.ok(!body.includes(text), `no page or quote text: ${text}`);
  assert.deepEqual(parseState(body).fetch_errors, { 'https://d.example/policy': 1, 'https://e.example/gone': 1 });
});

test('a clean run says so', async () => {
  const entries = ENTRIES.slice(0, 2);
  const body = renderIssue(buildReport((await run(entries)).rows, null, { ranAt: '2026-11-30T06:00:00Z' }));
  assert.match(body, /\*\*Everything is clean/);
  assert.doesNotMatch(body, /## Missing|## Fetch errors/);
});

test('a broken or hostile state comment is ignored rather than trusted', () => {
  assert.deepEqual(parseState('<!-- source-watch-state: {not json} -->').fetch_errors, {});
  assert.deepEqual(parseState('<!-- source-watch-state: {"fetch_errors":{"http://x/":2,"https://ok.example/":"2","https://y.example/":3}} -->').fetch_errors, { 'https://y.example/': 3 });
  assert.deepEqual(parseState(null).fetch_errors, {});
});

test('one issue for ever: created on the first run, reopened when needed, closed when clean', () => {
  const dirty = { clean: false }; const clean = { clean: true };
  assert.deepEqual(plan(null, dirty), { create: true, close: false });
  assert.deepEqual(plan(null, clean), { create: true, close: true }, 'created even when clean, so the state survives');
  assert.deepEqual(plan({ number: 9, state: 'OPEN' }, dirty), { edit: 9, reopen: false, close: false });
  assert.deepEqual(plan({ number: 9, state: 'OPEN' }, clean), { edit: 9, reopen: false, close: true });
  assert.deepEqual(plan({ number: 9, state: 'CLOSED' }, dirty), { edit: 9, reopen: true, close: false });
  assert.deepEqual(plan({ number: 9, state: 'CLOSED' }, clean), { edit: 9, reopen: false, close: false });
  assert.equal(ISSUE_TITLE, 'Source watch: quotes to re-check');
});

test('the workflow is weekly and dispatchable, least-privilege, reads main only and publishes through the script', () => {
  const wf = readFileSync(join(ROOT, '.github/workflows/source-watch.yml'), 'utf8').replace(/\r\n/g, '\n');
  assert.match(wf, /\non:\n {2}schedule:\n {4}- cron: '[^']+ \* \* 1'/, 'weekly, on Monday');
  assert.match(wf, /\n {2}workflow_dispatch: \{\}\n/);
  assert.doesNotMatch(wf, /pull_request|workflow_run|secrets\./, 'no pull request trigger and no secret');
  assert.match(wf, /\npermissions: \{\}\n/);
  assert.match(wf, /\n {4}permissions:\n {6}contents: read\n {6}issues: write\n/);
  assert.match(wf, /ref: main\n {10}persist-credentials: false/);
  assert.match(wf, /github\.repository == 'pacocartones\/free-llm-api-hub' && github\.ref == 'refs\/heads\/main'/);
  assert.match(wf, /node --test scripts\/source-watch\.test\.mjs/);
  assert.match(wf, /node scripts\/source-watch\.mjs --publish --json /);
});
