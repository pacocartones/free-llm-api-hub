// Regression tests for the explorer's XSS fix (CodeQL js/xss-through-dom).
// providers.json is editable via community PRs, so provider data must never
// pass through innerHTML — rows render from a static skeleton plus DOM
// assignments. The script is a classic (non-module) script, so it runs here
// inside a minimal DOM stub that records innerHTML writes and textContent
// assignments separately.
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
    options: [], textContent: '', innerHTML: '', href: '', className: '', title: '',
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    addEventListener: noop, setAttribute: noop, getAttribute: () => null,
    appendChild: noop, prepend: noop, insertBefore: noop,
    closest: () => null,
    ...extra,
  };
  return new Proxy(el, { get: (t, k) => (k in t ? t[k] : noop) });
}

// A created element with per-selector child lookup, recording every innerHTML
// string it receives and every child appended.
function makeRowEl(record) {
  const cells = new Map();
  const el = {
    innerHTML: '',
    children: [],
    appendChild(c) { this.children.push(c); },
    prepend(c) { this.children.unshift(c); },
    insertBefore(c) { this.children.push(c); },
    querySelector(sel) {
      if (!cells.has(sel)) cells.set(sel, makeRowEl(record));
      return cells.get(sel);
    },
  };
  return new Proxy(el, {
    get: (t, k) => (k in t ? t[k] : noop),
    set: (t, k, v) => {
      if (k === 'innerHTML') record.innerHTMLWrites.push({ html: v });
      t[k] = v;
      return true;
    },
  });
}

// Renders one provider through site/explorer.js and returns the record of DOM
// writes: every innerHTML string assigned anywhere, plus the row element.
async function renderRows(provider) {
  const record = { innerHTMLWrites: [] };
  const rows = [];
  const tbody = makeEl({ appendChild: (tr) => rows.push(tr) });
  const byId = {
    'providers-data': makeEl({ textContent: JSON.stringify({ providers: [provider] }) }),
    tbody,
  };
  const documentStub = {
    getElementById: (id) => byId[id] || makeEl(),
    querySelectorAll: () => [],
    createElement: () => makeRowEl(record),
    createTextNode: (t) => ({ nodeType: 3, textContent: String(t) }),
  };
  const windowStub = { FLLM_RULES: { recScore: () => 0, FLAG_PAIRS: [], SLA_DAYS: 90, DUE_SOON_DAYS: 60 } };
  new Function('window', 'document', 'history', 'location', 'navigator', 'fetch', CODE)(
    windowStub, documentStub, { replaceState: noop }, { search: '', pathname: '/' }, {},
    () => Promise.reject(new Error('no network in tests')),
  );
  await new Promise((r) => setTimeout(r, 50));
  return { record, rows };
}

// All innerHTML writes anywhere during a render must be data-free: the row
// skeleton and the badge/icon snippets are static markup.
function assertStaticOnlyInnerHTML(record) {
  for (const { html } of record.innerHTMLWrites) {
    assert.ok(!/<(img|script)|onerror|onmouseover|alert\(/.test(html), `data reached innerHTML:\n${html}`);
  }
}

const base = {
  slug: 'evil', name: 'Evil', category: 'ongoing', free_tier: 'free', notes: 'n',
  rate_limits: '10 rpm', verified: true, last_verified: '2026-08-01', card_required: false,
};

test('an HTML payload in any provider field never becomes markup', async () => {
  const payload = '<img src=x onerror=alert(1)>';
  const { record, rows } = await renderRows({
    ...base,
    name: `Evil ${payload}`, free_tier: `free ${payload}`, notes: `notes ${payload}`,
    best_for: `best ${payload}`, last_verified: `2026-08-01 ${payload}`,
  });
  assert.equal(rows.length, 1);
  assertStaticOnlyInnerHTML(record);
  // the payload survives as plain text, not markup
  const nameCell = rows[0].querySelector('td.name');
  const anchor = nameCell.children.find((c) => c && c.href);
  assert.ok(anchor, 'valid slug keeps its anchor');
  assert.equal(anchor.textContent, `Evil ${payload}`);
  assert.equal(rows[0].querySelector('.notes').textContent, `notes ${payload}`);
  assert.equal(rows[0].querySelector('[data-label="What\'s free"]').textContent, `free ${payload}`);
});

test('a slug that is not kebab-case renders the name without a link', async () => {
  const { record, rows } = await renderRows({ ...base, slug: 'x" onmouseover="alert(1)' });
  assert.equal(rows.length, 1);
  assertStaticOnlyInnerHTML(record);
  const nameCell = rows[0].querySelector('td.name');
  assert.ok(!nameCell.children.some((c) => c && c.href), 'invalid slug must drop the anchor');
  const text = nameCell.children.find((c) => c && c.nodeType === 3);
  assert.equal(text.textContent, 'Evil');
});

test('a normal provider keeps its link to the detail page', async () => {
  const { rows } = await renderRows({ ...base, slug: 'groq', name: 'Groq' });
  const nameCell = rows[0].querySelector('td.name');
  const anchor = nameCell.children.find((c) => c && c.href);
  assert.equal(anchor.href, 'p/groq.html');
  assert.equal(anchor.textContent, 'Groq');
});
