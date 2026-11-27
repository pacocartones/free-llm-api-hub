import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { makeTmpDir } from './lib/tmp.mjs';
import { delimiter, dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOW = readFileSync(join(ROOT, '.github/workflows/lighthouse.yml'), 'utf8');

function reportScript() {
  const lines = WORKFLOW.split('\n');
  const reportAt = lines.findIndex((line) => line === '  report:');
  assert.notEqual(reportAt, -1, 'lighthouse.yml has a report job');
  const runAt = lines.findIndex((line, index) => index > reportAt && /^ {8}run: \|$/.test(line));
  assert.notEqual(runAt, -1, 'the report step has a block run script');
  const body = [];
  for (let i = runAt + 1; i < lines.length; i++) {
    if (lines[i].trim() && !lines[i].startsWith('          ')) break;
    body.push(lines[i].replace(/^ {10}/, ''));
  }
  return body.join('\n');
}

const SCRIPT = reportScript();
const bashAvailable = process.platform !== 'win32' &&
  spawnSync('bash', ['--version'], { encoding: 'utf8' }).status === 0;

function signature(failures) {
  const normalized = failures.split(/\r?\n/).filter(Boolean).sort().join('\n');
  return createHash('sha256').update(normalized + '\n').digest('hex');
}

function runReport({ result = 'failure', failures = '', openIssue = '', previousBody = '' } = {}) {
  // Keep temporary-directory creation centralized in scripts/lib/tmp.mjs.
  const dir = makeTmpDir('lighthouse-report-test-');
  const bin = join(dir, 'bin');
  const stub = join(bin, 'gh');
  const log = join(dir, 'gh.log');
  const bodyOut = join(dir, 'body.out');
  const commentOut = join(dir, 'comment.out');
  const previousBodyFile = join(dir, 'previous-body.md');
  const script = [
    '#!/bin/sh',
    'set -eu',
    'printf \'%s\\n\' "$*" >> "$GH_LOG"',
    'case "$1 $2" in',
    '  "issue list")',
    '    if [ -n "$GH_OPEN_ISSUE" ]; then printf \'%s\\n\' "$GH_OPEN_ISSUE"; fi',
    '    ;;',
    '  "issue view")',
    '    cat "$GH_PREVIOUS_BODY_FILE"',
    '    ;;',
    '  "issue edit")',
    '    shift 2',
    '    while [ "$#" -gt 0 ]; do',
    '      if [ "$1" = "--body-file" ]; then cp "$2" "$GH_BODY_OUT"; shift 2; else shift; fi',
    '    done',
    '    ;;',
    '  "issue create")',
    '    shift 2',
    '    while [ "$#" -gt 0 ]; do',
    '      if [ "$1" = "--body-file" ]; then cp "$2" "$GH_BODY_OUT"; shift 2; else shift; fi',
    '    done',
    '    ;;',
    '  "issue comment")',
    '    shift 2',
    '    while [ "$#" -gt 0 ]; do',
    '      if [ "$1" = "--body-file" ]; then cp "$2" "$GH_COMMENT_OUT"; shift 2; else shift; fi',
    '    done',
    '    ;;',
    '  "issue close")',
    '    ;;',
    '  *)',
    '    echo "unexpected gh command: $*" >&2',
    '    exit 2',
    '    ;;',
    'esac',
    ''
  ].join('\n');
  // The GitHub CLI stub records calls and captures body files; no network access is used.
    mkdirSync(bin, { recursive: true });
    writeFileSync(stub, script);
    chmodSync(stub, 0o755);
    writeFileSync(previousBodyFile, previousBody);
    const run = spawnSync('bash', ['-e', '-u', '-o', 'pipefail', '-c', SCRIPT], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: bin + delimiter + (process.env.PATH || ''),
        GH_LOG: log,
        GH_BODY_OUT: bodyOut,
        GH_COMMENT_OUT: commentOut,
        GH_PREVIOUS_BODY_FILE: previousBodyFile,
        GH_OPEN_ISSUE: openIssue,
        RESULT: result,
        FAILURES: failures,
        RUN_URL: 'https://github.com/pacocartones/free-llm-api-hub/actions/runs/123',
        COMMIT: 'abc123def456',
      },
    });
    assert.equal(run.status, 0, 'report script failed:\n' + run.stderr + '\n' + run.stdout);
    return {
      log: readFileSync(log, 'utf8'),
      body: (() => { try { return readFileSync(bodyOut, 'utf8'); } catch { return ''; } })(),
      comment: (() => { try { return readFileSync(commentOut, 'utf8'); } catch { return ''; } })(),
  };
}

test('Lighthouse report permissions and issue lifecycle stay narrow', () => {
  const report = WORKFLOW.slice(WORKFLOW.indexOf('\n  report:\n'));
  const top = WORKFLOW.split('\njobs:\n')[0];
  assert.match(top, /\npermissions:\n  contents: read\n/);
  assert.match(report, /permissions:\n      issues: write\n/);
  assert.doesNotMatch(report, /actions\/checkout|npm ci|node scripts\//);
  assert.match(report, /--label bug --label area:site/);
  assert.match(report, /gh issue edit/);
  assert.match(report, /gh issue close "\$number" --reason completed/);
  assert.match(report, /lighthouse-failure-signature/);
});

test('a new failure episode opens one issue with bug and area:site labels', { skip: !bashAvailable }, () => {
  const failures = '/: performance 0.78 is below 0.80\n/best/: performance 0.79 is below 0.80';
  const out = runReport({ failures });
  assert.match(out.log, /issue create .*--label bug .*--label area:site/);
  assert.doesNotMatch(out.log, /issue comment|issue edit|issue close/);
  assert.match(out.body, /Latest result: FAILURE/);
  assert.match(out.body, /abc123def456/);
  assert.match(out.body, /actions\/runs\/123/);
  assert.match(out.body, /UTC:/);
  assert.match(out.body, /performance 0\.78/);
  assert.match(out.body, /lighthouse-failure-signature/);
});

test('an unchanged failure refreshes the issue body without adding a comment', { skip: !bashAvailable }, () => {
  const failures = '/: performance 0.78 is below 0.80\n/best/: performance 0.79 is below 0.80';
  const marker = '<!-- lighthouse-failure-signature: ' + signature(failures) + ' -->';
  const previousBody = 'Old run\n\n' + marker + '\n';
  const out = runReport({ failures, openIssue: '914', previousBody });
  assert.match(out.log, /issue edit 914 --body-file/);
  assert.doesNotMatch(out.log, /issue comment|issue close|issue create/);
  assert.match(out.body, /abc123def456/);
  assert.match(out.body, /actions\/runs\/123/);
});

test('a changed failing page or score refreshes the body and adds one comment', { skip: !bashAvailable }, () => {
  const previousFailures = '/: performance 0.78 is below 0.80';
  const latestFailures = '/: performance 0.78 is below 0.80\n/best/: performance 0.79 is below 0.80';
  const marker = '<!-- lighthouse-failure-signature: ' + signature(previousFailures) + ' -->';
  const out = runReport({ failures: latestFailures, openIssue: '914', previousBody: marker });
  assert.match(out.log, /issue edit 914 --body-file/);
  assert.match(out.log, /issue comment 914 --body-file/);
  assert.match(out.body, /best\/: performance 0\.79/);
  assert.match(out.comment, /Latest result: FAILURE/);
});

test('the first clean run updates and closes the active issue without a recovery comment', { skip: !bashAvailable }, () => {
  const out = runReport({ result: 'success', openIssue: '914', previousBody: 'Previous failure' });
  assert.match(out.log, /issue edit 914 --body-file/);
  assert.match(out.log, /issue close 914 --reason completed/);
  assert.doesNotMatch(out.log, /issue comment|issue create/);
  assert.match(out.body, /Latest result: CLEAN/);
  assert.match(out.body, /abc123def456/);
});
