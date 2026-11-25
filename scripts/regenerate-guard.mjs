#!/usr/bin/env node
// regenerate-guard.mjs — the checks of .github/workflows/regenerate.yml (logic in scripts/lib/regenerate.mjs).
//
//   git diff --cached --name-only -z | node scripts/regenerate-guard.mjs allowlist
//       exits 1 and lists every changed path that is not a generated target
//   REGEN_MODE=… EVENT=… ACTOR=… BOT_LOGIN=… node scripts/regenerate-guard.mjs gate
//       prints mode=<off|shadow|push> and run=<true|false> (also to $GITHUB_OUTPUT); reads main's tip message from git
//   BASE=<sha> node scripts/regenerate-guard.mjs preview
//       after a build on a pull request: prints what the post-switch drift gate would decide (verdict=…, changed=…,
//       also to $GITHUB_OUTPUT) and writes a summary to $GITHUB_STEP_SUMMARY. Never fails on drift: it only reports.
//
// No npm dependencies: the publish job runs it without `npm ci`.
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { parseNul } from './generated-targets.mjs';
import { datasetVersion, loopGuard, outsideAllowlist, parseMode, previewVerdict } from './lib/regenerate.mjs';

const [command] = process.argv.slice(2);

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
} else if (command === 'preview') {
  const base = process.env.BASE;
  if (!/^[0-9a-f]{40}$/.test(base ?? '')) {
    console.error('preview: BASE must be the full SHA of the base commit');
    process.exit(2);
  }
  const git = (args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const touched = parseNul(git(['diff', '--name-only', '-z', base, 'HEAD']));
  const drift = [...new Set([
    ...parseNul(git(['diff', '--name-only', '-z', 'HEAD'])),
    ...parseNul(git(['ls-files', '-z', '--others', '--exclude-standard'])),
  ])].sort();
  let baseText = '';
  try { baseText = git(['show', `${base}:data/providers.json`]); } catch { /* not in the base: not a release */ }
  const before = datasetVersion(baseText);
  const after = datasetVersion(readFileSync('data/providers.json', 'utf8'));
  const release = before !== null && after !== null && before !== after;
  const { verdict, handEdited, outside } = previewVerdict({ release, touched, drift });
  const out = `verdict=${verdict}\nchanged=${drift.length > 0}\n`;
  process.stdout.write(out);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, out);
  const explain = {
    'in-sync': 'The derived files match the data. Nothing for the bot to regenerate.',
    'would-block-release': `This is a release pull request (version ${before} → ${after}): it must ship fully regenerated, now and after the switch.`,
    'would-block-hand-edit': 'This pull request edits derived files that do not match the build. The future gate keeps blocking this, because the bot would silently overwrite the edits.',
    'bot-would-regenerate': 'Only derived files this pull request did not touch are stale. After the switch to direct push the bot regenerates them after the merge; until then the gate in verify.yml still asks you to run `npm run build`.',
  }[verdict];
  const lines = [
    '### Regeneration preview (shadow, never blocks)', '',
    `Verdict of the planned drift gate: \`${verdict}\`. ${explain}`, '',
  ];
  if (drift.length) {
    lines.push(`${drift.length} derived file(s) differ from a fresh build. The patch is the \`regen-preview-patch\` artifact of this run (\`git apply --binary regen-preview.patch\`).`, '');
    lines.push('```', ...drift.slice(0, 200), ...(drift.length > 200 ? [`… and ${drift.length - 200} more`] : []), '```', '');
  }
  if (handEdited.length) lines.push('Edited by this pull request and not matching the build:', '```', ...handEdited, '```', '');
  if (outside.length) {
    lines.push('**The build changed paths outside the allowlist** (the bot would refuse to write them; this is a bug in the generator or the allowlist):', '```', ...outside, '```', '');
    console.log(`::warning title=Regeneration outside the allowlist::${outside.length} path(s): ${outside.join(' ')}`);
  }
  lines.push('See docs/regeneration-bot.md.');
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
  else console.log(lines.join('\n'));
} else {
  console.error('usage: regenerate-guard.mjs allowlist|gate|preview');
  process.exit(2);
}
