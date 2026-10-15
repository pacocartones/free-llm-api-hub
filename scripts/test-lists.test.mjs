import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { testFiles } from './lib/test-files.mjs';
import { makeTmpDir } from './lib/tmp.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// Every test file under scripts/, found on disk by its own walk (not by testFiles), in any folder and with any of the usual extensions.
function everyTestOnDisk(dir = __dirname, prefix = 'scripts') {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : everyTestOnDisk(join(dir, e.name), `${prefix}/${e.name}`);
    return /\.test\.[cm]?js$/.test(e.name) ? [`${prefix}/${e.name}`] : [];
  }).sort();
}

test('every test file under scripts/ is one that npm test and CI will run: nothing is left out by its name or its folder', () => {
  assert.deepEqual(testFiles(), everyTestOnDisk(), 'a *.test.js, *.test.cjs or a test in a subfolder would not run: name it scripts/<name>.test.mjs');
});

test('testFiles lists what is on disk, sorted, and ignores what is not a test (a new test file needs no list)', () => {
  const dir = makeTmpDir('tests-');
  for (const n of ['b.test.mjs', 'a.test.mjs', 'helper.mjs', 'c.test.mjs.bak', 'd.test.js']) writeFileSync(join(dir, n), '');
  mkdirSync(join(dir, 'lib')); writeFileSync(join(dir, 'lib', 'e.test.mjs'), '');
  assert.deepEqual(testFiles(dir), ['scripts/a.test.mjs', 'scripts/b.test.mjs']);
  writeFileSync(join(dir, 'aa.test.mjs'), '');
  assert.deepEqual(testFiles(dir), ['scripts/a.test.mjs', 'scripts/aa.test.mjs', 'scripts/b.test.mjs'], 'a file added later is picked up with no other edit');
});

test('package.json and verify.yml run the runner and name no test file, so a pull request that adds a test never edits those lines', () => {
  const pkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));
  assert.match(pkg.scripts.test, /\bnode scripts\/run-tests\.mjs\b/);
  assert.doesNotMatch(pkg.scripts.test, /\.test\.mjs/, 'no test file is named in the test script');
  const ci = readFileSync(join(rootDir, '.github/workflows/verify.yml'), 'utf8');
  const runLines = ci.split('\n').filter((l) => /^\s*run:/.test(l));
  assert.ok(runLines.some((l) => /node scripts\/run-tests\.mjs/.test(l)), 'CI runs the runner');
  assert.ok(runLines.every((l) => !/\.test\.mjs/.test(l)), 'no run line of CI names a test file');
});

test('the runner runs the files that testFiles lists, with the Node test runner and the exit code of it', () => {
  const src = readFileSync(join(__dirname, 'run-tests.mjs'), 'utf8');
  assert.match(src, /testFiles\(\)/); assert.match(src, /'--test', \.\.\.files/); assert.match(src, /process\.exit\(run\.status === null \? 1 : run\.status\)/);
  assert.match(src, /no scripts\/\*\.test\.mjs found/, 'an empty list is a failure, not a pass');
});
