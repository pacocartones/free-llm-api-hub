// Generated endpoint rows and API-specific clipboard feedback.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script, createContext } from 'node:vm';
const source = readFileSync(new URL('../site/site.js', import.meta.url), 'utf8');
const build = readFileSync(new URL('./build.mjs', import.meta.url), 'utf8');
// Execute the real apiRow and sanitizer from the pinned build source, without running the build.
const esc = build.split('\n').find(l => l.startsWith('const htmlEsc ='));
const rowSource = build.match(/const apiRow =[\s\S]*?(?=\n\/\/ Client-config section)/)[0];
const ctx = createContext({ SITE: 'https://freellmapihub.com' });
new Script(esc + '\n' + rowSource + '\nglobalThis.renderRow = apiRow;').runInContext(ctx);

for (const [path, count] of [['providers.json', 67], ['schema.json', null], ['modality/text.json', 21]]) {
  test('endpoint row supplies accessible copy and curl for ' + path, () => {
    const html = ctx.renderRow('Data <unsafe>', path, count);
    assert.ok(html.includes('href="v1/' + path + '"'), 'keep native endpoint link');
    assert.ok(html.includes('type="button"'), 'native keyboard-operable button');
    assert.ok(html.includes('aria-label="Copy endpoint URL: https://freellmapihub.com/api/v1/' + path + '"'));
    assert.ok(html.includes('data-api-url="https://freellmapihub.com/api/v1/' + path + '"'));
    assert.ok(html.includes('curl --fail --silent --show-error https://freellmapihub.com/api/v1/' + path));
    assert.ok(html.includes('role="status"'), 'announce feedback');
    assert.ok(html.includes('Data &lt;unsafe&gt;') && !html.includes('Data <unsafe>'));
    assert.ok(!html.includes('jq'), 'schema/YAML rows need no providers-only projection');
  });
}

function fixture(clipboard) {
  const timers = [], writes = [];
  function button(url) {
    const events = {}, attributes = new Map();
    const status = { textContent: '' }, classes = new Set();
    return {
      textContent: 'Copy', disabled: false,
      classList: { add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x) },
      getAttribute: key => key === 'data-api-url' ? url : (attributes.get(key) ?? null),
      setAttribute: (key, value) => attributes.set(key, String(value)),
      parentElement: { querySelector: sel => sel === '.api-copy-status' ? status : null },
      addEventListener: (name, fn) => { events[name] = fn; },
      status,
      click: () => { assert.equal(typeof events.click, 'function', 'API copy handler must be registered'); return events.click(); },
    };
  }
  const buttons = [button('https://freellmapihub.com/api/v1/providers.json'), button('https://freellmapihub.com/api/v1/schema.json')];
  const document = {
    documentElement: {}, getElementById: () => null, querySelector: () => null,
    querySelectorAll: sel => sel === '.api-copy' ? buttons : [],
  };
  const navigator = clipboard ? { clipboard: { writeText: url => { writes.push(url); return clipboard(url); } } } : {};
  new Script(source).runInContext(createContext({ document, navigator, setTimeout: fn => timers.push(fn) }));
  return { buttons, timers, writes };
}

test('copy waits for completion and keeps success until the next attempt', async () => {
  let complete;
  const f = fixture(() => new Promise(resolve => { complete = resolve; }));
  const b = f.buttons[0], pending = b.click();
  assert.equal(b.textContent, 'Copy');
  assert.equal(b.disabled, false, 'keep the native button focusable during copy');
  assert.equal(b.getAttribute('aria-disabled'), 'true');
  assert.equal(b.classList.contains('copied'), false);
  assert.deepEqual(f.writes, ['https://freellmapihub.com/api/v1/providers.json']);
  complete(); await pending;
  assert.equal(b.textContent, 'Copied');
  assert.equal(b.classList.contains('copied'), true);
  assert.equal(b.status.textContent, 'URL copied.');
  assert.equal(b.disabled, false);
  f.timers.forEach(fn => fn());
  assert.equal(b.textContent, 'Copied');
  assert.equal(b.classList.contains('copied'), true);
  assert.equal(b.status.textContent, 'URL copied.');
});

test('clipboard rejection leaves a truthful manual-copy path', async () => {
  const f = fixture(() => Promise.reject(new Error('permission denied')));
  await f.buttons[0].click();
  assert.equal(f.buttons[0].textContent, 'Copy');
  assert.equal(f.buttons[0].classList.contains('copied'), false);
  assert.equal(f.buttons[0].disabled, false);
  assert.equal(f.buttons[0].status.textContent, 'Copy failed. Copy the endpoint link address manually.');
});

test('missing clipboard API never announces success', async () => {
  const f = fixture(null);
  await f.buttons[0].click();
  assert.equal(f.buttons[0].textContent, 'Copy');
  assert.equal(f.buttons[0].status.textContent, 'Copy failed. Copy the endpoint link address manually.');
  assert.equal(f.writes.length, 0);
});

test('copy is scoped to its own endpoint row', async () => {
  const f = fixture(() => Promise.resolve());
  await f.buttons[1].click();
  assert.deepEqual(f.writes, ['https://freellmapihub.com/api/v1/schema.json']);
  assert.equal(f.buttons[0].textContent, 'Copy');
  assert.equal(f.buttons[0].status.textContent, '');
});

test('other pages with no API copy buttons remain usable', () => {
  const document = { documentElement: {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] };
  assert.doesNotThrow(() => new Script(source).runInContext(createContext({ document, navigator: {}, setTimeout })));
});

test('a later attempt clears success while pending and reports its own failure', async () => {
  let attempt = 0, reject;
  const f = fixture(() => ++attempt === 1 ? Promise.resolve() : new Promise((resolve, fail) => { reject = fail; }));
  const b = f.buttons[0];
  await b.click();
  const pending = b.click();
  assert.equal(b.textContent, 'Copy');
  assert.equal(b.classList.contains('copied'), false);
  assert.equal(b.status.textContent, '');
  assert.equal(b.disabled, false, 'keep the native button focusable during copy');
  assert.equal(b.getAttribute('aria-disabled'), 'true');
  reject(new Error('denied')); await pending;
  f.timers.forEach(fn => fn());
  assert.equal(b.status.textContent, 'Copy failed. Copy the endpoint link address manually.');
  assert.equal(b.textContent, 'Copy');
  assert.equal(b.disabled, false);
});

test('a retry after rejection can succeed without stale error feedback', async () => {
  let attempt = 0, resolve;
  const f = fixture(() => ++attempt === 1 ? Promise.reject(new Error('denied')) : new Promise(done => { resolve = done; }));
  const b = f.buttons[0];
  await b.click();
  const pending = b.click();
  assert.equal(b.status.textContent, '');
  assert.equal(b.textContent, 'Copy');
  resolve(); await pending;
  f.timers.forEach(fn => fn());
  assert.equal(b.status.textContent, 'URL copied.');
  assert.equal(b.textContent, 'Copied');
});

test('pending activation cannot start a second clipboard write', async () => {
  let complete;
  const f = fixture(() => new Promise(resolve => { complete = resolve; }));
  const b = f.buttons[0], pending = b.click();
  const repeated = b.click();
  assert.equal(f.writes.length, 1);
  assert.equal(b.getAttribute('aria-disabled'), 'true');
  complete(); await pending; await repeated;
  assert.equal(b.getAttribute('aria-disabled'), 'false');
  assert.equal(b.textContent, 'Copied');
});
