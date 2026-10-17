// private-tree.mjs — a private copy of the repository tree for the test files that run the build.
//
// build.mjs rewrites site/ (it removes and recreates site/p, among others), and `node --test` runs the test files
// in parallel processes. Two builds on the same tree collide on a directory the other is writing (ENOTEMPTY in CI).
// A test file that builds works on its own copy instead: the working tree with its history (the build mines the git
// log), node_modules linked, made once per process and removed when the process exits (see tmp.mjs). Nothing it
// builds lands in the tree of the repository.

import { cpSync, existsSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { makeTmpDir } from './tmp.mjs';

const copies = new Map();

export function privateTree(root) {
  if (copies.has(root)) return copies.get(root);
  const dir = makeTmpDir('flah-tree-');
  cpSync(root, dir, { recursive: true, filter: (src) => !/(^|[\\/])node_modules([\\/]|$)/.test(src) });
  if (existsSync(join(root, 'node_modules'))) symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'));
  // A linked worktree has a .git FILE, not a directory: "gitdir: <path>". The path can be relative to the worktree, and
  // copied as it is it would point elsewhere from the copy, so the build would mine an empty history. Write it absolute.
  const dotGit = join(root, '.git');
  if (existsSync(dotGit) && statSync(dotGit).isFile()) {
    const m = /^gitdir:\s*(.+?)\s*$/m.exec(readFileSync(dotGit, 'utf8'));
    if (m) writeFileSync(join(dir, '.git'), `gitdir: ${isAbsolute(m[1]) ? m[1] : resolve(root, m[1])}\n`);
  }
  copies.set(root, dir);
  return dir;
}
