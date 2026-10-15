#!/usr/bin/env node
// Runs every scripts/*.test.mjs with the Node test runner. It expands the pattern itself, so it works on every Node the project supports
// (the engines field says 18 and up; `node --test "scripts/*.test.mjs"` needs Node 21 or later) and on Windows.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { testFiles } from './lib/test-files.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = testFiles();
if (!files.length) { console.error('no scripts/*.test.mjs found'); process.exit(1); }
const run = spawnSync(process.execPath, ['--test', ...files], { cwd: ROOT, stdio: 'inherit' });
process.exit(run.status === null ? 1 : run.status);
