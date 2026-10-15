#!/usr/bin/env node
// Reads again every page that data/quotes.json quotes, and says for each passage: ok, expired, unreachable or other_language.
//
//   node scripts/verify-quotes.mjs --offline            consistency of the register with the data (no network); what CI runs
//   node scripts/verify-quotes.mjs                      read the pages and print the report
//   node scripts/verify-quotes.mjs --write              also write data/quotes-report.json (a person commits it with a normal pull request)
//   --only <slug>                                       one provider (the report is then partial and is not written)
//
// It only READS and REPORTS: it never changes the data, the notes or the register. An "expired" passage is for a person to decide.
// It is meant to run from the server, not from a GitHub runner (many sites answer a runner with a 403 from their CDN).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { quoteErrors } from './lib/quotes.mjs';
import { READ_HEADERS } from './lib/page-text.mjs';
import { verifyEntries, buildReport, reportErrors } from './lib/quotes-report.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const data = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8'));
const registry = JSON.parse(readFileSync(join(ROOT, 'data/quotes.json'), 'utf8'));

const errors = quoteErrors(data, registry);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
if (flag('--offline')) { console.log(`quotes: consistent with the data (${registry.entries.length} entries; offline, this does not read any page)`); process.exit(0); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function readPage(url) {
  await sleep(700); // one request at a time, and not in a hurry
  try {
    const res = await fetch(url, { headers: READ_HEADERS, redirect: 'follow', signal: AbortSignal.timeout(30000) });
    return { status: res.status, html: await res.text(), contentLanguage: res.headers.get('content-language') || '' };
  } catch (e) { return { error: String((e && e.message) || e).slice(0, 80) }; }
}

const entries = registry.entries.filter((e) => !only || e.slug === only);
if (!entries.length) { console.error(`no entry for ${only}`); process.exit(1); }
const results = await verifyEntries(entries, readPage);
const reportFile = join(ROOT, 'data/quotes-report.json');
const previous = existsSync(reportFile) ? JSON.parse(readFileSync(reportFile, 'utf8')) : null;
const report = buildReport({ ranAt: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), runner: process.env.VERIFY_RUNNER || 'server', results, entries, previous });

for (const r of report.results.filter((x) => x.result !== 'ok')) console.log(`${r.result.toUpperCase().padEnd(15)} ${r.id}  ${r.source_url}${r.runs_in_a_row > 1 ? `  (${r.runs_in_a_row} runs in a row)` : ''}`);
console.log(`${report.summary.ok} of ${report.summary.total} found; expired ${report.summary.expired}, unreachable ${report.summary.unreachable}, other language ${report.summary.other_language}`);
const changed = report.results.filter((r) => r.page_changed).length;
if (changed) console.log(`${changed} page(s) have a different text from the one in the register (the hash changed): this is not an error, it only says the page moved`);

if (flag('--write')) {
  if (only) { console.error('--write needs a run over every entry (no --only)'); process.exit(1); }
  const bad = reportErrors(report, registry);
  if (bad.length) { console.error(bad.join('\n')); process.exit(1); }
  writeFileSync(reportFile, JSON.stringify(report, null, 1) + '\n');
  console.log('written: data/quotes-report.json (commit it with a pull request; nothing commits it by itself)');
}
