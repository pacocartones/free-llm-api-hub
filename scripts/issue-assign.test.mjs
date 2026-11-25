import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { makeTmpDir } from './lib/tmp.mjs';

const skip = process.platform === 'win32' ? 'workflow shell, checked on Linux' : false;
const workflow = readFileSync(new URL('../.github/workflows/issue-assign.yml', import.meta.url), 'utf8');
const contributing = readFileSync(new URL('../CONTRIBUTING.md', import.meta.url), 'utf8');
const script = workflow.split('        run: |\n')[1].split('\n').map((line) => line.replace(/^          /, '')).join('\n');
const MAX_OPEN = Number(workflow.match(/^\s+MAX_OPEN: '(\d+)'$/m)?.[1]);
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five'];

// Runs the workflow's own shell with a local gh double: `gh issue list` answers OPEN (the commenter's open assigned issues),
// and every gh call is logged. No GitHub calls.
function run(body, { labels = [], assignees = [], open = 0, author = 'newcomer' } = {}) {
  const dir = makeTmpDir('assign-workflow-');
  const log = join(dir, 'calls');
  writeFileSync(join(dir, 'gh'), [
    '#!/usr/bin/env bash',
    'printf "%s\\n" "$*" >> "$CALL_LOG"',
    'if [ "$1 $2" = "issue list" ]; then printf "%s\\n" "$OPEN"; fi',
    '',
  ].join('\n'), { mode: 0o755 });
  const result = spawnSync('bash', ['-c', script], { encoding: 'utf8', env: {
    ...process.env, PATH: `${dir}:${process.env.PATH}`, CALL_LOG: log, OPEN: String(open),
    GH_TOKEN: '', REPO: 'test/repo', ISSUE: '7', AUTHOR: author, BODY: body,
    LABELS: JSON.stringify(labels), ASSIGNEES: JSON.stringify(assignees),
    MAX_OPEN: String(MAX_OPEN), RULES: 'https://example.test/rules',
  } });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return existsSync(log) ? readFileSync(log, 'utf8') : '';
}

test('the per-person limit is set once in the workflow and matches CONTRIBUTING', () => {
  assert.ok(Number.isInteger(MAX_OPEN) && MAX_OPEN > 0, 'issue-assign.yml sets MAX_OPEN in its step env');
  const word = WORDS[MAX_OPEN];
  assert.match(contributing, new RegExp(`fewer than ${word} open issues assigned`), 'Claiming an issue states the limit');
  assert.match(contributing, new RegExp(`at most ${word} open assigned issues`), 'the Programs section states the limit');
  assert.doesNotMatch(script, /-ge\s+\d/, 'the script compares against $MAX_OPEN, not a number of its own');
});

test('/take assigns while the commenter is under the limit', { skip }, () => {
  const log = run('/take', { open: MAX_OPEN - 1 });
  assert.match(log, /issue edit 7 --repo test\/repo --add-assignee newcomer/);
  assert.match(log, /assigned to you/);
  assert.match(log, /7 days during a program/);
});

test('/take refuses at the limit and says what the limit is', { skip }, () => {
  const log = run('/TAKE please', { open: MAX_OPEN });
  assert.doesNotMatch(log, /--add-assignee/);
  assert.match(log, new RegExp(`the limit is ${MAX_OPEN} per person`));
});

test('/take never assigns a data good first issue or an issue that already has an assignee', { skip }, () => {
  const data = run('/take', { labels: ['good first issue', 'data'] });
  assert.doesNotMatch(data, /--add-assignee|issue list/);
  assert.match(data, /first correct, sourced PR is merged/);
  const taken = run('/take', { assignees: ['someone'] });
  assert.doesNotMatch(taken, /--add-assignee/);
  assert.match(taken, /already assigned to @someone/);
  assert.equal(run('/take', { assignees: ['newcomer'] }), '', 'taking your own issue again is silent');
});

test('/release unassigns only the commenter, and other comments do nothing', { skip }, () => {
  assert.match(run('/release', { assignees: ['newcomer'] }), /--remove-assignee newcomer/);
  assert.equal(run('/release', { assignees: ['someone'] }), '');
  assert.equal(run('thanks, I will /take a look'), '', 'the command must be the first word');
});
