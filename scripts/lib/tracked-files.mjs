// Tracked files that are present in the working tree.
//
// `git ls-files` reads the index, so a file deleted but not yet staged is still listed.
// That is the normal state right after `npm run release:prepare`, which deletes the
// changelog fragments before the release commit. A scan of tracked files skips those
// paths instead of crashing on them; once the deletion is committed they are gone anyway.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export function trackedFilesOnDisk(cwd) {
  return execFileSync('git', ['ls-files', '-z'], { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\0').filter(Boolean)
    .filter((rel) => existsSync(join(cwd, rel)));
}
