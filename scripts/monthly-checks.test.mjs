import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { CHECKS, renderReport, TITLE_PREFIX } from './monthly-checks.mjs';

const FENCE = '`'.repeat(3);

test('every monthly check points at an existing script', () => {
  for (const c of CHECKS) assert.ok(existsSync(new URL(`../${c.script}`, import.meta.url)), c.script);
});

test('a clean run says so and prints no output blocks', () => {
  const body = renderReport(CHECKS.map((c) => ({ name: c.name, ok: true, output: 'fine' })), { month: '2026-12' });
  assert.match(body, /All 3 checks passed/);
  assert.ok(!body.includes(FENCE));
});

test('a failing check is listed with the tail of its output, ANSI stripped and fences neutralised', () => {
  const noisy = Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n') + `\n\x1b[31m✗ dead\x1b[0m ${FENCE}`;
  const body = renderReport([{ name: 'A', ok: true, output: '' }, { name: 'B', ok: false, output: noisy }], { month: '2026-12', runUrl: 'https://example.invalid/run' });
  assert.match(body, /1 of 2 checks need attention/);
  assert.match(body, /### B/);
  assert.match(body, /earlier lines omitted/);
  assert.ok(!body.includes('line 0\n'));
  assert.ok(!body.includes('\x1b'));
  assert.equal(body.split(FENCE).length - 1, 2, 'only the opening and closing fence remain');
  assert.match(body, /re-check from a normal connection/);
});

test('the workflow runs the routine monthly with the least permissions it needs', () => {
  const wf = readFileSync(new URL('../.github/workflows/monthly-checks.yml', import.meta.url), 'utf8');
  assert.match(wf, /cron: '[^']+ 1 \* \*'/, 'runs on the first of the month');
  assert.match(wf, /^permissions: \{\}$/m, 'no default token permissions');
  assert.match(wf, /issues: write/);
  assert.doesNotMatch(wf, /contents: write|pull-requests: write/);
  assert.match(wf, /node scripts\/monthly-checks\.mjs --publish/);
  assert.ok(TITLE_PREFIX.length > 5);
});
