// The one place that creates temporary directories. Each is removed when the
// process exits, so a test run leaves nothing behind in the temporary directory.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dirs = new Set();
process.on('exit', () => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

export function makeTmpDir(prefix = 'flah-') {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.add(dir);
  return dir;
}

// A path inside a fresh temporary directory; the caller writes the file.
export const tmpFile = (name) => join(makeTmpDir(), name);
