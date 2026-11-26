import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { makeTmpDir } from './lib/tmp.mjs';
import { trackedFilesOnDisk } from './lib/tracked-files.mjs';

test('trackedFilesOnDisk skips a tracked file deleted but not yet staged (as after release:prepare)', () => {
  const dir = makeTmpDir('tracked-files-');
  try {
    const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
    git('init', '-q');
    mkdirSync(join(dir, 'changes', 'unreleased'), { recursive: true });
    writeFileSync(join(dir, 'README.md'), '# Test\n');
    writeFileSync(join(dir, 'changes', 'unreleased', 'fragment.md'), '### Added\n\n- Something.\n');
    git('add', '-A');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-q', '-m', 'init');
    rmSync(join(dir, 'changes', 'unreleased', 'fragment.md'));

    assert.match(git('ls-files'), /changes\/unreleased\/fragment\.md/, 'the index still lists the unstaged deletion');
    assert.deepEqual(trackedFilesOnDisk(dir), ['README.md']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
