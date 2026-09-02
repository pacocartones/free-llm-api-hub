#!/usr/bin/env node
// check-best.mjs — fast integrity check for the editorial ranking.
//
// Asserts the same invariants as lib/best.mjs / validate.mjs / best.test.mjs:
// every pick must resolve, be unique, carry editorial copy (why + tag), and
// be verified: true. Cheap enough to run as its own CI step (no build, no git),
// like check-history.mjs. An unverified pick silently promoted to "best" is
// a credibility bug (#165).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { assertBestPicks } from './lib/best.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

try {
  const data = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8'));
  const best = JSON.parse(readFileSync(join(ROOT, 'data/best.json'), 'utf8'));
  assertBestPicks(best, data.providers);
  console.log(
    `OK — editorial ranking: ${best.entries.length} picks, all verified.`
  );
} catch (err) {
  console.error(`Editorial ranking integrity check failed: ${err.message}`);
  process.exit(1);
}
