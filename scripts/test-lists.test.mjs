import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

function getDiskTests() {
  return readdirSync(__dirname)
    .filter(name => name.endsWith('.test.mjs'))
    .map(name => `scripts/${name}`)
    .sort();
}

function getPackageTests() {
  const pkgPath = join(rootDir, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const testScript = pkg.scripts?.test || '';
  const match = testScript.match(/node\s+--test\s+([\s\S]*)/);
  if (!match) return new Set();
  const files = [...match[0].matchAll(/scripts\/[^\s'"]+\.test\.mjs/g)].map(m => m[0]);
  return new Set(files);
}

function getCiTests() {
  const verifyPath = join(rootDir, '.github', 'workflows', 'verify.yml');
  const content = readFileSync(verifyPath, 'utf8');
  const match = content.match(/node\s+--test\s+([\s\S]*?)(?=\n\s*(?:-[ \w]|#|$))/);
  if (!match) return new Set();
  const files = [...match[0].matchAll(/scripts\/[^\s'"]+\.test\.mjs/g)].map(m => m[0]);
  return new Set(files);
}

test('every scripts/*.test.mjs on disk is in package.json test script', () => {
  const disk = getDiskTests();
  const pkgSet = getPackageTests();
  for (const file of disk) {
    assert.ok(pkgSet.has(file), `Missing ${file} in package.json test script`);
  }
});

test('every scripts/*.test.mjs on disk is in verify.yml CI pipeline', () => {
  const disk = getDiskTests();
  const ciSet = getCiTests();
  for (const file of disk) {
    assert.ok(ciSet.has(file), `Missing ${file} in .github/workflows/verify.yml`);
  }
});

test('package.json and verify.yml name the exact same set of test files', () => {
  const pkgSet = getPackageTests();
  const ciSet = getCiTests();
  for (const file of pkgSet) {
    assert.ok(ciSet.has(file), `Missing ${file} in .github/workflows/verify.yml`);
  }
  for (const file of ciSet) {
    assert.ok(pkgSet.has(file), `Missing ${file} in package.json`);
  }
});
