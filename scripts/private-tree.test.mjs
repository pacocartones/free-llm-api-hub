import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs, { lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { isAbsolute, join, resolve } from 'node:path';
import { linkDir, privateTree } from './lib/private-tree.mjs';
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

// Windows without Developer Mode or an administrator refuses directory symlinks with EPERM (#783); junctions work.
// Where a junction fails too, node_modules is copied. Both are simulated here by replacing fs.symlinkSync.
function withSymlink(fake, fn) {
  const real = fs.symlinkSync;
  fs.symlinkSync = (...args) => fake(real, ...args);
  syncBuiltinESMExports();
  try { return fn(); } finally { fs.symlinkSync = real; syncBuiltinESMExports(); }
}
const eperm = () => Object.assign(new Error('EPERM: operation not permitted, symlink'), { code: 'EPERM' });

function moduleDir() {
  const base = makeTmpDir('flah-link-');
  mkdirSync(join(base, 'node_modules', 'pkg'), { recursive: true });
  writeFileSync(join(base, 'node_modules', 'pkg', 'index.js'), 'export default 1;\n');
  return base;
}

test('linkDir asks for a junction, which Windows grants without symlink privileges', () => {
  const base = moduleDir();
  const types = [];
  withSymlink((real, target, path, type) => {
    types.push(type);
    if (type !== 'junction') throw eperm();
    return real(target, path, type);
  }, () => linkDir(join(base, 'node_modules'), join(base, 'linked')));
  assert.deepEqual(types, ['junction']);
  assert.equal(readFileSync(join(base, 'linked', 'pkg', 'index.js'), 'utf8'), 'export default 1;\n');
});

test('linkDir copies the directory when no kind of link is allowed', () => {
  const base = moduleDir();
  withSymlink(() => { throw eperm(); }, () => linkDir(join(base, 'node_modules'), join(base, 'copied')));
  assert.equal(lstatSync(join(base, 'copied')).isSymbolicLink(), false);
  assert.equal(readFileSync(join(base, 'copied', 'pkg', 'index.js'), 'utf8'), 'export default 1;\n');
});

test('linkDir does not hide an error that is not about permission to link', () => {
  const base = moduleDir();
  writeFileSync(join(base, 'taken'), 'a file is already there\n');
  assert.throws(() => linkDir(join(base, 'node_modules'), join(base, 'taken')), { code: 'EEXIST' });
});
