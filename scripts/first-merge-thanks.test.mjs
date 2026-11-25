import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { makeTmpDir } from './lib/tmp.mjs';
import { shellSkip } from './lib/test-tools.mjs';

const skip = shellSkip('workflow shell', ['jq']);
const workflow = readFileSync(new URL('../.github/workflows/first-merge-thanks.yml', import.meta.url), 'utf8');
const script = workflow.split('        run: |\n')[1].split('\n').map((line) => line.replace(/^          /, '')).join('\n');
// Open good first issues as the API lists them: #1 code, #2 data, #3 data but assigned, #4 data but blocked,
// #5 a pull request, #6 data. Only #1, #2 and #6 may be suggested.
const ISSUES = JSON.stringify([
  { number: 1, labels: [{ name: 'good first issue' }, { name: 'chore' }], assignees: [] },
  { number: 2, labels: [{ name: 'good first issue' }, { name: 'data' }], assignees: [] },
  { number: 3, labels: [{ name: 'good first issue' }, { name: 'data' }], assignees: [{ login: 'someone' }] },
  { number: 4, labels: [{ name: 'good first issue' }, { name: 'data' }, { name: 'blocked' }], assignees: [] },
  { number: 5, labels: [{ name: 'good first issue' }], assignees: [], pull_request: {} },
  { number: 6, labels: [{ name: 'good first issue' }, { name: 'data' }], assignees: [] },
]);
function run(author, type = 'User', { labels = '[]', failIssues = false } = {}) {
  const dir = makeTmpDir('thanks-workflow-');
  const log = join(dir, 'calls');
  // Run the actual workflow shell with a local gh double; no GitHub calls.
  writeFileSync(join(dir, 'issues.json'), ISSUES);
  writeFileSync(join(dir, 'gh'), [
    '#!/usr/bin/env bash',
    'printf "%s\n" "$*" >> "$CALL_LOG"',
    'if [[ "$*" == *"labels=good"* ]]; then [ -n "$FAIL_ISSUES" ] && exit 1; cat "$ISSUES_FILE"; exit 0; fi',
    'if [[ "$*" == *"--paginate"* ]]; then printf \'[{"user":{"login":"outside-contributor"},"merged_at":"2026-01-01"}]\'; fi',
    '',
  ].join('\n'), { mode: 0o755 });
  const result = spawnSync('bash', ['-c', script], { encoding: 'utf8', env: {
    ...process.env, PATH: `${dir}:${process.env.PATH}`, CALL_LOG: log, ISSUES_FILE: join(dir, 'issues.json'),
    FAIL_ISSUES: failIssues ? '1' : '', PR_LABELS: labels,
    AUTHOR: author, AUTHOR_TYPE: type, GH_TOKEN: '', REPO: 'test/repo', NUMBER: '1',
  } });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return existsSync(log) ? readFileSync(log, 'utf8') : '';
}
for (const author of ['pacocartones', 'LeonMAG']) {
  test(`first-merge thanks makes no API call for maintainer ${author}`, { skip }, () => {
    assert.equal(run(author), '');
  });
}
test('first-merge thanks skips bots and still thanks a first external contribution', { skip }, () => {
  assert.equal(run('dependabot[bot]', 'Bot'), '');
  assert.match(run('outside-contributor'), /-X POST repos\/test\/repo\/issues\/1\/comments/);
});
test('first-merge thanks suggests two open, unassigned good first issues of the other kind first', { skip }, () => {
  const code = run('outside-contributor');
  assert.match(code, /- #2\n- #6\n/, 'a code pull request is pointed at data issues');
  assert.doesNotMatch(code, /- #[345]\b/, 'never assigned, blocked or pull requests');
  assert.match(code, /CONTRIBUTORS\.md/);
  const data = run('outside-contributor', 'User', { labels: '["data"]' });
  assert.match(data, /- #1\n- #2\n/, 'a data pull request is pointed at a code issue first, then filled up');
});
test('first-merge thanks falls back to the filtered list when the issue lookup fails', { skip }, () => {
  const log = run('outside-contributor', 'User', { failIssues: true });
  assert.doesNotMatch(log, /- #\d/);
  assert.match(log, /label%3A%22good\+first\+issue%22\+no%3Aassignee/);
  assert.match(log, /-X POST repos\/test\/repo\/issues\/1\/comments/);
});
