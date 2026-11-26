import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { safeHttp, safeUrl, plural } from './lib/text.mjs';

const LIB = join(dirname(fileURLToPath(import.meta.url)), 'lib');

test('safeHttp keeps an http(s) URL as it is and drops anything else', () => {
  assert.equal(safeHttp('https://example.com/a?b=1&c=2'), 'https://example.com/a?b=1&c=2');
  assert.equal(safeHttp('HTTP://example.com'), 'HTTP://example.com');
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', '//example.com', ' https://example.com', '', null, undefined, 0]) {
    assert.equal(safeHttp(bad), '', String(bad));
  }
});

test('safeUrl is safeHttp, HTML-escaped for an attribute', () => {
  assert.equal(safeUrl('https://example.com/?a=1&b="2"'), 'https://example.com/?a=1&amp;b=&quot;2&quot;');
  assert.equal(safeUrl('javascript:alert(1)'), '');
  assert.equal(safeUrl(null), '');
});

test('plural adds an s by default and takes an irregular plural', () => {
  assert.equal(plural(1, 'provider'), '1 provider');
  assert.equal(plural(0, 'provider'), '0 providers');
  assert.equal(plural(2, 'entry', 'entries'), '2 entries');
  assert.equal(plural(1, 'entry', 'entries'), '1 entry');
});

test('page generators import these helpers instead of defining their own copy', () => {
  // Code shipped to the browser as source text (rows.mjs, compare.mjs, find.mjs) cannot import, so it is exempt.
  const exempt = new Set(['text.mjs', 'rows.mjs', 'compare.mjs', 'find.mjs']);
  const copies = readdirSync(LIB).filter((f) => f.endsWith('.mjs') && !exempt.has(f))
    .filter((f) => /^const (safeHttp|safeUrl|plural) = /m.test(readFileSync(join(LIB, f), 'utf8')));
  assert.deepEqual(copies, ['changes.mjs', 'provider-sections.mjs'], 'known copies, left while open pull requests edit those files; a new copy should import lib/text.mjs');
});
