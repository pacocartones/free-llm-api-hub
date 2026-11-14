import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { privateTree } from './lib/private-tree.mjs';
import { makeTmpDir } from './lib/tmp.mjs';

test('a linked worktree copy rewrites its git pointer without touching source metadata', () => {
  const base = makeTmpDir('flah-private-tree-');
  const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd, stdio: 'pipe', encoding: 'utf8' });
  const main = join(base, 'main');
  git(base, 'init', '-q', main);
  writeFileSync(join(main, 'fixture.txt'), 'fixture\n');
  git(main, 'add', 'fixture.txt');
  git(main, 'commit', '-q', '-m', 'fixture');
  const worktree = join(base, 'worktree');
  git(main, 'worktree', 'add', '-q', '--detach', worktree);
  const sourceDotGit = readFileSync(join(worktree, '.git'), 'utf8');

  const copy = privateTree(worktree);

  assert.notEqual(resolve(copy), resolve(worktree));
  assert.equal(readFileSync(join(worktree, '.git'), 'utf8'), sourceDotGit);

  const copiedDotGit = readFileSync(join(copy, '.git'), 'utf8');
  const pointer = /^gitdir:\s*(.+?)\s*$/m.exec(copiedDotGit)?.[1];
  assert.ok(pointer, 'the private copy keeps a gitdir pointer');
  assert.equal(isAbsolute(pointer), true, 'the copied gitdir pointer is absolute');

  assert.equal(git(copy, 'log', '--format=%s').trim(), 'fixture', 'Git reads the copied worktree history');
});
