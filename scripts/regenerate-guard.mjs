#!/usr/bin/env node
// regenerate-guard.mjs — the checks of .github/workflows/regenerate.yml (logic in scripts/lib/regenerate.mjs).
//
//   git diff --cached --name-only -z | node scripts/regenerate-guard.mjs allowlist
//       exits 1 and lists every changed path that is not a generated target
//   REGEN_MODE=… EVENT=… ACTOR=… BOT_LOGIN=… node scripts/regenerate-guard.mjs gate
//       prints mode=<off|shadow|push> and run=<true|false> (also to $GITHUB_OUTPUT); reads main's tip message from git
//   REGEN_MODE=… node scripts/regenerate-guard.mjs mode
//       prints mode=<off|shadow|push> (also to $GITHUB_OUTPUT), so every workflow parses the variable the same way
//   REGEN_MODE=… BASE=<sha> node scripts/regenerate-guard.mjs drift-gate
//       the blocking drift gate of verify.yml in push mode (driftGate): after a build, exits 1 only for hand-edited
//       derived files, a release that is not regenerated, or drift outside the allowlist; prints verdict=, block= and
//       changed= (also to $GITHUB_OUTPUT). Also `npm run check` in push mode (scripts/check-generated.mjs).
//   REGEN_MODE=… EVENT=… ACTOR=… BOT_LOGIN=… [BEFORE=<sha>] [CONCLUSION=… HEAD_BRANCH=…] node scripts/regenerate-guard.mjs pages-gate
//       prints deploy=<true|false> (also to $GITHUB_OUTPUT): whether pages.yml deploys this run (pagesDeploy)
//
// No npm dependencies: the publish job runs it without `npm ci`.
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { parseNul } from './generated-targets.mjs';
import {
  datasetVersion, driftGate, isRegenerationTarget, loopGuard, outsideAllowlist, pagesDeploy, parseMode,
} from './lib/regenerate.mjs';

const [command] = process.argv.slice(2);
const git = (args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const output = (text) => {
  process.stdout.write(text);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, text);
};

// What the pull request (base..HEAD) touched, what a build changed on top of HEAD, and whether it is a release.
// Of the files nobody committed only the regeneration targets count (a test may leave a scratch file behind).
const collect = () => {
  const base = process.env.BASE;
  if (!/^[0-9a-f]{40}$/.test(base ?? '')) {
    console.error(`${command}: BASE must be the full SHA of the base commit`);
    process.exit(2);
  }
  const touched = parseNul(git(['diff', '--name-only', '-z', base, 'HEAD']));
  const drift = [...new Set([
    ...parseNul(git(['diff', '--name-only', '-z', 'HEAD'])),
    ...parseNul(git(['ls-files', '-z', '--others', '--exclude-standard'])).filter(isRegenerationTarget),
  ])].sort();
  let baseText = '';
  try { baseText = git(['show', `${base}:data/providers.json`]); } catch { /* not in the base: not a release */ }
  const before = datasetVersion(baseText);
  const after = datasetVersion(readFileSync('data/providers.json', 'utf8'));
  return { touched, drift, before, after, release: before !== null && after !== null && before !== after };
};
const fence = (paths, max = 200) => ['```', ...paths.slice(0, max), ...(paths.length > max ? [`… and ${paths.length - max} more`] : []), '```', ''];

if (command === 'allowlist') {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  const paths = parseNul(input);
  const bad = outsideAllowlist(paths);
  if (bad.length) {
    console.error(`::error title=Regeneration outside the allowlist::${bad.length} path(s) are not generated targets; nothing was written.`);
    for (const p of bad) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log(`allowlist: ${paths.length} changed path(s), all generated targets`);
} else if (command === 'gate') {
  const headMessage = execFileSync('git', ['log', '-1', '--format=%B', 'HEAD'], { encoding: 'utf8' });
  const mode = parseMode(process.env.REGEN_MODE);
  const { run, reason } = loopGuard({
    mode, event: process.env.EVENT, actor: process.env.ACTOR, botLogin: process.env.BOT_LOGIN, headMessage,
  });
  const out = `mode=${mode}\nrun=${run}\n`;
  process.stdout.write(out);
  console.log(`reason: ${reason}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, out);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Regeneration ${run ? 'runs' : 'skipped'}: ${reason}.\n`);
} else if (command === 'mode') {
  output(`mode=${parseMode(process.env.REGEN_MODE)}\n`);
} else if (command === 'drift-gate') {
  const { touched, drift, before, after, release } = collect();
  const { mode, verdict, block, reason, handEdited, outside } = driftGate({ mode: process.env.REGEN_MODE, release, touched, drift });
  output(`verdict=${verdict}\nblock=${block}\nchanged=${drift.length > 0}\n`);
  const lines = [`### Derived files (REGEN_MODE=${mode})`, '', `Verdict: \`${verdict}\`. ${block ? 'Blocking' : 'Passing'}: ${reason}.`, ''];
  if (verdict === 'bot-would-regenerate' && !block) {
    lines.push('Nothing to do: after the merge the regeneration bot commits these files to main. Do not commit them in this pull request.', '');
  }
  if (verdict === 'would-block-release') lines.push(`Release ${before} → ${after}: run \`npm run build\` (and \`npm run og\`) and commit every derived file.`, '');
  if (handEdited.length) {
    lines.push('This pull request changes these derived files, and they do not match the build. Drop the changes (`git checkout origin/main -- <file>`) and let the bot regenerate them, or run `npm run build` on a branch that is up to date with main and commit the result:', ...fence(handEdited));
  }
  if (outside.length) lines.push('The build changed paths the bot may not write (a bug in the generator or the allowlist):', ...fence(outside));
  if (drift.length) {
    lines.push(`${drift.length} derived file(s) differ from a fresh build:`, ...fence(drift));
    if (process.env.GITHUB_EVENT_NAME === 'pull_request') lines.push('They are the `regen-preview-patch` artifact of this run (`git apply --binary regen-preview.patch`).', '');
  }
  lines.push('See docs/regeneration-bot.md.');
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
  console.log(lines.join('\n'));
  if (block) {
    console.log(`::error title=Derived files::${reason}. See the run summary.`);
    process.exit(1);
  }
} else if (command === 'pages-gate') {
  const event = process.env.EVENT ?? '';
  let changed = null;
  const before = process.env.BEFORE ?? '';
  if (event === 'push' && /^[0-9a-f]{40}$/.test(before) && !/^0+$/.test(before)) {
    try { changed = parseNul(git(['diff', '--name-only', '-z', before, 'HEAD'])); } catch { changed = null; }
  }
  const { deploy, reason } = pagesDeploy({
    mode: process.env.REGEN_MODE, event, actor: process.env.ACTOR, botLogin: process.env.BOT_LOGIN, changed,
    conclusion: process.env.CONCLUSION, headBranch: process.env.HEAD_BRANCH,
    headMessage: event === 'push' ? git(['log', '-1', '--format=%B', 'HEAD']) : '',
  });
  output(`deploy=${deploy}\n`);
  console.log(`reason: ${reason}`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Deploy ${deploy ? 'runs' : 'skipped'}: ${reason}.\n`);
} else {
  console.error('usage: regenerate-guard.mjs allowlist|gate|mode|drift-gate|pages-gate');
  process.exit(2);
}
