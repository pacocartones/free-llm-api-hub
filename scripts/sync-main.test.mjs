import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as sync from './sync-main.mjs';

test('generated policy expands exact indexed files', () => {
  const allowed = ['README.md', 'derived-fingerprints.json', 'collections/a.md', 'site/new-page/index.html', 'site/café/index.html', 'site/[ab]/index.html'];
  const denied = ['data/providers.json', 'collections-extra/a.md', 'site/styles.css', 'site/site.js', 'site/og/manifest.json', 'site/og.svg', 'site/fonts/a.woff2', 'site/CNAME', 'badge-freshness.json'];
  const paths = sync.generatedPathSet([...allowed, ...denied]);
  for (const p of allowed) assert.ok(paths.has(p), p);
  for (const p of denied) assert.ok(!paths.has(p), p);
  assert.ok(!paths.has('collections'));
});

test('unmerged records preserve literal names and stages', () => {
  const paths = ['collections/a b.md', 'site/a\tb.html', 'site/café/index.html'];
  const oid = 'a'.repeat(40);
  const parsed = sync.parseUnmerged(paths.flatMap(p => [1, 2, 3].map(stage => `100644 ${oid} ${stage}\t${p}\0`)).join(''));
  assert.deepEqual([...parsed.keys()], paths);
  for (const stages of parsed.values()) assert.deepEqual([...stages.keys()], [1, 2, 3]);
  assert.throws(() => sync.parseUnmerged('bad metadata\tx\0'));
  assert.throws(() => sync.parseUnmerged(`100644 ${oid} 2\tx`));
});
