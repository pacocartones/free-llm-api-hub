#!/usr/bin/env node
// Runs every scripts/*.test.mjs with the Node test runner. It expands the pattern itself, so it works on every Node the project supports
// (the engines field says 24 and up, matching .nvmrc and CI) without relying on shell globbing, which differs on Windows.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { testFiles } from './lib/test-files.mjs';
import { crlfFiles, testGitEnv } from './lib/test-tools.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = testFiles();
if (!files.length) { console.error('no scripts/*.test.mjs found'); process.exit(1); }

// A working tree with CRLF files fails a large part of the suite for reasons unrelated to any change; say so once instead.
const crlf = crlfFiles(ROOT);
if (crlf.length) {
  console.error(`${crlf.length} tracked text file(s) have CRLF line endings on disk; the repository and the tests expect LF:`);
  for (const file of crlf.slice(0, 10)) console.error(`  ${file}`);
  if (crlf.length > 10) console.error(`  … and ${crlf.length - 10} more (git ls-files --eol | grep w/crlf)`);
  console.error('Save them with LF line endings (or run `git checkout -- <file>` for a file you have not edited), then run the tests again.');
  console.error('See "Windows and WSL" in CONTRIBUTING.md.');
  process.exit(1);
}

const run = spawnSync(process.execPath, ['--test', ...files], { cwd: ROOT, stdio: 'inherit', env: testGitEnv() });
process.exit(run.status === null ? 1 : run.status);
