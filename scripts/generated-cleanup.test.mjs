import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { privateTree } from './lib/private-tree.mjs';

test('build removes retired tools, guides and collections while preserving current pages and authored assets', () => {
  const root = privateTree(fileURLToPath(new URL('../', import.meta.url)));
  const build = () => execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: root, stdio: 'pipe' });
  build();
  const authored = readFileSync(join(root, 'site/site.js'), 'utf8');
  const retired = ['collections/retired-test.md', 'site/collections/retired-test.html', 'site/guides/retired-test.html'];
  for (const file of retired) writeFileSync(join(root, file), '<!-- retired generated page -->');
  const current = [];
  for (const file of ['data/coding-tools.json', 'data/coding-tools-own-key.json']) {
    const data = JSON.parse(readFileSync(join(root, file), 'utf8'));
    const removed = data.entries.pop();
    retired.push(`site/coding-tools/${removed.slug}/index.html`);
    current.push(`site/coding-tools/${data.entries[0].slug}/index.html`);
    writeFileSync(join(root, file), JSON.stringify(data));
  }

  build();

  assert.deepEqual(retired.filter((file) => existsSync(join(root, file))), [], 'retired pages must disappear');
  for (const file of [...current, 'collections/README.md', 'collections/no-credit-card.md', 'site/collections/no-credit-card.html', 'site/guides/free-llm-api-without-credit-card.html']) {
    assert.ok(existsSync(join(root, file)), `${file} must be regenerated`);
  }
  for (const file of ['site/guides/index.html', 'site/collections/index.html']) {
    assert.match(readFileSync(join(root, file), 'utf8'), /url=\.\.\/guides-and-collections\//, `${file} keeps its redirect`);
  }
  assert.equal(readFileSync(join(root, 'site/site.js'), 'utf8'), authored, 'authored assets remain untouched');
});
