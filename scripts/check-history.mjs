#!/usr/bin/env node
// check-history.mjs — fast integrity check for the git-mined provider history.
//
// Mines the per-provider history directly (two git processes, no build) and
// asserts the same plausibility invariants as build.test.mjs, so a miner
// regression (broken cat-file parse, shallow checkout, empty log) is caught in
// CI in a fraction of a second instead of after the full build runs.
//
// Needs a full clone: verify.yml checks out with fetch-depth: 0. Exit 0 on a
// healthy history, 1 with the specific violation on stderr otherwise.
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mineProviderHistory, assertHistoryPlausible } from './lib/history.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

try {
  const history = mineProviderHistory({ cwd: ROOT });
  assertHistoryPlausible(history);
  const events = Object.values(history).flat();
  console.log(
    `OK — mined history: ${Object.keys(history).length} providers, ` +
    `${events.filter((e) => e.kind === 'added').length} added, ` +
    `${events.filter((e) => e.kind === 'changed').length} changed, ${events.length} events.`
  );
} catch (err) {
  console.error(`History integrity check failed: ${err.message}`);
  process.exit(1);
}
