import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { makeTmpDir } from './lib/tmp.mjs';

const script = readFileSync(new URL('./check-links.mjs', import.meta.url), 'utf8');
function fixture(file, markdown) {
  const root = join(makeTmpDir('doc-links-'), 'repo');
  mkdirSync(root);
  const write = (path, text) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  execFileSync('git', ['init', '-q'], { cwd: root });
  for (const name of ['README.md', 'CONTRIBUTING.md', 'AI_POLICY.md', 'GOVERNANCE.md', 'SECURITY.md', 'CODE_OF_CONDUCT.md', 'CHANGELOG.md']) write(name, '');
  mkdirSync(join(root, 'docs'));
  mkdirSync(join(root, 'collections'));
  write('scripts/check-links.mjs', script);
  write(file, markdown);
  return { root, write, run: () => spawnSync(process.execPath, [join(root, 'scripts/check-links.mjs')], { cwd: root, encoding: 'utf8' }) };
}

for (const file of ['RELEASING.md', '.github/PULL_REQUEST_TEMPLATE.md', 'docs/nested/runbook.md', 'packages/mcp/README.md']) {
  test(`missing local links fail in ${file}`, () => {
    const { run } = fixture(file, '[missing](missing.md)');
    const result = run();
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.ok(result.stderr.includes(`${file} → missing.md`), result.stderr);
  });
}

test('local paths with queries and percent escapes are checked; non-issue parent paths are not skipped', () => {
  const { write, run } = fixture('docs/nested/runbook.md', '[good](../a%20b.md?raw=1#title)\n[bad](../../missing.md?raw=1)');
  write('docs/a b.md', '# Title');
  const result = run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /runbook.md → ..\/..\/missing.md\?raw=1/);
  assert.doesNotMatch(result.stderr, /→ ..\/a%20b/);
});

test('external links, valid same-file anchors and GitHub issue shortcuts stay offline; ignored files are excluded', () => {
  const { write, run } = fixture('README.md', '# Title\n\n[web](https://example.invalid/)\n[mail](mailto:a@example.invalid)\n[heading](#title)\n[issue](../../issues/new?template=inaccuracy.yml)');
  write('.gitignore', 'node_modules/\n');
  write('node_modules/example/README.md', '[missing](missing.md)');
  const result = run();
  assert.equal(result.status, 0, result.stdout + result.stderr);
});


test('absolute local paths are rejected even when the file exists inside the repository', () => {
  const { root, write, run } = fixture('README.md', '');
  const target = join(root, 'CONTRIBUTING.md').replaceAll('\\', '/');
  write('README.md', `[absolute](${target})`);
  const result = run();
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /absolute path/);
});

test('parent traversal cannot escape ROOT into an existing sibling with the same name prefix', () => {
  const { root, write, run } = fixture('README.md', '');
  const outside = root + '-outside';
  mkdirSync(outside);
  const file = join(outside, 'existing.md');
  writeFileSync(file, '# Outside');
  const target = relative(root, file).replaceAll('\\', '/');
  write('README.md', `[escape](${target})`);
  const result = run();
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /outside repository/);
});

test('encoded traversal and GitHub-looking paths do not bypass the root boundary', () => {
  const { write, run } = fixture('README.md', '');
  for (const target of ['%2e%2e/outside.md', '..%5coutside.md', '../../issues/../../../outside.md']) {
    write('README.md', `[escape](${target})`);
    const result = run();
    assert.equal(result.status, 1, target);
    assert.match(result.stderr, /outside repository/, target);
  }
});

test('POSIX, drive, rooted and UNC absolute paths are rejected on every operating system', () => {
  const { write, run } = fixture('README.md', '');
  for (const target of ['/tmp/outside.md', 'C:/outside.md', String.raw`C:\outside.md`, String.raw`\outside.md`, String.raw`\\server\share\outside.md`, '%2Ftmp/outside.md', '%5C%5Cserver%5Cshare%5Coutside.md']) {
    write('README.md', `[absolute](${target})`);
    const result = run();
    assert.equal(result.status, 1, target);
    assert.match(result.stderr, /absolute path/, target);
  }
});

test('parent links inside ROOT and Windows separators remain valid', () => {
  const { run } = fixture('docs/nested/runbook.md', '[parent](../../README.md)\n[windows](..\\..\\README.md)');
  const result = run();
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('a committed Markdown file deleted but not staged is skipped, and links to it are still reported', () => {
  const { root, write, run } = fixture('README.md', '[fragment](changes/unreleased/gone.md)');
  write('changes/unreleased/gone.md', '### Added\n\n- An entry.\n');
  execFileSync('git', ['add', '-A'], { cwd: root });
  rmSync(join(root, 'changes/unreleased/gone.md'));
  const result = run();
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.doesNotMatch(result.stderr, /ENOENT/);
  assert.match(result.stderr, /README\.md → changes\/unreleased\/gone\.md/);
  write('README.md', '');
  const clean = run();
  assert.equal(clean.status, 0, clean.stdout + clean.stderr);
});

test('valid heading anchors across Markdown formatting, punctuation and duplicate -1/-2 suffixes pass', () => {
  const { write, run } = fixture(
    'README.md',
    [
      '[formatted](docs/guide.md#why-field_checks-matters--bold-link)',
      '[emdash](docs/guide.md#layer-2--the-weekly-pass)',
      '[first](docs/guide.md#repeat)',
      '[second](docs/guide.md#repeat-1)',
      '[third](docs/guide.md#repeat-2)',
      '[self](#local-section)',
      '[external-frag](https://example.invalid/#not-checked)',
      '[shortcut-frag](../../issues/12#issuecomment-1)',
      '',
      '## Local section',
    ].join('\n'),
  );
  write(
    'docs/guide.md',
    [
      '## Why `field_checks` matters — **bold** [link](https://example.invalid/)',
      '### Layer 2 — the weekly pass',
      '### Repeat',
      '### Repeat',
      '### Repeat',
    ].join('\n'),
  );
  const result = run();
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('missing anchor in another Markdown file fails with file, line and anchor', () => {
  const { write, run } = fixture(
    'README.md',
    '# Home\n\nSee [guide](docs/guide.md#does-not-exist).\n',
  );
  write('docs/guide.md', '# Guide\n\n## Actual heading\n');
  const result = run();
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /README\.md:3 → docs\/guide\.md#does-not-exist \(missing anchor #does-not-exist\)/);
});

test('duplicate heading suffix beyond actual count fails', () => {
  const { write, run } = fixture('README.md', '[too-many](docs/guide.md#repeat-2)\n');
  write('docs/guide.md', '## Repeat\n\n## Repeat\n');
  const result = run();
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /README\.md:1 → docs\/guide\.md#repeat-2 \(missing anchor #repeat-2\)/);
});

test('missing same-file #anchor fails with file, line and anchor', () => {
  const { run } = fixture('README.md', '# Home\n\n[broken](#missing-section)\n');
  const result = run();
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /README\.md:3 → #missing-section \(missing anchor #missing-section\)/);
});

test('comments inside fenced code blocks are ignored as headings, and links in code are ignored', () => {
  const { write, run } = fixture(
    'README.md',
    [
      '# Home',
      '',
      '```bash',
      '[ignored-in-fence](missing.md#nope)',
      '```',
      '',
      'Inline `[ignored-inline](#nope)` is ignored.',
      '',
      '[code-comment](docs/guide.md#shell-comment)',
    ].join('\n'),
  );
  write(
    'docs/guide.md',
    [
      '# Guide',
      '',
      '```bash',
      '# shell comment',
      'echo hi',
      '```',
      '',
      '~~~sh',
      '# tilde comment',
      '~~~',
    ].join('\n'),
  );
  const result = run();
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /README\.md:9 → docs\/guide\.md#shell-comment \(missing anchor #shell-comment\)/);
  assert.doesNotMatch(result.stderr, /ignored-in-fence/);
  assert.doesNotMatch(result.stderr, /ignored-inline/);
});
