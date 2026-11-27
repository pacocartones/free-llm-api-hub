// Tests for release-prepare.mjs --collect (collectOnly) in an isolated temporary directory.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeTmpDir } from './lib/tmp.mjs';
import { FRAGMENT_DIR } from './lib/changelog-fragments.mjs';
import { collectOnly } from './release-prepare.mjs';

const BASE_LOG = `# Changelog

Intro.

## [Unreleased]

### Changed and fixed

- Existing entry (#1).

## [1.0.0] — 2026-11-01

Summary.
`;

function setupDir(files = {}) {
  const dir = makeTmpDir('release-prepare-collect-');
  mkdirSync(join(dir, FRAGMENT_DIR), { recursive: true });
  writeFileSync(join(dir, 'CHANGELOG.md'), BASE_LOG);
  writeFileSync(join(dir, FRAGMENT_DIR, '.gitkeep'), '');
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, FRAGMENT_DIR, name), content);
  }
  return dir;
}

test('collectOnly orders fragments alphabetically and preserves "Thanks @user" lines', () => {
  const dir = setupDir({
    'z-second.md': '### Changed and fixed\n\n- Second fix (#20). Thanks @bob.\n',
    'a-first.md': '### Changed and fixed\n\n- First fix (#10). Thanks @alice.\n',
  });
  const moved = collectOnly(dir);
  assert.deepEqual(moved, ['a-first.md', 'z-second.md']);
  const log = readFileSync(join(dir, 'CHANGELOG.md'), 'utf8');
  assert.ok(
    log.includes(
      '### Changed and fixed\n\n- Existing entry (#1).\n- First fix (#10). Thanks @alice.\n- Second fix (#20). Thanks @bob.\n',
    ),
    log,
  );
  assert.equal(existsSync(join(dir, FRAGMENT_DIR, 'a-first.md')), false);
  assert.equal(existsSync(join(dir, FRAGMENT_DIR, 'z-second.md')), false);
  assert.equal(existsSync(join(dir, FRAGMENT_DIR, '.gitkeep')), true);
});

test('collectOnly handles a fragment containing multiple ### headings in release order', () => {
  const dir = setupDir({
    'multi.md': '### Changed and fixed\n\n- Fix entry (#30).\n\n### Added\n\n- New feature (#31).\n',
  });
  assert.deepEqual(collectOnly(dir), ['multi.md']);
  const log = readFileSync(join(dir, 'CHANGELOG.md'), 'utf8');
  assert.ok(
    log.includes(
      '## [Unreleased]\n\n### Added\n\n- New feature (#31).\n\n### Changed and fixed\n\n- Existing entry (#1).\n- Fix entry (#30).\n',
    ),
    log,
  );
});

test('collectOnly is a no-op when changes/unreleased/ has no fragments', () => {
  const dir = setupDir();
  assert.deepEqual(collectOnly(dir), []);
  assert.equal(readFileSync(join(dir, 'CHANGELOG.md'), 'utf8'), BASE_LOG);
  assert.equal(existsSync(join(dir, FRAGMENT_DIR, '.gitkeep')), true);
});
