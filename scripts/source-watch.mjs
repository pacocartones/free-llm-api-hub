#!/usr/bin/env node
// The weekly source-watch (scripts/lib/source-watch.mjs): re-read every page data/quotes.json cites and report quote drift.
//
//   node scripts/source-watch.mjs                     read the pages and print the issue body it would publish (a dry run)
//   node scripts/source-watch.mjs --json <file>       also write the full report as JSON (the workflow uploads it as an artifact)
//   node scripts/source-watch.mjs --publish           create, update, reopen or close the one tracking issue (needs gh and GH_TOKEN)
//   --only <slug>                                     one provider (never published: a partial run would reset the state of the others)
//   --concurrency <n>                                 hosts read at the same time (default 4; always one request at a time per host)
//
// It only reads and reports: it never edits the data or the register, and exits 0 whatever it finds (a missing quote is for a person).
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { quoteErrors } from './lib/quotes.mjs';
import { readHeaders } from './lib/page-text.mjs';
import { fetchPublicUrl } from './lib/public-fetch.mjs';
import { isPdf, pdfToText, responseBytes } from './lib/pdf-text.mjs';
import { ISSUE_TITLE, DEFAULT_CONCURRENCY, readAll, judge, parseState, buildReport, renderIssue, plan } from './lib/source-watch.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
const only = opt('--only');
const jsonOut = opt('--json');
const publish = args.includes('--publish');
const concurrency = Number(opt('--concurrency')) || DEFAULT_CONCURRENCY;
if (publish && only) { console.error('--publish needs a run over every quote (no --only)'); process.exit(1); }

const data = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8'));
const registry = JSON.parse(readFileSync(join(ROOT, 'data/quotes.json'), 'utf8'));
const errors = quoteErrors(data, registry);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }

/** One page, read as quotes:add and verify-quotes read it (same headers, PDF through unpdf). Never throws. */
async function readPage(url, lang = 'en') {
  try {
    const res = await fetchPublicUrl(url, { headers: readHeaders(lang), timeoutMs: 30000 });
    if (res.ok && isPdf(res.headers.get('content-type'), url)) return { status: res.status, pdfText: await pdfToText(await responseBytes(res)) };
    if (!res.ok) { try { res.body?.cancel()?.catch(() => {}); } catch { /* abandoned */ } return { status: res.status }; }
    return { status: res.status, html: await res.text(), contentLanguage: res.headers.get('content-language') || '' };
  } catch (e) { return { error: String((e && e.message) || e).slice(0, 80) }; }
}

const gh = (ghArgs, input) => {
  const r = spawnSync('gh', ghArgs, { encoding: 'utf8', input });
  if (r.status !== 0) throw new Error(`gh ${ghArgs.slice(0, 2).join(' ')} failed: ${(r.stderr || '').trim()}`);
  return r.stdout.trim();
};

function findIssue() {
  const list = JSON.parse(gh(['issue', 'list', '--state', 'all', '--search', `in:title "${ISSUE_TITLE}"`, '--json', 'number,title,state,body', '--limit', '20']));
  return list.filter((i) => i.title === ISSUE_TITLE).sort((a, b) => a.number - b.number)[0] || null;
}

const entries = registry.entries.filter((e) => !only || e.slug === only);
if (!entries.length) { console.error(`no quote for ${only}`); process.exit(1); }
const issue = publish ? findIssue() : null;
const pages = await readAll(entries, readPage, { concurrency });
const rows = await judge(entries, pages);
const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env;
const runUrl = GITHUB_RUN_ID ? `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}` : '';
const report = buildReport(rows, parseState(issue && issue.body), { ranAt: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), runUrl });
const body = renderIssue(report);
console.log(body);
const s = report.summary;
console.error(`source-watch: ${s.total} quotes on ${s.urls} pages — present ${s.present}, changed page ${s.changed}, missing ${s.missing}, fetch error ${s.fetch_error} (flagged ${s.flagged_fetch_errors})`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(report, null, 1) + '\n');

if (publish) {
  const todo = plan(issue, report);
  let number = todo.edit;
  if (todo.create) number = Number(gh(['issue', 'create', '--title', ISSUE_TITLE, '--body-file', '-'], body).match(/\/issues\/(\d+)\s*$/)?.[1]);
  else gh(['issue', 'edit', String(number), '--body-file', '-'], body);
  if (!Number.isInteger(number)) throw new Error('could not read the number of the issue just created');
  if (todo.reopen) gh(['issue', 'reopen', String(number)]);
  if (todo.close) gh(['issue', 'close', String(number), '--reason', 'completed']);
  console.error(`issue #${number}: ${todo.create ? 'created' : 'updated'}${todo.reopen ? ', reopened' : ''}${todo.close ? ', closed (clean)' : ''}`);
}
