import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { makeTmpDir } from './lib/tmp.mjs';

const script = readFileSync(new URL('./check-links.mjs', import.meta.url), 'utf8');
function fixture(file, markdown) {
  const root = makeTmpDir('doc-links-');
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

test('external links, anchors and GitHub issue shortcuts stay offline; ignored files are excluded', () => {
  const { write, run } = fixture('README.md', '[web](https://example.invalid/)\n[mail](mailto:a@example.invalid)\n[heading](#title)\n[issue](../../issues/new?template=inaccuracy.yml)');
  write('.gitignore', 'node_modules/\n');
  write('node_modules/example/README.md', '[missing](missing.md)');
  const result = run();
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
