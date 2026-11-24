// anonymous_access (issue #182): the validator rule, the shared collection filter and the generated pages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COLLECTIONS } from './lib/collections.mjs';
import { tmpFile } from './lib/tmp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data/providers.json');
const data = () => JSON.parse(readFileSync(DATA, 'utf8'));

const validateAfter = (mutate) => {
  const d = data();
  mutate(d);
  const fixture = tmpFile('providers.json');
  writeFileSync(fixture, JSON.stringify(d));
  return spawnSync(process.execPath, ['scripts/validate.mjs', fixture], { cwd: ROOT, encoding: 'utf8' }).status === 0;
};

test('anonymous_access: the validator accepts a sourced statement and rejects the rest', () => {
  const good = { source: 'https://example.com/docs', checked: '2026-10-09', quote: 'No account needed.' };
  const target = (d) => d.providers.find((p) => !p.anonymous_access);
  assert.equal(validateAfter((d) => { target(d).anonymous_access = { ...good }; }), true, 'a sourced statement passes');
  assert.equal(validateAfter((d) => { target(d).anonymous_access = { ...good, note: 'Lowest priority.' }; }), true, 'with a note');
  assert.equal(validateAfter((d) => { target(d).anonymous_access = { ...good, note: null }; }), true, 'with a null note');
  assert.equal(validateAfter((d) => { target(d).anonymous_access = null; }), true, 'null is allowed');
  for (const bad of [{ source: 'javascript:alert(1)' }, { source: '' }, { checked: '2999-01-01' }, { checked: 'yesterday' }, { quote: '' }, { quote: 'x'.repeat(301) }, { note: '' }, { note: 'x'.repeat(301) }, { extra: 1 }]) {
    assert.equal(validateAfter((d) => { target(d).anonymous_access = { ...good, ...bad }; }), false, `rejected: ${JSON.stringify(bad).slice(0, 40)}`);
  }
  for (const key of ['source', 'checked', 'quote']) {
    assert.equal(validateAfter((d) => { const t = target(d); t.anonymous_access = { ...good }; delete t.anonymous_access[key]; }), false, `${key} is required`);
  }
});

test('the anonymous-access collection lists exactly the verified providers with a sourced statement', () => {
  const coll = COLLECTIONS.find((c) => c.slug === 'anonymous-access');
  assert.ok(coll, 'the collection is defined');
  const { providers } = data();
  const expected = providers.filter((p) => p.verified === true && p.anonymous_access).map((p) => p.slug).sort();
  assert.deepEqual(providers.filter(coll.filter).map((p) => p.slug).sort(), expected);
  assert.ok(expected.length >= 2, 'a first version rests on at least two sourced providers');
  assert.equal(coll.filter({ verified: false, anonymous_access: { source: 'https://x.example', checked: '2026-01-01', quote: 'q' } }), false, 'unverified rows stay out');
  assert.equal(coll.filter({ verified: true, anonymous_access: null }), false, 'unknown stays unknown');
});

test('the generated anonymous-access pages quote each provider and keep the shared page structure', () => {
  const { providers } = data();
  const rows = providers.filter((p) => p.verified === true && p.anonymous_access);
  const md = readFileSync(join(ROOT, 'collections/anonymous-access.md'), 'utf8');
  const html = readFileSync(join(ROOT, 'site/collections/anonymous-access.html'), 'utf8');
  assert.match(md, new RegExp(`\\*\\*${rows.length} of \\d+ tracked providers\\*\\* match`));
  for (const p of rows) {
    assert.ok(md.includes(p.anonymous_access.quote.replace(/\|/g, '\\|')), `${p.slug}: quote in markdown`);
    assert.ok(md.includes(`(read ${p.anonymous_access.checked})`), `${p.slug}: reading date in markdown`);
    assert.ok(html.includes(`(read ${p.anonymous_access.checked})`), `${p.slug}: reading date in HTML`);
  }
  assert.match(html, /<h1[^>]*>Free AI APIs you can call with no account<\/h1>/);
  assert.match(html, /<a href="anonymous-access" class="active" aria-current="page">/, 'the collection nav marks the current page');
  assert.match(html, /<link rel="canonical" href="https:\/\/freellmapihub\.com\/collections\/anonymous-access"/);
  assert.match(html, /"@type":"ItemList"/);
  assert.ok(readFileSync(join(ROOT, 'collections/README.md'), 'utf8').includes('(anonymous-access.md)'), 'listed in the collections hub');
});
