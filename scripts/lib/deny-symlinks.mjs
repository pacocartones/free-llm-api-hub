// deny-symlinks.mjs — makes Node refuse symbolic links the way Windows does without Developer Mode or an administrator.
//
// GitHub's Windows runners may create symlinks, so the Windows job passed while contributors got
// "EPERM: operation not permitted, symlink" (#783). The Windows job preloads this module for the test suite
// (NODE_OPTIONS=--import=<file URL of this file>): file and directory symlinks fail with EPERM, junctions still work,
// as on such a machine. It changes nothing unless it is preloaded; works on any platform for a local check.

import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';

const eperm = (target, path) => Object.assign(
  new Error(`EPERM: operation not permitted, symlink '${target}' -> '${path}'`),
  { code: 'EPERM', errno: -4048, syscall: 'symlink', path: String(target), dest: String(path) },
);

const { symlinkSync, symlink } = fs;
const symlinkAsync = fs.promises.symlink;
fs.symlinkSync = (target, path, type) => {
  if (type !== 'junction') throw eperm(target, path);
  return symlinkSync(target, path, type);
};
fs.symlink = (target, path, type, callback) => {
  if (typeof type === 'function') [type, callback] = [undefined, type];
  if (type !== 'junction') return process.nextTick(callback, eperm(target, path));
  return symlink(target, path, type, callback);
};
fs.promises.symlink = async (target, path, type) => {
  if (type !== 'junction') throw eperm(target, path);
  return symlinkAsync(target, path, type);
};
syncBuiltinESMExports();
