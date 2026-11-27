// The regeneration bot (.github/workflows/regenerate.yml) builds, stages everything with `git add -A`, builds again and
// fails if the second build changes a file. derived-fingerprints.json must therefore not depend on what is in the git
// index: before this was pinned, a new page that is a generated target but not gitignored (site/contributors/, #953)
// was pinned by the first build while untracked and dropped by the second once staged, and every run failed (#926).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { privateTree } from './lib/private-tree.mjs';

test('a second build after `git add -A` changes nothing, even for a page git did not track yet', () => {
  const root = privateTree(fileURLToPath(new URL('../', import.meta.url)));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const build = () => execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: root, stdio: 'pipe' });
  const page = 'site/contributors/index.html';

  // The state of main when the bug appeared: the page is built but was never committed.
  git('rm', '--cached', '--quiet', '--ignore-unmatch', '--', page);
  build();
  const first = readFileSync(join(root, 'derived-fingerprints.json'), 'utf8');
  const firstPage = readFileSync(join(root, page), 'utf8');
  assert.equal(git('ls-files', '--others', '--exclude-standard', '--', page).trim(), page, 'the page starts untracked');
  assert.ok(!(page in JSON.parse(first)), 'a page that is not gitignored is a committed target, never a pinned one');

  git('add', '-A');
  build();

  assert.equal(readFileSync(join(root, 'derived-fingerprints.json'), 'utf8'), first, 'the pins do not depend on the index');
  assert.equal(readFileSync(join(root, page), 'utf8'), firstPage, 'the contributors page is byte-identical');
  assert.doesNotThrow(() => git('diff', '--exit-code', '--quiet'), 'the second build changes no file');
  assert.equal(git('ls-files', '--others', '--exclude-standard').trim(), '', 'the second build writes no new file');
});
