import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { evaluate, fontBudgetFailures, medianReport, pageFontUrls, parseMode, MODES, THRESHOLDS } from './lib/lighthouse-gate.mjs';

const report = (accessibility, performance) => ({ categories: { accessibility: { score: accessibility }, performance: { score: performance } } });

const auditReport = ({ id = 'label', score = 0, scoreDisplayMode, snippet = '<input>' } = {}) => ({
  categories: {
    accessibility: { score: 1, auditRefs: [{ id, weight: 1 }] },
    performance: { score: 1 },
  },
  audits: {
    [id]: {
      score,
      ...(scoreDisplayMode ? { scoreDisplayMode } : {}),
      details: { items: [{ node: { snippet } }] },
    },
  },
});

test('scores at or above the thresholds pass', () => {
  assert.deepEqual(evaluate('/', report(THRESHOLDS.accessibility, THRESHOLDS.performance)), []);
});

test('accessibility just below the threshold fails and names the page', () => {
  const f = evaluate('/best/', report(0.94, 1));
  assert.equal(f.length, 1);
  assert.match(f[0], /^\/best\/: accessibility 0\.94 is below 0\.95$/);
});

test('performance just below the threshold fails', () => {
  assert.equal(evaluate('/', report(1, 0.79)).length, 1);
});

test('a missing or null score is a failure, not a pass', () => {
  assert.equal(evaluate('/', { categories: { accessibility: { score: null }, performance: { score: 1 } } }).length, 1);
  assert.equal(evaluate('/', { categories: {} }).length, 2);
  assert.equal(evaluate('/', undefined).length, 2);
});

test('the median of three runs ignores one bad run', () => {
  const m = medianReport([report(1, 0.78), report(1, 0.91), report(1, 0.93)]);
  assert.equal(m.categories.performance.score, 0.91);
  assert.deepEqual(evaluate('/', m), []);
});

test('two bad runs out of three still fail', () => {
  const m = medianReport([report(1, 0.78), report(1, 0.79), report(1, 0.93)]);
  assert.equal(evaluate('/', m).length, 1);
});

test('a run without a score makes the median "no score"', () => {
  const m = medianReport([report(1, 0.9), { categories: {} }, report(1, 0.9)]);
  assert.equal(evaluate('/', m).length, 2);
});

test('a new failing accessibility audit fails and names its nodes', () => {
  const failures = evaluate('/compare/', auditReport({ snippet: '<input id="q">' }), THRESHOLDS, { '/compare/': [] });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /\/compare\/: new accessibility audit label failed/);
  assert.match(failures[0], /<input id="q">/);
});

test('an accessibility audit already in the page baseline passes', () => {
  assert.deepEqual(evaluate('/compare/', auditReport(), THRESHOLDS, { '/compare/': ['label'] }), []);
});

test('an unexplained null audit result fails, but explicit non-applicable results do not', () => {
  assert.match(evaluate('/', auditReport({ score: null }))[0], /audit label returned no score/);
  assert.match(evaluate('/', auditReport({ score: null }), THRESHOLDS, { '/': ['label'] })[0], /audit label returned no score/);
  assert.deepEqual(evaluate('/', auditReport({ score: null, scoreDisplayMode: 'notApplicable' })), []);
});

test('a failing audit in any raw run survives the median score envelope', () => {
  const clean = auditReport({ score: 1 });
  const median = medianReport([clean, auditReport(), clean]);
  assert.match(evaluate('/data-policy/', median)[0], /new accessibility audit label failed/);
});

// The pages the gate measures are written in two places, the script and the comment of the workflow. They must agree,
// and the pages that carry the tables and the comparison have to be among them.
test('the gate measures all twenty-four routes, and the workflow says which pages it measures', () => {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
  const script = readFileSync(join(ROOT, 'scripts/lighthouse-gate.mjs'), 'utf8');
  const workflow = readFileSync(join(ROOT, '.github/workflows/lighthouse.yml'), 'utf8');
  const list = script.match(/const pages = \[([^\]]*)\];/);
  assert.ok(list, 'the page list is found in the script');
  const fixed = [...list[1].matchAll(/'(\/[^']*)'/g)].map((m) => m[1]);
  for (const page of ['/quality/', '/free-gpu/', '/coding-tools/', '/compare/', '/find/', '/data-policy/', '/guides-and-collections/', '/not-free/', '/embed/', '/free-api/qwen/']) assert.ok(fixed.includes(page), `the gate measures ${page}`);
  for (const page of fixed.filter((p) => p !== '/')) assert.ok(workflow.includes(page), `the workflow names ${page}`);
  // four more pages than the fixed ones: the provider page, the model page, one limits page and one alternatives page come from the dataset
  assert.match(script, /pages\.push\(`\/models\/\$\{modelSample\.key\}\/`\)/, 'the gate measures one model page');
  assert.ok(workflow.includes('/models/'), 'the workflow names the model page');
  assert.match(script, /for \(const dir of \['limits', 'alternatives'\]\)/, 'the gate measures one limits and one alternatives page');
  assert.ok(workflow.includes('/limits/') && workflow.includes('/alternatives/'), 'the workflow names them');
  const count = fixed.length + 4;
  const words = { 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 16: 'sixteen', 17: 'seventeen', 18: 'eighteen', 19: 'nineteen', 20: 'twenty', 21: 'twenty-one', 22: 'twenty-two', 23: 'twenty-three', 24: 'twenty-four' };
  assert.ok(workflow.includes(`on ${words[count]} pages`) && workflow.includes(`Measure the ${words[count]} pages`), `the workflow says ${words[count]} pages`);
  assert.ok(script.includes(`on ${words[count]} pages`), `the script header says ${words[count]} pages`);
});

// The runner passes this stricter category budget alongside the existing budgets.
test('SEO budget fails a missing or sub-perfect category', () => {
  const thresholds = { ...THRESHOLDS, seo: 1 };
  const r = report(1, 1);
  assert.deepEqual(evaluate('/guides/example.html', r, thresholds), ['/guides/example.html: seo has no score']);
  r.categories.seo = { score: 0.92 };
  assert.equal(evaluate('/', r, thresholds).length, 1);
  r.categories.seo.score = 1;
  assert.deepEqual(evaluate('/', r, thresholds), []);
});

// Pull requests get accessibility + SEO in one run; performance (median of three) runs on main and nightly.
test('the pull-request mode keeps the accessibility and SEO budgets with one run per page', () => {
  const m = parseMode(['--mode=accessibility-seo']);
  assert.equal(m.runs, 1);
  assert.deepEqual([...m.categories], ['accessibility', 'seo']);
  assert.deepEqual({ ...m.thresholds }, { accessibility: 0.95, seo: 1 });
  // performance is not judged here, so a slow runner cannot fail a pull request
  assert.deepEqual(evaluate('/', { categories: { accessibility: { score: 1 }, seo: { score: 1 }, performance: { score: 0.1 } } }, m.thresholds), []);
  // and an accessibility audit failure still fails with a single run
  const one = auditReport();
  one.categories.seo = { score: 1 };
  assert.match(evaluate('/', medianReport([one]), m.thresholds)[0], /new accessibility audit label failed/);
});

test('the performance mode keeps the median of three and the 0.80 threshold', () => {
  const m = parseMode(['--mode=performance']);
  assert.equal(m.runs, 3);
  assert.deepEqual([...m.categories], ['performance']);
  assert.deepEqual({ ...m.thresholds }, { performance: THRESHOLDS.performance });
  assert.equal(THRESHOLDS.performance, 0.8);
  assert.deepEqual(evaluate('/', medianReport([report(1, 0.78), report(1, 0.91), report(1, 0.93)]), m.thresholds), []);
  assert.equal(evaluate('/', medianReport([report(1, 0.78), report(1, 0.79), report(1, 0.93)]), m.thresholds).length, 1);
});

test('no --mode runs the full single pass, and an unknown mode is refused', () => {
  const m = parseMode([]);
  assert.equal(m.name, 'full');
  assert.equal(m.runs, 3);
  assert.deepEqual({ ...m.thresholds }, { ...THRESHOLDS, seo: 1 });
  assert.throws(() => parseMode(['--mode=fast']), /unknown --mode=fast/);
  assert.throws(() => parseMode(['--mode=toString']), /unknown --mode/);
  assert.ok(Object.isFrozen(MODES) && Object.isFrozen(MODES.performance.thresholds));
});

test('the workflow keeps the required check on pull requests and moves performance to main and nightly', () => {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
  const wf = readFileSync(join(ROOT, '.github/workflows/lighthouse.yml'), 'utf8').replace(/\r\n/g, '\n');
  // The body of one job: from its `  id:` line to the next job or the end of the file.
  const job = (id) => {
    const start = wf.indexOf(`\n  ${id}:\n`);
    assert.ok(start !== -1, `job ${id} exists`);
    const rest = wf.slice(start + id.length + 5);
    const next = rest.search(/^ {2}[a-z-]+:\n/m);
    return next === -1 ? rest : rest.slice(0, next);
  };
  // Triggers: every pull request (no paths filter, or the required check would never report), main, nightly.
  assert.match(wf, /^ {2}pull_request:\s*$/m);
  assert.doesNotMatch(wf, /^\s+paths(-ignore)?:/m);
  assert.match(wf, /^ {2}push:\n {4}branches: \[main\]$/m);
  assert.match(wf, /^ {4}- cron: '[^']+ \* \* \*'/m);
  // The required check name still reports on every pull request, in the deterministic mode.
  const pr = job('lighthouse');
  assert.match(pr, /name: Lighthouse accessibility and performance\n/);
  assert.match(pr, /github\.event_name == 'pull_request'/);
  assert.match(pr, /lighthouse-gate\.mjs --mode=accessibility-seo/);
  // Performance never runs on a pull request.
  const perf = job('performance');
  assert.match(perf, /if: \$\{\{ github\.event_name != 'pull_request' && /);
  // Nor on the regeneration bot's pushes (docs/regeneration-bot.md).
  assert.match(perf, /!\(github\.event_name == 'push' && github\.actor == 'free-llm-api-hub-regen\[bot\]'\)/);
  assert.doesNotMatch(pr, /regen\[bot\]/, 'the required check is never skipped');
  assert.match(perf, /lighthouse-gate\.mjs --mode=performance/);
  // Only the report job may write, only issues, only on main, and it runs no repository code.
  assert.match(wf, /^permissions:\n {2}contents: read$/m);
  const report = job('report');
  assert.match(report, /permissions:\n {6}issues: write\n/);
  assert.match(report, /github\.ref == 'refs\/heads\/main'/);
  assert.doesNotMatch(report, /actions\/checkout|node scripts/);
  assert.doesNotMatch(wf, /contents: write|pull-requests: write|secrets\./);
  // Text from the run reaches the shell only through env, never through an expression inside run:.
  assert.doesNotMatch(report.split('run: |')[1], /\$\{\{/);
});


test('the gate server compresses what the production edge compresses, with the encoding the browser asks for', async () => {
  const { negotiateEncoding } = await import('./lib/lighthouse-gate.mjs');
  const chrome = 'gzip, deflate, br, zstd';
  assert.equal(negotiateEncoding('text/html', chrome), 'br');
  assert.equal(negotiateEncoding('text/css', 'gzip'), 'gzip');
  assert.equal(negotiateEncoding('application/json', 'gzip;q=1.0, br;q=0.5'), 'br');
  assert.equal(negotiateEncoding('image/svg+xml', chrome), 'br');
  assert.equal(negotiateEncoding('text/javascript', ''), null, 'no Accept-Encoding: raw bytes');
  assert.equal(negotiateEncoding('font/woff2', chrome), null, 'fonts are already compressed');
  assert.equal(negotiateEncoding('image/png', chrome), null, 'PNG is already compressed');
  const server = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'lighthouse-gate.mjs'), 'utf8');
  assert.match(server, /negotiateEncoding\(type, req\.headers\['accept-encoding'\]\)/, 'the local server uses it');
});

test('font budget: the local woff2 files a page preloads or declares are summed against the budget', () => {
  // Mutant: count a font twice (preload + @font-face), skip url() references or let an external font through; this test turns red.
  const html = '<link rel="preload" href="../fonts/a.woff2?v=12345678" as="font"><style>@font-face{src:url(\'../fonts/a.woff2?v=12345678\')}'
    + "@font-face{src:url('../fonts/b.woff2')}</style><link rel=\"preload\" href=\"https://cdn.example/x.woff2\" as=\"font\">";
  assert.deepEqual(pageFontUrls(html), ['../fonts/a.woff2', '../fonts/b.woff2'], 'each local file once, without the fingerprint; off-site URLs are not ours');
  const sizes = { '../fonts/a.woff2': 50 * 1024, '../fonts/b.woff2': 30 * 1024 };
  assert.deepEqual(fontBudgetFailures('/p/x.html', html, (f) => sizes[f], 90 * 1024), [], '80 KB fits 90 KB');
  const over = fontBudgetFailures('/p/x.html', html, (f) => sizes[f], 70 * 1024);
  assert.equal(over.length, 1);
  assert.match(over[0], /^\/p\/x\.html: fonts weigh 80\.0 KB, over the 70 KB budget/);
  assert.match(fontBudgetFailures('/', html, (f) => (f.endsWith('a.woff2') ? 1 : null), 90 * 1024)[0], /font \.\.\/fonts\/b\.woff2 is declared but not found/);
});

test('font budget: the committed home page fits the budget with the brand fonts', async () => {
  const { FONT_BUDGET_BYTES } = await import('./lib/assets.mjs');
  const { statSync, existsSync } = await import('node:fs');
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const html = readFileSync(join(root, 'site/index.html'), 'utf8');
  const sizeOf = (f) => (existsSync(join(root, 'site', f)) ? statSync(join(root, 'site', f)).size : null);
  assert.ok(pageFontUrls(html).length >= 3, 'the home declares the brand fonts');
  assert.deepEqual(fontBudgetFailures('/', html, sizeOf, FONT_BUDGET_BYTES), []);
});
