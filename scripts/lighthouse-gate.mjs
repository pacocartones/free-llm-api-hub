#!/usr/bin/env node
// lighthouse-gate.mjs — serve site/ locally, run Lighthouse on twenty-four pages and
// fail when a category drops below the thresholds in lib/lighthouse-gate.mjs.
// Needs the runner from tools/lighthouse (npm ci there) and a Chrome binary in
// CHROME_PATH. Nothing is published and nothing leaves the machine.
//
//   node scripts/lighthouse-gate.mjs                          accessibility, performance and SEO, median of 3 (local default)
//   node scripts/lighthouse-gate.mjs --mode=accessibility-seo  accessibility and SEO, one run per page (pull requests)
//   node scripts/lighthouse-gate.mjs --mode=performance        performance only, median of 3 (main and nightly)
//
// Every mode also checks each page's font budget (FONT_BUDGET_BYTES in lib/assets.mjs) from the served HTML, so a pull
// request that adds a font weight over the budget fails here, not after the merge.
//
// In GitHub Actions the per-page scores go to the job summary, and the failures to the
// step output `failures`, which lighthouse.yml turns into an issue for main and nightly runs.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, rmSync, readdirSync, appendFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';
import { evaluate, fontBudgetFailures, medianReport, negotiateEncoding, parseMode } from './lib/lighthouse-gate.mjs';
import { FONT_BUDGET_BYTES } from './lib/assets.mjs';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { makeTmpDir } from './lib/tmp.mjs';
import { groupModels } from './lib/model-keys.mjs';
import { isIndexable } from './lib/model-pages.mjs';

let mode;
try { mode = parseMode(process.argv.slice(2)); } catch (err) { console.error(err.message); process.exit(2); }

// Every Lighthouse run gets its own Chrome profile directory and its own process group.
// Whatever way this script ends (normal exit, failure, Ctrl-C, kill), the groups are
// killed by pid, the profile directory is removed and a final check looks for any Chrome
// that still points at it, so no headless Chrome is left behind. Never `pkill -f`.
const PROFILE = makeTmpDir('flah-lighthouse-');
const groups = new Set();

function runLighthouse(bin, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    groups.add(child.pid);
    let out = '', err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      groups.delete(child.pid);
      killGroup(child.pid);
      if (code === 0) resolve(out); else reject(Object.assign(new Error(`exit ${code}`), { stderr: err }));
    });
  });
}

function killGroup(pid) {
  for (const signal of ['SIGTERM', 'SIGKILL']) {
    try { process.kill(-pid, signal); } catch { /* group already gone */ }
  }
}

/** Pids of processes whose command line mentions the profile directory (Chrome and its helpers). */
function leftovers() {
  if (!existsSync('/proc')) return [];
  const found = [];
  for (const name of readdirSync('/proc')) {
    if (!/^\d+$/.test(name) || Number(name) === process.pid) continue;
    try {
      if (readFileSync(`/proc/${name}/cmdline`, 'utf8').includes(PROFILE)) found.push(Number(name));
    } catch { /* process ended while scanning */ }
  }
  return found;
}

let cleaned = false;
function cleanup() {
  if (cleaned) return;
  cleaned = true;
  for (const pid of groups) killGroup(pid);
  for (const pid of leftovers()) { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } }
  rmSync(PROFILE, { recursive: true, force: true });
  const left = leftovers();
  if (left.length) console.error(`WARNING: ${left.length} process(es) still reference ${PROFILE}: ${left.join(' ')}`);
}
process.on('exit', cleanup);
for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]]) process.on(signal, () => { cleanup(); process.exit(code); });
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(ROOT, 'site');
const baseline = JSON.parse(readFileSync(join(ROOT, 'data/a11y-baseline.json'), 'utf8'));
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.woff2': 'font/woff2', '.png': 'image/png' };

function resolveFile(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  let file = join(SITE, clean);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  return file.startsWith(SITE) && existsSync(file) ? file : null;
}

const compressed = new Map();
const server = createServer((req, res) => {
  const file = resolveFile(req.url);
  if (!file) { res.writeHead(404); res.end('not found'); return; }
  const type = TYPES[extname(file)] || 'application/octet-stream';
  // Compressed like the production edge serves it (see negotiateEncoding), so Lighthouse measures the site, not this server.
  const encoding = negotiateEncoding(type, req.headers['accept-encoding']);
  // Compressed once per file and encoding: the site does not change during the run, and the pages measured side by
  // side ask for the same CSS, fonts and scripts.
  const key = `${encoding}:${file}`;
  let body = compressed.get(key);
  if (!body) {
    const raw = readFileSync(file);
    body = encoding === 'br' ? brotliCompressSync(raw) : encoding === 'gzip' ? gzipSync(raw) : raw;
    compressed.set(key, body);
  }
  res.writeHead(200, { 'content-type': type, ...(encoding ? { 'content-encoding': encoding, vary: 'Accept-Encoding' } : {}) });
  res.end(body);
});

await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}`;
// The provider page comes from the dataset, so removing one provider cannot turn this gate into a 404.
const providers = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8')).providers;
const sample = providers.find((p) => existsSync(join(SITE, 'p', `${p.slug}.html`)));
if (!sample) { console.error('No generated provider page under site/p/: run `node scripts/build.mjs` first.'); process.exit(1); }
const pages = ['/', '/best/', '/coverage/', '/quality/', '/free-gpu/', '/coding-tools/', '/compare/', '/find/', '/data-policy/', '/guides-and-collections/', `/p/${sample.slug}.html`,
  '/collections/no-credit-card.html', '/collections/openai-compatible.html',
  '/guides/free-llm-api-no-signup.html', '/guides/free-embeddings-apis.html',
  '/guides/free-ocr-document-ai-apis.html', '/guides/free-speech-to-text-apis.html',
  '/guides/free-image-generation-apis.html', '/not-free/', '/embed/', '/free-api/qwen/'];
// One model page, also from the dataset (model samples rotate): the indexable one listed by the most providers.
const modelSample = groupModels(providers).filter((g) => isIndexable(g) && existsSync(join(SITE, 'models', g.key, 'index.html')))
  .sort((a, b) => b.entries.length - a.entries.length || (a.key < b.key ? -1 : 1))[0];
if (!modelSample) { console.error('No generated model page under site/models/: run `node scripts/build.mjs` first.'); process.exit(1); }
pages.push(`/models/${modelSample.key}/`);
// One limits page and one alternatives page (lib/longtail-pages.mjs), the first of each the build wrote, so a dataset change that
// removes one cannot turn the gate into a 404.
for (const dir of ['limits', 'alternatives']) {
  const first = existsSync(join(SITE, dir)) && readdirSync(join(SITE, dir), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()[0];
  if (!first) { console.error(`No generated page under site/${dir}/: run \`node scripts/build.mjs\` first.`); process.exit(1); }
  pages.push(`/${dir}/${first}/`);
}
const lighthouse = join(ROOT, 'tools/lighthouse/node_modules/.bin/lighthouse');
const RUNS = mode.runs;
const failures = [];
const summary = [`### Lighthouse (${mode.name}, ${RUNS === 1 ? 'one run' : `median of ${RUNS} runs`} per page, ${mode.concurrency} at a time)`, '',
  `| Page | ${mode.categories.join(' | ')} |`, `|---|${mode.categories.map(() => '---|').join('')}`];
// Measures one page; returns its failures, its log line and its summary row, so the output keeps the page order
// whatever order the pages finish in. Each concurrent worker has its own Chrome profile under PROFILE.
async function measure(page, profile) {
  const failed = [];
  // The font budget does not depend on the runner: checked once per page, from the HTML that is served.
  const htmlFile = resolveFile(page);
  if (htmlFile) {
    const pageDir = dirname(htmlFile.slice(SITE.length)) || '/';
    const sizeOf = (ref) => { const f = resolveFile(ref.startsWith('/') ? ref : join(pageDir, ref)); return f ? statSync(f).size : null; };
    failed.push(...fontBudgetFailures(page, readFileSync(htmlFile, 'utf8'), sizeOf, FONT_BUDGET_BYTES));
  }
  // Asynchronous on purpose: a synchronous child process would block this process's event loop, and the server below could never answer Lighthouse.
  const reports = [];
  for (let i = 0; i < RUNS; i++) {
    try {
      const out = await runLighthouse(lighthouse, [
        base + page, '--output=json', '--quiet',
        `--only-categories=${mode.categories.join(',')}`,
        `--chrome-flags=--headless --no-sandbox --user-data-dir=${profile}`,
      ]);
      reports.push(JSON.parse(out));
    } catch (err) {
      // Lighthouse exits non-zero when it cannot load the page; keep the log readable.
      failed.push(`${page}: Lighthouse could not measure it: ${String(err.stderr || err.message).trim().slice(0, 300)}`);
      break;
    }
  }
  if (reports.length < RUNS) return { failed };
  const report = medianReport(reports);
  const scores = mode.categories.map((name) => {
    const runs = RUNS > 1 ? ` (runs ${reports.map((r) => r.categories?.[name]?.score).join('/')})` : '';
    return `${name} ${report.categories[name]?.score}${runs}`;
  });
  failed.push(...evaluate(page, report, mode.thresholds, baseline));
  return {
    failed,
    line: `${page}: ${RUNS === 1 ? 'one run' : `median of ${RUNS} runs`}: ${scores.join(', ')}`,
    row: `| \`${page}\` | ${mode.categories.map((name) => String(report.categories[name]?.score ?? 'no score')).join(' | ')} |`,
  };
}

try {
  const results = new Array(pages.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(mode.concurrency, pages.length) }, (_, w) => (async () => {
    const profile = join(PROFILE, `worker-${w}`);
    while (next < pages.length) {
      const at = next++;
      results[at] = await measure(pages[at], profile);
      if (results[at].line) console.log(results[at].line);
    }
  })());
  await Promise.all(workers);
  for (const { failed, row } of results) {
    if (row) summary.push(row);
    failures.push(...failed);
  }
} finally {
  server.close();
  cleanup();
}
// GitHub Actions only: a readable table in the job summary, and the failures as a step
// output (random heredoc delimiter, so no page text can end the value early).
if (process.env.GITHUB_STEP_SUMMARY) {
  if (failures.length) summary.push('', '**Failures**', '', ...failures.map((f) => `- ${f}`));
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary.join('\n')}\n`);
}
if (process.env.GITHUB_OUTPUT) {
  const eof = `EOF_${randomUUID()}`;
  appendFileSync(process.env.GITHUB_OUTPUT, `failures<<${eof}\n${failures.join('\n')}\n${eof}\n`);
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`OK — Lighthouse ${mode.categories.join(', ')} within thresholds.`);
