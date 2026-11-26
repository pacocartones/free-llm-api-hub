#!/usr/bin/env node
// Decides whether the Lighthouse jobs measure this change (.github/workflows/lighthouse.yml). The rule is
// lighthouseScope() in scripts/lib/lighthouse-scope.mjs; this script only finds the changed files.
//
// Inputs (environment): EVENT (github.event_name), BASE and HEAD (the range to compare). A pull request compares the
// merge commit with its first parent (the base branch); a push compares github.event.before with the pushed commit.
// Every other event (nightly, manual run) and any range git cannot resolve measures the site.
//
// Output: `run=true|false` in $GITHUB_OUTPUT (printed when it is not set) and one line in the step summary. It never
// fails: a skipped measurement still lets the required check report success.
import { appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { lighthouseScope } from './lib/lighthouse-scope.mjs';

const { EVENT = '', BASE = '', HEAD = 'HEAD', GITHUB_OUTPUT, GITHUB_STEP_SUMMARY } = process.env;

function changedFiles() {
  if (EVENT !== 'pull_request' && EVENT !== 'push') return null;
  if (!BASE || /^0+$/.test(BASE)) return null; // a new branch has no "before"
  const diff = spawnSync('git', ['diff', '--name-only', '-z', BASE, HEAD, '--'], { encoding: 'utf8' });
  if (diff.status !== 0) return null;
  return diff.stdout.split('\0').filter(Boolean);
}

const files = changedFiles();
const { run, reason } = files === null
  ? { run: true, reason: `a ${EVENT || 'manual'} run always measures the site` }
  : lighthouseScope(files);

const line = run ? `Lighthouse runs: ${reason}.` : `Lighthouse skipped: ${reason}. The check reports success without measuring.`;
console.log(line);
if (GITHUB_OUTPUT) appendFileSync(GITHUB_OUTPUT, `run=${run}\n`);
else console.log(`run=${run}`);
if (GITHUB_STEP_SUMMARY) appendFileSync(GITHUB_STEP_SUMMARY, `${line}\n`);
