#!/usr/bin/env node
// regenerate-guard.mjs — the checks of .github/workflows/regenerate.yml (logic in scripts/lib/regenerate.mjs).
//
//   git diff --cached --name-only -z | node scripts/regenerate-guard.mjs allowlist
//       exits 1 and lists every changed path that is not a generated target
//   REGEN_MODE=… EVENT=… ACTOR=… BOT_LOGIN=… node scripts/regenerate-guard.mjs gate
//       prints mode=<off|shadow|push> and run=<true|false> (also to $GITHUB_OUTPUT); reads main's tip message from git
//
// No npm dependencies: the publish job runs it without `npm ci`.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { parseNul } from './generated-targets.mjs';
import { loopGuard, outsideAllowlist, parseMode } from './lib/regenerate.mjs';

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
} else {
  console.error('usage: regenerate-guard.mjs allowlist|gate');
  process.exit(2);
}
