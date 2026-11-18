import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const site = readFileSync(new URL('../site/site.js', import.meta.url), 'utf8');

function fixture({ withSearch = true } = {}) {
  let keydown = null;
  let focused = 0;
  const search = { focus: () => { focused++; } };
  const document = {
    documentElement: {},
    getElementById: (id) => (id === 'q' && withSearch ? search : null),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: (type, fn) => { if (type === 'keydown') keydown = fn; },
  };
  runInNewContext(site, { document, navigator: {} });
  const press = (key, target = { tagName: 'BODY' }, mods = {}) => {
    let prevented = false;
    keydown({ key, target, defaultPrevented: false, preventDefault: () => { prevented = true; }, ...mods });
    return prevented;
  };
  return { press, focused: () => focused, hasHandler: () => keydown !== null };
}

test('"/" focuses the search box from the page body', () => {
  const f = fixture();
  assert.equal(f.press('/'), true);
  assert.equal(f.focused(), 1);
});

test('"/" is left alone while typing in a field or with a modifier', () => {
  const f = fixture();
  for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) assert.equal(f.press('/', { tagName }), false);
  assert.equal(f.press('/', { tagName: 'DIV', isContentEditable: true }), false);
  assert.equal(f.press('/', { tagName: 'BODY' }, { ctrlKey: true }), false);
  assert.equal(f.press('a'), false);
  assert.equal(f.focused(), 0);
});

test('pages without a search box register no shortcut', () => {
  assert.equal(fixture({ withSearch: false }).hasHandler(), false);
});
