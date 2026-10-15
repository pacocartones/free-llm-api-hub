import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { verifyEntries, buildReport, reportErrors, reportAge, quotesReportHtml, AMBER_DAYS, RED_DAYS, PERSISTENT_RUNS, RESULTS } from './lib/quotes-report.mjs';
import { METHOD, READ_HEADERS, htmlToText, sha256 } from './lib/page-text.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const filler = 'filler words so that the page has some text. '.repeat(10);
const page = (lang, body) => `<html${lang ? ` lang="${lang}"` : ''}><body><p>${body}</p><p>${filler}</p></body></html>`;
const entry = (id, text, url = 'https://a.example/x', extra = {}) => ({ id, slug: id.split('.')[0], kind: 'sentence', text, source_url: url, read_on: '2026-10-01', lang: 'en', method: METHOD, page_sha256: null, ...extra });

test('verifyEntries: the four results, a page read once for many entries, and the hash only as "the page moved"', async () => {
  const pages = {
    'https://a.example/x': { status: 200, html: page('en', 'We do not train on your content. Another sentence.') },
    'https://b.example/x': { status: 200, html: page('en', 'Now it says something else.') },
    'https://c.example/x': { status: 403, html: 'Just a moment...' },
    'https://d.example/x': { status: 200, html: page('es-419', 'Ahora dice otra cosa.') },
    'https://e.example/x': { error: 'ECONNRESET' },
  };
  const reads = []; const readPage = async (u) => { reads.push(u); return pages[u]; };
  const sha = sha256(htmlToText(pages['https://a.example/x'].html));
  const entries = [
    entry('ok.sentence', 'We do not train on your content.', 'https://a.example/x', { page_sha256: sha }),
    entry('ok2.note_passage.1', 'Another sentence.', 'https://a.example/x', { page_sha256: 'f'.repeat(64) }),
    entry('gone.sentence', 'We do not train on your content.', 'https://b.example/x'),
    entry('blocked.sentence', 'x', 'https://c.example/x'),
    entry('spanish.sentence', 'We do not train on your content.', 'https://d.example/x'),
    entry('down.sentence', 'x', 'https://e.example/x'),
  ];
  const r = Object.fromEntries((await verifyEntries(entries, readPage)).map((x) => [x.id, x]));
  assert.deepEqual(['ok', 'ok', 'expired', 'unreachable', 'other_language', 'unreachable'], entries.map((e) => r[e.id].result));
  assert.equal(r['ok.sentence'].page_changed, false); assert.equal(r['ok2.note_passage.1'].page_changed, true, 'a different hash only says the page moved');
  assert.equal(r['blocked.sentence'].page_changed, null);
  assert.equal(reads.filter((u) => u === 'https://a.example/x').length, 1, 'one request for two entries of the same page');
});
test('verifyEntries: an absence check holds only while the four words stay at zero in a page that was really read', async () => {
  const mk = (html, status = 200) => async () => ({ status, html });
  const abs = { id: 'x.absence_check', slug: 'x', kind: 'absence_check', terms: ['free', 'trial', 'paid', 'plan'], hits: { free: 0, trial: 0, paid: 0, plan: 0 }, source_url: 'https://a.example/x', read_on: '2026-10-01', lang: 'en', method: METHOD, page_sha256: 'a'.repeat(64) };
  assert.equal((await verifyEntries([abs], mk(page('en', 'Nothing about money here'))))[0].result, 'ok');
  assert.equal((await verifyEntries([abs], mk(page('en', 'Now there is a free plan'))))[0].result, 'expired', 'the claim no longer holds');
  assert.equal((await verifyEntries([abs], mk('blocked', 403)))[0].result, 'unreachable', 'an unread page proves nothing, in either direction');
  assert.equal((await verifyEntries([abs], mk(page('es', 'Nada'))))[0].result, 'other_language');
});
test('verifyEntries against a real HTTP server on this machine: the language header is sent and a Spanish answer is not "expired"', async () => {
  const seen = [];
  const server = createServer((req, res) => {
    seen.push(req.headers['accept-language']);
    if (req.url === '/ok') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(page('en', 'We do not train.')); }
    else if (req.url === '/lang') { res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Language': 'es' }); res.end(page('', 'No entrenamos.')); }
    else { res.writeHead(403); res.end('no'); }
  }).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const readPage = async (u) => { const res = await fetch(u, { headers: READ_HEADERS }); return { status: res.status, html: await res.text(), contentLanguage: res.headers.get('content-language') || '' }; };
  try {
    const out = await verifyEntries([entry('a.sentence', 'We do not train.', `${base}/ok`), entry('b.sentence', 'We do not train.', `${base}/lang`), entry('c.sentence', 'x', `${base}/blocked`)], readPage);
    assert.deepEqual(out.map((o) => o.result), ['ok', 'other_language', 'unreachable']);
    assert.ok(seen.every((h) => /^en/.test(h)), 'every request asked for English');
  } finally { server.close(); }
});

const E = (id, slug) => ({ id, slug, kind: 'sentence', source_url: 'https://a.example/x', read_on: '2026-10-01' });
test('buildReport: a streak counts only the same non-ok result in a row; ok and a different result restart it', () => {
  const entries = [E('a.sentence', 'a'), E('b.sentence', 'b'), E('c.sentence', 'c')];
  const run = (results, previous) => buildReport({ ranAt: '2026-10-19T12:00:00Z', results: results.map(([id, result]) => ({ id, result, page_changed: null })), entries, previous });
  const r1 = run([['a.sentence', 'unreachable'], ['b.sentence', 'expired'], ['c.sentence', 'ok']]);
  assert.deepEqual(r1.results.map((r) => r.runs_in_a_row), [1, 1, 0]); assert.deepEqual(r1.summary, { ok: 1, expired: 1, unreachable: 1, other_language: 0, total: 3 });
  const r2 = run([['a.sentence', 'unreachable'], ['b.sentence', 'unreachable'], ['c.sentence', 'ok']], r1);
  assert.deepEqual(r2.results.map((r) => r.runs_in_a_row), [2, 1, 0], 'a changed result is run 1 again');
  const r3 = run([['a.sentence', 'unreachable'], ['b.sentence', 'ok'], ['c.sentence', 'unreachable']], r2);
  assert.deepEqual(r3.results.map((r) => r.runs_in_a_row), [3, 0, 1]);
  assert.equal(r3.runner, 'server');
});
const registry = { entries: [E('a.sentence', 'a'), E('b.sentence', 'b')] };
const goodReport = () => buildReport({ ranAt: '2026-10-19T12:00:00Z', results: [{ id: 'a.sentence', result: 'ok', page_changed: false }, { id: 'b.sentence', result: 'expired', page_changed: null }], entries: registry.entries });
test('reportErrors: a good report passes and every broken one is caught', () => {
  assert.deepEqual(reportErrors(goodReport(), registry), []);
  const bad = (f) => { const r = goodReport(); f(r); return reportErrors(r, registry).join('\n'); };
  assert.match(bad((r) => { r.version = 2; }), /version 1/);
  assert.match(bad((r) => { r.ran_at = '2026-10-19'; }), /ran_at/);
  assert.match(bad((r) => { r.runner = ''; }), /runner/);
  assert.match(bad((r) => { r.results[0].id = 'z.sentence'; }), /no such entry/);
  assert.match(bad((r) => { r.results[1].id = 'a.sentence'; }), /twice|not in the report/);
  assert.match(bad((r) => { r.results[1].result = 'maybe'; }), /unknown result/);
  assert.match(bad((r) => { r.results[0].runs_in_a_row = 2; }), /runs_in_a_row/);
  assert.match(bad((r) => { r.results[1].runs_in_a_row = 0; }), /runs_in_a_row/);
  assert.match(bad((r) => { r.results.pop(); r.summary.total = 1; r.summary.expired = 0; }), /not in the report: a run covers every entry/);
  assert.match(bad((r) => { r.summary.ok = 2; }), /summary\.ok/);
  assert.match(bad((r) => { r.summary.total = 5; }), /summary\.total/);
  assert.match(bad((r) => { r.results[0].source_url = 'http://x'; }), /https/);
  assert.match(reportErrors(null, registry).join(), /version 1/);
  assert.deepEqual(RESULTS, ['ok', 'expired', 'unreachable', 'other_language']);
});
test('age of the report: ok until 7 days, amber from 8, red from 15, "none" without a report', () => {
  const at = (d) => reportAge({ ran_at: '2026-10-01T12:00:00Z' }, Date.parse('2026-10-01T12:00:00Z') + d * 86400000 + 3600000);
  assert.deepEqual([at(0), at(7), at(8), at(14), at(15), at(40)].map((x) => x.level), ['ok', 'ok', 'amber', 'amber', 'red', 'red']);
  assert.equal(at(8).days, 8); assert.equal(reportAge(null, 0).level, 'none'); assert.equal(reportAge({ ran_at: 'x' }, 0).level, 'none');
  assert.deepEqual([AMBER_DAYS, RED_DAYS, PERSISTENT_RUNS], [8, 15, 3]);
  const siteJs = readFileSync(join(ROOT, 'site/site.js'), 'utf8');
  assert.match(siteJs, /days >= 15 \? 'red' : days >= 8 \? 'amber'/, 'the script of the page uses the same limits as the build');
});
test('the section of the page: age, only what needs a person, persistence after three runs, HTML escaped, none of our words that promise or rank', () => {
  const reg = { entries: [{ ...E('a.sentence', 'a'), text: 'We do <b>not</b> train.' }, { ...E('b.sentence', 'b'), text: 'x'.repeat(200) }, { ...E('c.absence_check', 'c'), kind: 'absence_check' }, E('d.sentence', 'd')] };
  const now = Date.parse('2026-10-26T12:00:00Z');
  const mk = (rows) => ({ version: 1, ran_at: '2026-10-19T12:00:00Z', runner: 'server', summary: { ok: rows.filter((r) => r.result === 'ok').length, total: rows.length }, results: rows.map((r) => ({ slug: r.id[0], read_on: '2026-10-01', source_url: 'https://a.example/x', ...r })) });
  const html = quotesReportHtml(mk([{ id: 'a.sentence', result: 'expired', runs_in_a_row: 1 }, { id: 'b.sentence', result: 'unreachable', runs_in_a_row: 2 }, { id: 'c.absence_check', result: 'expired', runs_in_a_row: 1 }, { id: 'd.sentence', result: 'ok', runs_in_a_row: 0 }]), reg, now);
  assert.match(html, /<strong>1 of 4<\/strong> found/); assert.match(html, /7 days old/); assert.match(html, /data-level="ok"/);
  assert.match(html, /We do &lt;b&gt;not&lt;\/b&gt; train/, 'the passage is escaped');
  assert.match(html, /Run 2: a block of the server is not yet a lasting problem/);
  assert.match(html, /the claim that the page has none of the four words/);
  assert.doesNotMatch(html, /d\.sentence|<th scope="row">d<\/th>/, 'what is ok is not listed');
  assert.match(html, /&hellip;/, 'a long passage is cut');
  const persistent = quotesReportHtml(mk([{ id: 'b.sentence', result: 'unreachable', runs_in_a_row: 3 }]), reg, now);
  assert.match(persistent, /has not been read for 3 runs in a row/); assert.doesNotMatch(persistent, /not yet a lasting problem/);
  assert.match(quotesReportHtml(mk([{ id: 'a.sentence', result: 'ok', runs_in_a_row: 0 }]), reg, now), /Every passage was found on its page/);
  assert.match(quotesReportHtml(mk([]), reg, Date.parse('2026-10-30T12:00:00Z')), /data-level="amber"/);
  assert.match(quotesReportHtml(mk([]), reg, Date.parse('2026-11-20T12:00:00Z')), /data-level="red"/);
  assert.match(quotesReportHtml(null, reg, now), /No report has been recorded yet/);
  const ours = html.replace(/<blockquote[\s\S]*?<\/blockquote>/g, ' ').replace(/<[^>]*>/g, ' ');
  assert.doesNotMatch(ours, /\b(safe|safer|secure|private|privacy|guarantee[sd]?|trustworthy|best|worst|better|worse|always|never trains)\b/i);
});
test('the real build: /data-policy/ carries the section, and with no report in the repository it says so', () => {
  const html = readFileSync(join(ROOT, 'site/data-policy/index.html'), 'utf8');
  assert.match(html, /<h2 id="quotes-check">Do the quoted pages still say it\?<\/h2>/);
  assert.equal((html.match(/<h3>/g) || []).length, 5, 'the five questions are still five');
});
test('the command: --offline reads no page and agrees with the data', () => {
  const out = execFileSync('node', [join(ROOT, 'scripts/verify-quotes.mjs'), '--offline'], { encoding: 'utf8' });
  assert.match(out, /consistent with the data/); assert.match(out, /this does not read any page/);
});
