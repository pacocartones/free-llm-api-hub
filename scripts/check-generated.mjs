#!/usr/bin/env node
// Portable generated-output drift gate used by `npm run check`.
import { execFileSync, spawnSync } from 'node:child_process';
import { generatedTargets, isGenerated, parseNul } from './generated-targets.mjs';

const gitPaths = (args) => parseNul(execFileSync('git', args, { encoding: 'utf8' }));
const targets = generatedTargets(gitPaths(['ls-files', '-z', '--', 'site/']));
const diff = spawnSync('git', ['diff', '--exit-code', '--', ...targets], { stdio: 'inherit' });

if (diff.status !== 0) process.exit(1);

const untracked = gitPaths(['ls-files', '-z', '--others', '--exclude-standard', '--', 'site/']).filter(isGenerated);
if (untracked.length) {
  console.error('Written by the build and not committed:');
  for (const path of untracked) console.error(path);
  process.exit(1);
}

console.log('Generated files are in sync.');
