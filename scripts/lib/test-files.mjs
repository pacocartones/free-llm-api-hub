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
