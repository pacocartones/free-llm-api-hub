// The weekly report of `npm run verify-quotes`: did each quoted passage still appear on its page when it was read again?
//
// It is a data file (data/quotes-report.json) written by a person's run on the server, committed through a normal pull request, and read by the
// build; nothing regenerates it by itself. The page shows the AGE of the report, because a report nobody renews says nothing.
import { judgeReading, htmlToText, absenceHits, sha256, METHOD } from './page-text.mjs';
import { totalHits } from './quotes.mjs';
import { htmlEsc } from './rows.mjs';

export const RESULTS = ['ok', 'expired', 'unreachable', 'other_language'];
export const AMBER_DAYS = 8;
export const RED_DAYS = 15;
export const PERSISTENT_RUNS = 3;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

/** Reads every source once (many entries share a page) and judges each entry against it.
 * @param {Array} entries the entries of data/quotes.json
 * @param {(url: string) => Promise<{status?: number, html?: string, contentLanguage?: string, error?: string}>} readPage
 * @returns {Promise<Array<{id: string, result: string, page_changed: boolean|null}>>} */
export async function verifyEntries(entries, readPage) {
  const pages = new Map();
  const read = async (url) => { if (!pages.has(url)) pages.set(url, await readPage(url)); return pages.get(url); };
  const out = [];
  for (const e of entries) {
    const reading = await read(e.source_url);
    if (e.kind === 'absence_check') {
      // the claim "the page has none of the four words" holds only while the count is zero in a page that was really read
      const judged = judgeReading(reading, '', e.lang);
      let result = judged === 'expired' || judged === 'ok' ? 'ok' : judged; // an empty passage is always "in" the page: only readability and language matter
      if (result === 'ok' && totalHits(absenceHits(htmlToText(reading.html))) > 0) result = 'expired';
      out.push({ id: e.id, result, page_changed: result === 'unreachable' || result === 'other_language' || !e.page_sha256 ? null : sha256(htmlToText(reading.html)) !== e.page_sha256 });
      continue;
    }
    const result = judgeReading(reading, e.text, e.lang);
    out.push({ id: e.id, result, page_changed: result === 'unreachable' || result === 'other_language' || !e.page_sha256 ? null : sha256(htmlToText(reading.html)) !== e.page_sha256 });
  }
  return out;
}

/** The report: the results of this run, with how many runs in a row each entry has had the same non-ok result. */
export function buildReport({ ranAt, runner = 'server', results, entries, previous = null }) {
  const prev = new Map(((previous && previous.results) || []).map((r) => [r.id, r]));
  const byId = new Map(entries.map((e) => [e.id, e]));
  const rows = results.map((r) => {
    const e = byId.get(r.id); const before = prev.get(r.id);
    const runs = r.result === 'ok' ? 0 : (before && before.result === r.result ? (before.runs_in_a_row || 0) + 1 : 1);
    return { id: r.id, slug: e.slug, kind: e.kind, source_url: e.source_url, read_on: e.read_on, result: r.result, runs_in_a_row: runs, page_changed: r.page_changed };
  });
  const summary = Object.fromEntries(RESULTS.map((k) => [k, rows.filter((r) => r.result === k).length])); summary.total = rows.length;
  return { version: 1, ran_at: ranAt, runner, summary, results: rows };
}

/** @returns {string[]} one line per problem with the shape of a report, against the register */
export function reportErrors(report, registry) {
  const errors = []; const fail = (m) => errors.push(`quotes-report.json: ${m}`);
  if (!report || report.version !== 1) return ['quotes-report.json: needs version 1'];
  if (!STAMP_RE.test(report.ran_at || '')) fail('ran_at must be a UTC time like 2026-10-19T12:10:00Z');
  if (typeof report.runner !== 'string' || !report.runner) fail('runner must say where the run happened');
  if (!Array.isArray(report.results)) return [...errors, 'quotes-report.json: results must be a list'];
  // A report is a dated photograph of a run: the register may have gained entries since (a new row) or lost some (a row removed). That is not an
  // error: reportCoverage says it, and the page shows it. What must hold is that the report agrees with itself.
  const seen = new Set();
  for (const r of report.results) {
    if (seen.has(r.id)) fail(`${r.id}: twice`); seen.add(r.id);
    if (!RESULTS.includes(r.result)) fail(`${r.id}: unknown result ${JSON.stringify(r.result)}`);
    if (!Number.isInteger(r.runs_in_a_row) || r.runs_in_a_row < 0 || (r.result === 'ok') !== (r.runs_in_a_row === 0)) fail(`${r.id}: runs_in_a_row is 0 exactly when the result is ok`);
    if (!/^https:\/\//.test(r.source_url || '')) fail(`${r.id}: source_url must be https`);
    if (!DATE_RE.test(r.read_on || '')) fail(`${r.id}: read_on must be a date`);
  }
  const s = report.summary || {};
  for (const k of RESULTS) if (s[k] !== report.results.filter((r) => r.result === k).length) fail(`summary.${k} does not match the results`);
  if (s.total !== report.results.length) fail('summary.total does not match the results');
  return errors;
}

/** What the register has gained or lost since the run of the report: new entries are not read yet, and results of removed ones are stale. */
export function reportCoverage(report, registry) {
  const inRegister = new Set((registry.entries || []).map((e) => e.id)); const inReport = new Set(((report && report.results) || []).map((r) => r.id));
  return { notRead: [...inRegister].filter((id) => !inReport.has(id)), stale: [...inReport].filter((id) => !inRegister.has(id)) };
}

/** How old the report is, in whole days, and the level the page gives it: none (no report), ok, amber (8 days), red (15 days). */
export function reportAge(report, nowMs) {
  if (!report || !STAMP_RE.test(report.ran_at || '')) return { days: null, level: 'none' };
  const days = Math.max(0, Math.floor((nowMs - Date.parse(report.ran_at)) / 86400000));
  return { days, level: days >= RED_DAYS ? 'red' : days >= AMBER_DAYS ? 'amber' : 'ok' };
}

const RESULT_TEXT = {
  expired: 'not found: the page was read in English and the passage is no longer in it. A person decides what changes',
  unreachable: 'not read from the server: no page came (an error, a block, or a page that needs scripts)',
  other_language: 'not compared: the page came in another language',
};
const LEVEL_TEXT = { none: 'No report has been recorded yet.', ok: 'The report is up to date.', amber: 'The report has not been renewed for more than a week.', red: 'The report has not been renewed for more than two weeks.' };

/** The section of /data-policy/. `nowMs` is the build time; a small script on the page recomputes the age when it is opened. */
export function quotesReportHtml(report, registry, nowMs) {
  const age = reportAge(report, nowMs);
  const head = '<h2 id="quotes-check">Do the quoted pages still say it?</h2>' +
    '<p>Every quoted sentence and passage is read again on its page once a week, from the server, in English. Only what is listed below needs a person: a passage the page no longer carries, or a page that could not be read.</p>';
  if (!report || age.level === 'none') return `${head}<p class="dp-check" data-level="none" data-ran-at="">${LEVEL_TEXT.none}</p>`;
  const byId = new Map((registry.entries || []).map((e) => [e.id, e]));
  const cov = reportCoverage(report, registry);
  const bad = report.results.filter((r) => r.result !== 'ok' && byId.has(r.id));
  const s = report.summary;
  const rows = bad.map((r) => {
    const e = byId.get(r.id) || {};
    const persistent = r.result === 'unreachable' && r.runs_in_a_row >= PERSISTENT_RUNS;
    const text = RESULT_TEXT[r.result] + (r.result === 'unreachable' ? (persistent ? `. It has not been read for ${r.runs_in_a_row} runs in a row` : `. Run ${r.runs_in_a_row}: a block of the server is not yet a lasting problem`) : '');
    const what = e.kind === 'absence_check' ? 'the claim that the page has none of the four words' : `<blockquote class="dp-quote">&ldquo;${htmlEsc(String(e.text || '').slice(0, 90))}${(e.text || '').length > 90 ? '&hellip;' : ''}&rdquo;</blockquote>`;
    return `<tr><th scope="row">${htmlEsc(r.slug)}</th><td>${what}</td><td>${htmlEsc(text)}</td><td>read ${htmlEsc(r.read_on)}</td></tr>`;
  }).join('');
  const list = bad.length
    ? `<div class="table-scroll" role="region" aria-label="Table: quoted passages that need a person" tabindex="0"><table class="dp-table"><thead><tr><th scope="col">Provider</th><th scope="col">Passage</th><th scope="col">Result</th><th scope="col">Last read as found</th></tr></thead><tbody>${rows}</tbody></table></div>`
    : '<p>Every passage was found on its page.</p>';
  return `${head}<p class="dp-check" data-level="${age.level}" data-ran-at="${htmlEsc(report.ran_at)}"><strong>${s.ok} of ${s.total}</strong> found on their pages in the run of ${htmlEsc(report.ran_at.slice(0, 10))} ` +
    `(<span class="dp-age">${age.days} day${age.days === 1 ? '' : 's'} old</span>). <span class="dp-level">${LEVEL_TEXT[age.level]}</span></p>${list}` +
    (cov.notRead.length ? `<p>${cov.notRead.length} quoted passage${cov.notRead.length === 1 ? ' was' : 's were'} added after that run and ${cov.notRead.length === 1 ? 'has' : 'have'} not been read from the server yet.</p>` : '');
}
