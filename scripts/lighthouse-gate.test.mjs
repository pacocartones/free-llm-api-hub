import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { evaluate, medianReport, parseMode, MODES, THRESHOLDS } from './lib/lighthouse-gate.mjs';

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
test('the gate measures all seventeen routes, and the workflow says which pages it measures', () => {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
  const script = readFileSync(join(ROOT, 'scripts/lighthouse-gate.mjs'), 'utf8');
  const workflow = readFileSync(join(ROOT, '.github/workflows/lighthouse.yml'), 'utf8');
  const list = script.match(/const pages = \[([^\]]*)\];/);
  assert.ok(list, 'the page list is found in the script');
  const fixed = [...list[1].matchAll(/'(\/[^']*)'/g)].map((m) => m[1]);
  for (const page of ['/free-gpu/', '/coding-tools/', '/compare/', '/data-policy/', '/guides-and-collections/']) assert.ok(fixed.includes(page), `the gate measures ${page}`);
  for (const page of fixed.filter((p) => p !== '/')) assert.ok(workflow.includes(page), `the workflow names ${page}`);
  // two more pages than the fixed ones: the provider page and the model page come from the dataset
  assert.match(script, /pages\.push\(`\/models\/\$\{modelSample\.key\}\/`\)/, 'the gate measures one model page');
  assert.ok(workflow.includes('/models/'), 'the workflow names the model page');
  const count = fixed.length + 2;
  const words = { 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 16: 'sixteen', 17: 'seventeen' };
  assert.ok(workflow.includes(`on ${words[count]} pages`) && workflow.includes(`Measure the ${words[count]} pages`), `the workflow says ${words[count]} pages`);
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
  assert.match(perf, /if: \$\{\{ github\.event_name != 'pull_request' \}\}/);
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

