// The weekly source-watch: read again every page that data/quotes.json cites and say, per quote, whether the quoted text is still there.
//
// It reads pages exactly the way `npm run quotes:add` and `npm run verify-quotes` do (same headers, same html-text-v1 / pdf-text-v1
// normalisation, same judgement in page-text.mjs), so "present" here means what "ok" means there. It only REPORTS: it never edits the
// register or the data, and it never copies page text into its output — only our own ids, URLs, dates and HTTP statuses.
//
// Four statuses per quote:
//   present      the quoted text is on the page and the page text hashes to the recorded page_sha256;
//   changed      the quoted text is still on the page, but the page text changed (the hash differs): low priority, nothing to fix;
//   missing      a page came, in the recorded language, and the quoted text is no longer in it: a person re-checks the quote;
//   fetch_error  no usable page came (HTTP error, timeout, a page that needs scripts, another language). From a GitHub runner many CDNs
//                answer 403, so a fetch error is a lead, not a verdict: it is only flagged after FLAG_AFTER_RUNS runs in a row
//                (404 and 410 are flagged at once: the page is gone).
//
// The run-to-run memory (how many runs in a row each URL has failed) lives in a hidden comment of the tracking issue, never in the repo.
import { verifyEntries } from './quotes-report.mjs';

export const ISSUE_TITLE = 'Source watch: quotes to re-check';
export const STATUSES = ['present', 'changed', 'missing', 'fetch_error'];
export const FLAG_AFTER_RUNS = 2;
export const GONE_STATUSES = new Set([404, 410]);
export const DEFAULT_CONCURRENCY = 4;
export const DEFAULT_DELAY_MS = 700;
const STATE_RE = /<!-- source-watch-state: (\{.*?\}) -->/s;
const MAX_ROWS = 300; // an issue body is capped at 65,536 characters; far more rows than the register has today

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hostOf = (url) => { try { return new URL(url).host; } catch { return url; } };

/**
 * Reads every distinct (language, URL) pair once, at most `concurrency` hosts at a time and one request at a time per host, with a pause
 * before each request. @returns {Promise<Map<string, object>>} key `${lang}\0${url}` -> the reading (see verify-quotes' readPage)
 */
export async function readAll(entries, readPage, { concurrency = DEFAULT_CONCURRENCY, delayMs = DEFAULT_DELAY_MS, wait = sleep } = {}) {
  const byHost = new Map();
  for (const e of entries) {
    const key = `${e.lang}\0${e.source_url}`; const host = hostOf(e.source_url);
    if (!byHost.has(host)) byHost.set(host, new Map());
    byHost.get(host).set(key, { url: e.source_url, lang: e.lang });
  }
  const queue = [...byHost.values()];
  const pages = new Map();
  const worker = async () => {
    for (let group = queue.shift(); group; group = queue.shift()) {
      for (const [key, { url, lang }] of group) {
        if (delayMs) await wait(delayMs);
        pages.set(key, await readPage(url, lang));
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, queue.length)) }, worker));
  return pages;
}

/** Why a reading is a fetch error, in our words (never page text). */
export function fetchReason(reading, result) {
  if (!reading) return 'not read';
  if (reading.error) return `error: ${String(reading.error).slice(0, 80)}`;
  if (!(reading.status >= 200 && reading.status < 300)) return `HTTP ${reading.status}`;
  if (result === 'other_language') return 'page came in another language';
  return 'too little text (a page that needs scripts, or a scanned PDF)';
}

/**
 * Judges every entry against the pages read (verifyEntries from quotes-report.mjs) and maps the result to a source-watch status.
 * @returns {Promise<Array<{id, slug, kind, source_url, read_on, status, http?: number, reason?: string}>>}
 */
export async function judge(entries, pages) {
  const read = async (url, lang) => pages.get(`${lang}\0${url}`);
  const results = await verifyEntries(entries, read);
  const byId = new Map(entries.map((e) => [e.id, e]));
  return results.map((r) => {
    const e = byId.get(r.id);
    const row = { id: e.id, slug: e.slug, kind: e.kind, source_url: e.source_url, read_on: e.read_on };
    if (r.result === 'ok') return { ...row, status: r.page_changed ? 'changed' : 'present' };
    if (r.result === 'expired') return { ...row, status: 'missing' };
    const reading = pages.get(`${e.lang}\0${e.source_url}`);
    return { ...row, status: 'fetch_error', ...(Number.isInteger(reading?.status) ? { http: reading.status } : {}), reason: fetchReason(reading, r.result) };
  });
}

/** The state hidden in an issue body, or an empty state. */
export function parseState(body) {
  const m = STATE_RE.exec(String(body || ''));
  if (!m) return { version: 1, fetch_errors: {} };
  try {
    const s = JSON.parse(m[1]);
    const errs = s && typeof s.fetch_errors === 'object' && s.fetch_errors ? s.fetch_errors : {};
    return { version: 1, fetch_errors: Object.fromEntries(Object.entries(errs).filter(([k, v]) => /^https:\/\//.test(k) && Number.isInteger(v) && v > 0)) };
  } catch { return { version: 1, fetch_errors: {} }; }
}

/**
 * The next state and the report of this run. A URL's count grows by one for each run in a row in which it gave a fetch error, and drops
 * out as soon as it is read. A fetch error is flagged when its count reaches FLAG_AFTER_RUNS, or at once for 404/410.
 */
export function buildReport(rows, previousState, { ranAt, runUrl = '' } = {}) {
  const prev = (previousState && previousState.fetch_errors) || {};
  const failing = new Map();
  for (const r of rows) if (r.status === 'fetch_error') failing.set(r.source_url, r);
  const fetch_errors = {};
  for (const url of failing.keys()) fetch_errors[url] = (prev[url] || 0) + 1;
  const out = rows.map((r) => {
    if (r.status !== 'fetch_error') return r;
    const runs = fetch_errors[r.source_url];
    return { ...r, runs_in_a_row: runs, flagged: runs >= FLAG_AFTER_RUNS || GONE_STATUSES.has(r.http) };
  });
  const summary = Object.fromEntries(STATUSES.map((s) => [s, out.filter((r) => r.status === s).length]));
  summary.total = out.length;
  summary.flagged_fetch_errors = out.filter((r) => r.flagged).length;
  summary.urls = new Set(out.map((r) => r.source_url)).size;
  const clean = summary.missing === 0 && summary.flagged_fetch_errors === 0;
  return { version: 1, ran_at: ranAt, run_url: runUrl, clean, summary, state: { version: 1, fetch_errors }, results: out };
}

const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
const bySlug = (rows) => {
  const m = new Map();
  for (const r of rows) { if (!m.has(r.slug)) m.set(r.slug, []); m.get(r.slug).push(r); }
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b, 'en'));
};

/** The Markdown body of the tracking issue: what a person re-checks, per provider, and the hidden state for the next run. */
export function renderIssue(report) {
  const s = report.summary;
  const missing = report.results.filter((r) => r.status === 'missing');
  const flagged = report.results.filter((r) => r.flagged);
  const pending = report.results.filter((r) => r.status === 'fetch_error' && !r.flagged);
  const changed = report.results.filter((r) => r.status === 'changed');
  const out = [
    `Automated weekly source watch, run of ${report.ran_at.slice(0, 10)}${report.run_url ? ` ([workflow run](${report.run_url}))` : ''}. ` +
      'It re-reads every page cited in `data/quotes.json` the way `npm run quotes:add` does and checks that each quoted text is still there. ' +
      'It reports only: it never edits data, and it lists our own ids and URLs, never page text.',
    '',
    report.clean ? '**Everything is clean: every quote was found, and no page has failed two runs in a row.**'
      : `**${missing.length} quote${missing.length === 1 ? '' : 's'} missing and ${flagged.length} flagged fetch error${flagged.length === 1 ? '' : 's'} to re-check.**`,
    '',
    '| Present | Changed page, quote present | Missing | Fetch error (flagged / waiting) | Quotes | Pages |',
    '|---|---|---|---|---|---|',
    `| ${s.present} | ${s.changed} | ${s.missing} | ${s.fetch_error} (${s.flagged_fetch_errors} / ${s.fetch_error - s.flagged_fetch_errors}) | ${s.total} | ${s.urls} |`,
  ];
  let budget = MAX_ROWS;
  const table = (rows, head, line) => {
    out.push('', head[0], head[1]);
    for (const r of rows.slice(0, budget)) out.push(line(r));
    if (rows.length > budget) out.push(`| … | ${rows.length - budget} more rows in the run artifact | | | |`);
    budget = Math.max(0, budget - rows.length);
  };
  if (missing.length) {
    out.push('', '## Missing quotes, per provider', '', 'The page came, in the recorded language, and the quoted text is no longer in it. Re-check the claim and the quote following [docs/update-playbook.md](https://github.com/pacocartones/free-llm-api-hub/blob/main/docs/update-playbook.md#source-watch); `npm run quotes:add -- <slug>` records a new quote once the data is right.');
    for (const [slug, rows] of bySlug(missing)) {
      out.push('', `### ${slug}`);
      table(rows, ['| Quote id | Kind | Source | Read on |', '|---|---|---|---|'], (r) => `| \`${cell(r.id)}\` | ${cell(r.kind)} | ${cell(r.source_url)} | ${r.read_on} |`);
    }
  }
  if (flagged.length) {
    out.push('', '## Fetch errors to re-check', '', `No usable page came for ${FLAG_AFTER_RUNS} runs in a row (or the page answered 404/410). GitHub runners are often blocked by CDNs: re-check from a normal connection before changing anything.`);
    table(flagged, ['| Provider | Quote id | Source | Why | Runs in a row |', '|---|---|---|---|---|'], (r) => `| ${cell(r.slug)} | \`${cell(r.id)}\` | ${cell(r.source_url)} | ${cell(r.reason)} | ${r.runs_in_a_row} |`);
  }
  if (pending.length) out.push('', `<details><summary>${pending.length} fetch error${pending.length === 1 ? '' : 's'} on the first run (not flagged yet)</summary>`, '', ...[...new Set(pending.map((r) => r.source_url))].sort().map((u) => `- ${u}`), '', '</details>');
  if (changed.length) out.push('', `<details><summary>${changed.length} quote${changed.length === 1 ? '' : 's'} still present on a changed page (low priority, nothing to fix)</summary>`, '', ...bySlug(changed).map(([slug, rows]) => `- ${slug}: ${rows.map((r) => `\`${r.id}\``).join(', ')}`), '', '</details>');
  out.push('', '_This body is replaced on every run; keep discussion in comments. The hidden line below is the memory of the next run._', '', `<!-- source-watch-state: ${JSON.stringify(report.state)} -->`);
  return out.join('\n');
}

/**
 * What to do with the tracking issue. There is one issue for ever: it is created on the first run (so that its hidden state survives a
 * clean run), reopened when something needs a person, and closed when everything is clean. Its body is always replaced.
 * @param {{number: number, state: string, body?: string} | null} issue the existing issue, open or closed
 * @returns {{create?: boolean, edit?: number, reopen?: boolean, close?: boolean}}
 */
export function plan(issue, report) {
  if (!issue) return { create: true, close: report.clean };
  const open = String(issue.state).toUpperCase() === 'OPEN';
  return { edit: issue.number, reopen: !open && !report.clean, close: open && report.clean };
}
