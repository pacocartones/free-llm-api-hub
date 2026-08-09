// Regression tests for the explorer's XSS fix (CodeQL js/xss-through-dom).
// providers.json is editable via community PRs, so every field the explorer
// interpolates into tr.innerHTML must be escaped. The script is a classic
// (non-module) script, so it runs here inside a minimal DOM stub and the HTML
// it assigns to innerHTML is captured and inspected.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CODE = readFileSync(join(ROOT, 'site/explorer.js'), 'utf8');

const noop = () => {};
function makeEl(extra = {}) {
  const el = {
    value: '', checked: false, hidden: false, style: {}, dataset: {},
    options: [], textContent: '', innerHTML: '',
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    addEventListener: noop, setAttribute: noop, getAttribute: () => null,
    appendChild: noop,
    closest: () => null,
    ...extra,
  };
  return new Proxy(el, { get: (t, k) => (k in t ? t[k] : noop) });
}

// Renders one provider through site/explorer.js and returns the HTML strings
// the script assigned to tr.innerHTML.
async function renderRows(provider) {
  const captured = [];
  const tbody = makeEl({ appendChild: (tr) => captured.push(tr.innerHTML) });
  const byId = {
    'providers-data': makeEl({ textContent: JSON.stringify({ providers: [provider] }) }),
    tbody,
  };
  const documentStub = {
    getElementById: (id) => byId[id] || makeEl(),
    querySelectorAll: () => [],
    createElement: () => {
      let html = '';
      const el = makeEl();
      Object.defineProperty(el, 'innerHTML', { get: () => html, set: (v) => { html = v; } });
      return el;
    },
  };
  const windowStub = { FLLM_RULES: { recScore: () => 0, FLAG_PAIRS: [] } };
  new Function('window', 'document', 'history', 'location', 'navigator', 'fetch', CODE)(
    windowStub, documentStub, { replaceState: noop }, { search: '', pathname: '/' }, {},
    () => Promise.reject(new Error('no network in tests')),
  );
  await new Promise((r) => setTimeout(r, 50));
  return captured;
}

const base = {
  slug: 'evil', name: 'Evil', category: 'ongoing', free_tier: 'free', notes: 'n',
  rate_limits: '10 rpm', verified: true, last_verified: '2026-08-01', card_required: false,
};

test('an HTML payload in any provider field never reaches innerHTML raw', async () => {
  const payload = '<img src=x onerror=alert(1)>';
  const rows = await renderRows({
    ...base,
    name: `Evil ${payload}`, free_tier: `free ${payload}`, notes: `notes ${payload}`,
    best_for: `best ${payload}`, last_verified: `2026-08-01 ${payload}`,
  });
  assert.equal(rows.length, 1);
  assert.ok(!rows[0].includes(payload), `payload reached innerHTML raw:\n${rows[0]}`);
  assert.ok(rows[0].includes('&lt;img'), 'payload should appear escaped');
  // the explorer's own markup must survive escaping
  assert.match(rows[0], /<span class="badge b-ok">/);
  assert.match(rows[0], /<svg class="i"/);
});

test('a slug that is not kebab-case renders the name without a link', async () => {
  const rows = await renderRows({ ...base, slug: 'x" onmouseover="alert(1)' });
  assert.equal(rows.length, 1);
  assert.ok(!rows[0].includes('onmouseover'), 'malicious slug must not reach the href');
  assert.ok(!/<a href/.test(rows[0]), 'invalid slug should drop the anchor');
  assert.ok(rows[0].includes('Evil'), 'name still renders');
});

test('a normal provider keeps its link to the detail page', async () => {
  const rows = await renderRows({ ...base, slug: 'groq', name: 'Groq' });
  assert.match(rows[0], /<a href="p\/groq\.html">Groq<\/a>/);
});
