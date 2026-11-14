import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { privateTree } from './lib/private-tree.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('a linked worktree copy rewrites its git pointer without touching source metadata', () => {
  const sourceDotGit = readFileSync(join(ROOT, '.git'), 'utf8');

  const copy = privateTree(ROOT);

  assert.notEqual(resolve(copy), resolve(ROOT));
  assert.equal(readFileSync(join(ROOT, '.git'), 'utf8'), sourceDotGit);

  const copiedDotGit = readFileSync(join(copy, '.git'), 'utf8');
  const pointer = /^gitdir:\s*(.+?)\s*$/m.exec(copiedDotGit)?.[1];
  assert.ok(pointer, 'the private copy keeps a gitdir pointer');
  assert.equal(isAbsolute(pointer), true, 'the copied gitdir pointer is absolute');

  const topLevel = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: copy, encoding: 'utf8' }).trim();
  assert.equal(resolve(topLevel), resolve(copy));
});
