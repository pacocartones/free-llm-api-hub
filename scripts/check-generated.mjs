#!/usr/bin/env node
// The generated-output drift gate: the last step of `npm run check`, and verify.yml's gate outside push mode.
//
// It follows the regeneration mode (docs/regeneration-bot.md): REGEN_MODE when set, else .github/regen-mode.
//   push         CI's push-mode gate, `regenerate-guard.mjs drift-gate`, against BASE (default: the merge base of
//                HEAD and origin/main). Stale derived files the branch did not touch pass: the bot regenerates them
//                after the merge. Derived files the branch edited that do not match the build, a release that is not
//                regenerated, and drift outside the bot's allowlist fail.
//   other modes  strict: every derived file must match the build, and the build may not write an uncommitted one.
//   --strict     the strict gate in any mode (a release tag, or verify.yml outside push mode).
// With GITHUB_STEP_SUMMARY set, the strict gate also writes what to do to the run summary.
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatedTargets, isGeneratedOutput, parseNul, STATIC_TARGETS } from './generated-targets.mjs';
import { isRegenerationTarget, parseMode } from './lib/regenerate.mjs';

const summary = (lines) => { if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`); };
const gitPaths = (args) => parseNul(execFileSync('git', args, { encoding: 'utf8' }));

let modeFile = '';
try { modeFile = readFileSync('.github/regen-mode', 'utf8'); } catch { /* no file: off, the strict gate */ }
const mode = parseMode(process.env.REGEN_MODE || modeFile);

if (mode === 'push' && !process.argv.includes('--strict')) {
  let base = process.env.BASE ?? '';
  if (!base) {
    const r = spawnSync('git', ['merge-base', 'HEAD', 'origin/main'], { encoding: 'utf8' });
    base = r.status === 0 ? r.stdout.trim() : '';
  }
  if (!base) {
    console.error('check: push mode compares the branch with its base, and origin/main is not available. Run `git fetch origin main`, set BASE=<full sha>, or pass --strict.');
    process.exit(2);
  }
  console.log(`check: REGEN_MODE=push, comparing with ${base.slice(0, 10)} (--strict for the full drift gate)`);
  const uncommitted = gitPaths(['diff', '--name-only', '-z', 'HEAD']).filter((p) => !isRegenerationTarget(p));
  if (uncommitted.length) console.log(`check: commit your source changes first: the gate counts uncommitted ones (${uncommitted.length}) as drift the bot may not write.`);
  const guard = join(dirname(fileURLToPath(import.meta.url)), 'regenerate-guard.mjs');
  const r = spawnSync(process.execPath, [guard, 'drift-gate'], { stdio: 'inherit', env: { ...process.env, REGEN_MODE: 'push', BASE: base } });
  process.exit(r.status ?? 1);
}

const targets = generatedTargets(gitPaths(['ls-files', '-z', '--', 'site/']));
const diff = spawnSync('git', ['diff', '--quiet', '--', ...targets]);
const untracked = gitPaths(['ls-files', '-z', '--others', '--exclude-standard', '--', 'site/', ...STATIC_TARGETS]).filter(isGeneratedOutput);

if (diff.status === 0 && untracked.length === 0) {
  console.log('Generated files are in sync.');
  summary(['Generated files are in sync.']);
  process.exit(0);
}

const stat = diff.status === 0 ? '' : execFileSync('git', ['--no-pager', 'diff', '--stat', '--', ...targets], { encoding: 'utf8' }).trimEnd();
if (stat) {
  spawnSync('git', ['--no-pager', 'diff', '--', ...targets], { stdio: 'inherit' });
  console.error(stat);
}
if (untracked.length) console.error(['Written by the build and not committed:', ...untracked].join('\n'));
summary([
  '### Regenerate the derived files and commit them in this PR', '',
  'Run `npm run build` (and `npm run og` if the OG check flagged drift), commit the regenerated files together with the data change, then push again.', '',
  '```', ...(stat ? [stat] : []), ...(untracked.length ? ['Written by the build and not committed:', ...untracked] : []), '```',
]);
process.exit(1);
