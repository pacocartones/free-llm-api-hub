import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { evaluate, medianReport, THRESHOLDS } from './lib/lighthouse-gate.mjs';

const report = (accessibility, performance) => ({ categories: { accessibility: { score: accessibility }, performance: { score: performance } } });

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

// The pages the gate measures are written in two places, the script and the comment of the workflow. They must agree,
// and the pages that carry the tables and the comparison have to be among them.
test('the gate measures /free-gpu/ and /coding-tools/, and the workflow says which pages it measures', () => {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
  const script = readFileSync(join(ROOT, 'scripts/lighthouse-gate.mjs'), 'utf8');
  const workflow = readFileSync(join(ROOT, '.github/workflows/lighthouse.yml'), 'utf8');
  const list = script.match(/const pages = \[([^\]]*)\];/);
  assert.ok(list, 'the page list is found in the script');
  const fixed = [...list[1].matchAll(/'(\/[^']*)'/g)].map((m) => m[1]);
  for (const page of ['/free-gpu/', '/coding-tools/']) assert.ok(fixed.includes(page), `the gate measures ${page}`);
  for (const page of fixed.filter((p) => p !== '/')) assert.ok(workflow.includes(page), `the workflow names ${page}`);
  // one more page than the fixed ones: the provider page comes from the dataset
  const count = fixed.length + 1;
  const words = { 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight' };
  assert.ok(workflow.includes(`on ${words[count]} pages`) && workflow.includes(`Measure the ${words[count]} pages`), `the workflow says ${words[count]} pages`);
});
