// Changelog fragments (changes/unreleased/*.md) and the release preparation that collects them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTmpDir } from './lib/tmp.mjs';
import { collectFragments, fragmentErrors, readFragments, FRAGMENT_DIR } from './lib/changelog-fragments.mjs';
import { prepareRelease, collectOnly, semverGreater } from './release-prepare.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const LOG = `# Changelog\n\nIntro.\n\n## [Unreleased]\n\n### Changed and fixed\n\n- Existing entry (#1).\n\n## [1.0.0] — 2026-11-01\n\nSummary.\n\n### Added\n\n- First (#0).\n`;
const frag = (name, text) => ({ name, text });

test('every committed fragment is valid', () => {
  const errors = readFragments(ROOT).flatMap((f) => fragmentErrors(f.name, f.text));
  assert.deepEqual(errors, []);
});

test('fragment rules: a known ### section with "- " entries, and a plain file name', () => {
  assert.deepEqual(fragmentErrors('modal-terms.md', '### Changed and fixed\n\n- Modal re-verified (#688). Thanks @someone.\n'), []);
  assert.deepEqual(fragmentErrors('two.md', '### Added\n\n- A.\n\n### Removed\n\n- B.\n  continued\n'), []);
  assert.match(fragmentErrors('Bad Name.md', '### Added\n\n- A.\n').join(), /lowercase letters/);
  assert.match(fragmentErrors('x.md', '- no heading\n').join(), /start with a section heading/);
  assert.match(fragmentErrors('x.md', '### Fixed\n\n- A.\n').join(), /unknown section "### Fixed"/);
  assert.match(fragmentErrors('x.md', '### Added\n\nprose only\n').join(), /at least one entry/);
  assert.match(fragmentErrors('x.md', '### Added\n\n- A.\n\n### Added\n\n- B.\n').join(), /appears twice/);
  assert.match(fragmentErrors('x.md', '### Added\n\n- A.\n## [9.9.9]\n').join(), /only "### " headings/);
});

test('collect: fragments join their section after the existing entries, sections in release order', () => {
  const out = collectFragments(LOG, [
    frag('b.md', '### Changed and fixed\n\n- From b (#3).\n'),
    frag('a.md', '### Added\n\n- From a (#2).\n\n### Changed and fixed\n\n- Also a (#2).\n'),
  ]);
  assert.equal(out, `# Changelog\n\nIntro.\n\n## [Unreleased]\n\n### Added\n\n- From a (#2).\n\n### Changed and fixed\n\n- Existing entry (#1).\n- Also a (#2).\n- From b (#3).\n\n## [1.0.0] — 2026-11-01\n\nSummary.\n\n### Added\n\n- First (#0).\n`);
  assert.equal(collectFragments(LOG, []), LOG, 'nothing to collect leaves the file byte-identical');
});

test('collect for a release: Unreleased becomes the version, a new empty Unreleased stays on top', () => {
  const out = collectFragments(LOG, [frag('a.md', '### Removed\n\n- Gone (#4).\n')], { version: '1.1.0', date: '2026-11-25' });
  assert.match(out, /## \[Unreleased\]\n\n## \[1\.1\.0\] — 2026-11-25\n\n### Changed and fixed\n\n- Existing entry \(#1\)\.\n\n### Removed\n\n- Gone \(#4\)\.\n\n## \[1\.0\.0\]/);
  assert.throws(() => collectFragments(LOG, [], { version: '1.0.0', date: '2026-11-25' }), /already has a section/);
  assert.throws(() => collectFragments(LOG, [frag('x.md', 'nope')]), /start with a section heading/);
  assert.throws(() => collectFragments('# No unreleased\n', []), /no "## \[Unreleased\]"/);
});

test('semverGreater compares numerically', () => {
  assert.equal(semverGreater('2.10.0', '2.9.9'), true);
  assert.equal(semverGreater('2.14.2', '2.14.2'), false);
  assert.equal(semverGreater('2.14.1', '2.14.2'), false);
});

function tree() {
  const dir = makeTmpDir('release-prepare-');
  mkdirSync(join(dir, 'data'));
  mkdirSync(join(dir, FRAGMENT_DIR), { recursive: true });
  for (const f of ['data/providers.json', 'package.json', 'package-lock.json']) copyFileSync(join(ROOT, f), join(dir, f));
  writeFileSync(join(dir, 'CHANGELOG.md'), LOG);
  writeFileSync(join(dir, FRAGMENT_DIR, '.gitkeep'), '');
  writeFileSync(join(dir, FRAGMENT_DIR, 'some-fix.md'), '### Changed and fixed\n\n- A fix (#9).\n');
  return dir;
}

test('release:prepare sets version and stamp everywhere and collects the fragments', () => {
  const dir = tree();
  const before = JSON.parse(readFileSync(join(dir, 'data/providers.json'), 'utf8'));
  const [maj, min] = before.version.split('.').map(Number);
  const next = `${maj}.${min + 1}.0`;
  const today = new Date().toISOString().slice(0, 10);
  const r = prepareRelease(next, { root: dir, date: today });
  assert.deepEqual(r.fragments, ['some-fix.md']);
  const raw = readFileSync(join(dir, 'data/providers.json'), 'utf8');
  const after = JSON.parse(raw);
  assert.equal(after.version, next);
  assert.equal(after.generated, today);
  assert.deepEqual(after.providers, before.providers, 'no provider changes');
  assert.equal(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version, next);
  const lock = JSON.parse(readFileSync(join(dir, 'package-lock.json'), 'utf8'));
  assert.equal(lock.version, next);
  assert.equal(lock.packages[''].version, next);
  const log = readFileSync(join(dir, 'CHANGELOG.md'), 'utf8');
  assert.ok(log.includes(`## [Unreleased]\n\n## [${next}] — ${today}\n\n### Changed and fixed\n\n- Existing entry (#1).\n- A fix (#9).\n`), log);
  assert.equal(existsSync(join(dir, FRAGMENT_DIR, 'some-fix.md')), false, 'collected fragments are removed');
  assert.equal(existsSync(join(dir, FRAGMENT_DIR, '.gitkeep')), true);
});

test('release:prepare refuses a version that does not grow or a stamp older than the data, writing nothing', () => {
  const dir = tree();
  const data = readFileSync(join(dir, 'data/providers.json'), 'utf8');
  const { version } = JSON.parse(data);
  assert.throws(() => prepareRelease(version, { root: dir }), /must be greater/);
  assert.throws(() => prepareRelease('999.0.0', { root: dir, date: '2000-01-01' }), /older than/);
  assert.throws(() => prepareRelease('999.0.0', { root: dir, date: '2999-01-01' }), /after today/);
  assert.equal(readFileSync(join(dir, 'data/providers.json'), 'utf8'), data);
  assert.ok(existsSync(join(dir, FRAGMENT_DIR, 'some-fix.md')));
});

test('changelog:collect moves fragments under Unreleased without a release', () => {
  const dir = tree();
  assert.deepEqual(collectOnly(dir), ['some-fix.md']);
  assert.match(readFileSync(join(dir, 'CHANGELOG.md'), 'utf8'), /## \[Unreleased\]\n\n### Changed and fixed\n\n- Existing entry \(#1\)\.\n- A fix \(#9\)\.\n\n## \[1\.0\.0\]/);
});
