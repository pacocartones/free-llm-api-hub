// The test files of the pipeline: every scripts/*.test.mjs, found on disk, never listed by hand. A new test file is picked up by
// `npm test` and by CI without anyone editing a list (the list used to be one line in package.json and one in verify.yml, so every pull
// request that added a test collided with the others).
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SCRIPTS = join(dirname(fileURLToPath(import.meta.url)), '..');

/** @returns {string[]} the paths, relative to the repository root, sorted */
export function testFiles(dir = SCRIPTS) {
  return readdirSync(dir).filter((n) => /\.test\.mjs$/.test(n)).sort().map((n) => `scripts/${n}`);
}

// Test files long enough to set the floor of the whole suite, and how many processes each runs in. Such a file imports
// `test` and `describe` from ./test-part.mjs, which keeps one part of its top-level tests per process (see there).
export const SPLIT_FILES = { 'scripts/build.test.mjs': 3, 'scripts/validate.test.mjs': 3 };

/**
 * What one `node --test` run executes: every file once, a SPLIT_FILES file as `parts` units. The split parts come
 * first, so a round-robin shard (shardUnits) spreads the parts of one file over different shards.
 * @returns {{ file: string, part: { index: number, total: number } | null }[]}
 */
export function testUnits(files, split = SPLIT_FILES) {
  const parts = [];
  const whole = [];
  for (const file of files) {
    const total = split[file];
    if (Number.isInteger(total) && total > 1) for (let index = 1; index <= total; index++) parts.push({ file, part: { index, total } });
    else whole.push({ file, part: null });
  }
  return [...parts, ...whole];
}

/** Parses TEST_SHARD ("2/3"): { index, total }, or null when it is empty. Anything else is an error, never "run all". */
export function parseShard(value) {
  if (value === undefined || value === '') return null;
  const m = /^(\d+)\/(\d+)$/.exec(String(value).trim());
  const index = m ? Number(m[1]) : NaN;
  const total = m ? Number(m[2]) : NaN;
  if (!m || total < 1 || index < 1 || index > total) throw new Error(`TEST_SHARD must be "<index>/<total>" with 1 <= index <= total, got ${JSON.stringify(value)}`);
  return { index, total };
}

/** Shard `index` of `total`: every total-th unit, so the shards together hold each unit exactly once. */
export function shardUnits(units, shard) {
  if (!shard) return units;
  return units.filter((_, i) => i % shard.total === shard.index - 1);
}
