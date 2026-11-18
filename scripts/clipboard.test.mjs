import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const site = readFileSync(new URL('../site/site.js', import.meta.url), 'utf8');
function fixture(clipboard) {
  let click;
  const classes = new Set(), attrs = new Map();
  const button = { textContent: 'Copy', dataset: {}, classList: { add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x) }, setAttribute: (k, v) => attrs.set(k, v), getAttribute: k => attrs.get(k), addEventListener: (_n, fn) => { click = fn; } };
  const navigator = clipboard ? { clipboard: { writeText: clipboard } } : {};
  const pre = { querySelector: () => ({ innerText: 'sample code' }), appendChild() {} };
  const document = { documentElement: {}, getElementById: () => null, querySelector: () => null, querySelectorAll: s => s === 'pre' ? [pre] : [], createElement: () => button };
  runInNewContext(site, { document, navigator });
  return { button, click };
}
for (const state of ['missing', 'denied']) test(`code block: ${state} clipboard does not announce success`, async () => {
  const f = fixture( state === 'denied' ? () => Promise.reject(new Error('denied')) : null);
  await f.click(); await new Promise(setImmediate);
  assert.equal(f.button.classList.contains('copied'), false);
  assert.match(f.button.textContent, /Copy failed/);
});
test(`code block: waits for copying, prevents duplicate writes, and allows retry`, async () => {
  let finish, calls = 0;
  const f = fixture( () => { calls++; return new Promise(resolve => { finish = resolve; }); });
  const pending = f.click();
  await f.click();
  assert.equal(calls, 1);
  assert.equal(f.button.classList.contains('copied'), false);
  finish(); await pending;
  assert.equal(f.button.classList.contains('copied'), true);
  const retry = f.click();
  assert.equal(calls, 2);
  assert.equal(f.button.classList.contains('copied'), false);
  finish(); await retry;
  assert.match(f.button.textContent, /Copied/);
});
