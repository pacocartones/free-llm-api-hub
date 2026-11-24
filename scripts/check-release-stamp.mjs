#!/usr/bin/env node
// check-release-stamp.mjs — `generated` in data/providers.json moves only with `version`.
//
// Compares data/providers.json at a base revision with the working tree (rules in lib/release-stamp.mjs).
// The base is `--base <rev>`, else HEAD^1: in a pull request CI checks out the merge commit, whose first parent
// is the base branch; on main it is the previous main. With no base to compare (first commit, shallow clone,
// file absent) it says so and passes: validate.mjs still applies every other date rule.
//
//   node scripts/check-release-stamp.mjs                   against HEAD^1
//   node scripts/check-release-stamp.mjs --base origin/main
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { releaseStampErrors } from './lib/release-stamp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const at = process.argv.indexOf('--base');
const base = at > 0 ? process.argv[at + 1] : 'HEAD^1';
if (!base || base.startsWith('-')) { console.error('Usage: node scripts/check-release-stamp.mjs [--base <rev>]'); process.exit(2); }

let baseData;
try {
  baseData = JSON.parse(execFileSync('git', ['show', `${base}:data/providers.json`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
} catch {
  console.log(`Release stamp: no data/providers.json at ${base} to compare with; skipped.`);
  process.exit(0);
}
const head = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8'));
const errors = releaseStampErrors(baseData, head);
if (errors.length) {
  for (const e of errors) console.error('✗ ' + e);
  process.exit(1);
}
console.log(head.version === baseData.version
  ? `Release stamp: generated ${head.generated} unchanged (dataset ${head.version}, no release).`
  : `Release stamp: release ${baseData.version} → ${head.version}, generated ${baseData.generated} → ${head.generated}.`);
