#!/usr/bin/env node
// Preview repository metadata by default; only --write can replace issue #4's body.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stalenessWorklist } from './staleness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENDPOINT = 'repos/pacocartones/free-llm-api-hub/issues/4';
const PROCESS_OPTIONS = { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000, maxBuffer: 1024 * 1024 };

export function worklistIssueBody(providers, now, sourceSha) {
  if (!(now instanceof Date) || !Number.isFinite(+now)) throw new Error('Invalid clock');
  if (typeof sourceSha !== 'string' || !/^[a-f0-9]{40}$/.test(sourceSha)) throw new Error('Invalid source SHA');
  return [
    `Worklist refreshed: **${now.toISOString().slice(0, 10)} UTC**.`,
    `Dataset: [data/providers.json](https://github.com/pacocartones/free-llm-api-hub/blob/${sourceSha}/data/providers.json).`,
    '',
    '**Worklist refresh only; provider claims were not re-verified.**',
    '',
    'This entire issue body is generated and replaced on each refresh, resetting checkboxes. Keep discussion in comments; checked boxes are not evidence of completed provider verification.',
    '',
    stalenessWorklist(providers, now),
    '',
  ].join('\n');
}

export function updateWorklistIssue(body, runGh) {
  const current = JSON.parse(runGh(['api', ENDPOINT]));
  if (!current || current.number !== 4 || current.state !== 'open' || typeof current.body !== 'string' || Object.hasOwn(current, 'pull_request')) {
    throw new Error('Expected open issue #4 with a string body, not a pull request');
  }
  if (current.body === body) return false;
  const updated = JSON.parse(runGh(['api', '--method', 'PATCH', ENDPOINT, '--input', '-'], JSON.stringify({ body })));
  if (!updated || updated.number !== 4 || updated.body !== body) {
    throw new Error('Issue #4 PATCH response did not match the requested body');
  }
  return true;
}

function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--write')) {
    console.error('Unknown argument; only --write is supported.');
    process.exitCode = 1;
    return;
  }
  const { providers } = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8'));
  const now = new Date();
  const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { ...PROCESS_OPTIONS, cwd: ROOT }).trim();
  const body = worklistIssueBody(providers, now, sourceSha);
  if (!args.includes('--write')) {
    process.stdout.write(body);
    return;
  }
  const changed = updateWorklistIssue(body, (ghArgs, input) => execFileSync('gh', ghArgs, { ...PROCESS_OPTIONS, input }));
  console.log(changed ? 'Updated issue #4 worklist.' : 'Issue #4 worklist unchanged; skipped PATCH.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); }
  catch {
    // Do not print child-process errors: they may include credentials or response bodies.
    console.error('Worklist refresh failed. Check arguments, git HEAD, and access to open issue #4.');
    process.exitCode = 1;
  }
}
