// The shared HTML escapers in scripts/lib/html.mjs: which characters each one escapes, and what it does with values
// that are not strings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, escapeAttr, escapeText } from './lib/html.mjs';

const ALL = `a & b < c > d " e ' f`;

test('escapeHtml escapes & < > " and \'', () => {
  assert.equal(escapeHtml(ALL), 'a &amp; b &lt; c &gt; d &quot; e &#39; f');
  assert.equal(escapeHtml('<script>alert("x")</script>'), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
  assert.equal(escapeHtml(`<a href='x'>`), '&lt;a href=&#39;x&#39;&gt;');
});

test('escapeAttr escapes & < > " and leaves \' as is', () => {
  assert.equal(escapeAttr(ALL), `a &amp; b &lt; c &gt; d &quot; e ' f`);
});

test('escapeText escapes & < > and leaves both quotes as is', () => {
  assert.equal(escapeText(ALL), `a &amp; b &lt; c &gt; d " e ' f`);
});

test('& is escaped first, so an existing entity is escaped once, not twice', () => {
  for (const fn of [escapeHtml, escapeAttr, escapeText]) {
    assert.equal(fn('&lt;'), '&amp;lt;', fn.name);
    assert.equal(fn('&amp;'), '&amp;amp;', fn.name);
  }
});

test('non-string input: null and undefined become empty, anything else goes through String()', () => {
  for (const fn of [escapeHtml, escapeAttr, escapeText]) {
    assert.equal(fn(null), '', fn.name);
    assert.equal(fn(undefined), '', fn.name);
    assert.equal(fn(), '', fn.name);
    assert.equal(fn(0), '0', fn.name);
    assert.equal(fn(42), '42', fn.name);
    assert.equal(fn(false), 'false', fn.name);
    assert.equal(fn(['a', '<b>']), 'a,&lt;b&gt;', fn.name);
    assert.equal(fn({ toString: () => '<x>' }), '&lt;x&gt;', fn.name);
  }
});

test('plain text without special characters comes back unchanged', () => {
  for (const fn of [escapeHtml, escapeAttr, escapeText]) assert.equal(fn('Free LLM API Hub — 2026'), 'Free LLM API Hub — 2026', fn.name);
});

test('escapeHtml survives serialisation: its source text alone is a working function (client bundles rely on it)', () => {
  const copy = new Function(`return (${escapeHtml.toString()});`)();
  assert.equal(copy(ALL), escapeHtml(ALL));
  assert.equal(copy(null), '');
});
