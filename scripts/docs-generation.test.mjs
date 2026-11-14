import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { privateTree } from './lib/private-tree.mjs';
import { STATIC_TARGETS } from './generated-targets.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
test('build derives flag gaps without rewriting hand-written field definitions', () => {
  const out = privateTree(root);
  const file = join(out, 'docs/comparison-dimensions.md');
  const before = readFileSync(file, 'utf8').replace(/Current gaps:[^\n]*/, 'Current gaps: stale.');
  writeFileSync(file, before);
  execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: out, stdio: 'pipe' });
  const after = readFileSync(file, 'utf8');
  const { providers } = JSON.parse(readFileSync(join(out, 'data/providers.json'), 'utf8'));
  const counts = ['phone_required', 'commercial_ok', 'card_required'].map((key) => `\`${key}\` ${providers.filter((p) => p[key] === null).length}/${providers.length}`).join(', ');
  assert.ok(after.includes(`Current gaps: ${counts}.`));
  assert.equal(after.replace(/Current gaps:[^\n]*/, 'Current gaps: stale.'), before);
  assert.ok(STATIC_TARGETS.includes('docs/comparison-dimensions.md'), 'generated doc is covered by drift checks');
});
