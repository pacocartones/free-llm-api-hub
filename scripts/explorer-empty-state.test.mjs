import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const EXPLORER_JS = readFileSync(new URL('../site/explorer.js', import.meta.url), 'utf8');
const PROVIDERS = JSON.parse(readFileSync(new URL('../data/providers.json', import.meta.url), 'utf8')).providers;

// A small DOM double with createElement and Element.after, enough for the empty-state button.
function run(search) {
  const listeners = new Map();
  const elements = new Map();
  const element = (id, extra = {}) => {
    const el = {
      id, checked: false, value: '', textContent: '', innerHTML: '', hidden: false,
      style: { display: '' }, options: [], rows: [],
      addEventListener(type, handler) { listeners.set(`${el.id}:${type}`, handler); },
      focus() { focused = el.id; },
      closest() { return { classList: { toggle() {}, add() {}, remove() {} } }; },
      classList: { toggle() {}, add() {}, remove() {} },
      setAttribute() {},
      after(node) { elements.set(node.id, node); },
      ...extra,
    };
    return el;
  };
  let focused = null;
  for (const [id, extra] of [
    ['providers-data', { textContent: JSON.stringify({ providers: PROVIDERS }) }],
    ['q', {}], ['modality', { options: [{ value: 'all' }] }], ['sortSel', { options: [] }],
    ['tbody', {}], ['empty', {}], ['count', {}], ['stats', {}], ['clearFilters', {}],
    ...['f-nocard', 'f-nophone', 'f-commercial', 'f-text', 'f-notrain', 'f-openai', 'f-verified'].map((id) => [id, {}]),
  ]) elements.set(id, element(id, extra));
  const document = {
    getElementById: (id) => elements.get(id),
    querySelectorAll: () => [],
    querySelector: () => null,
    createElement: () => element(''),
    documentElement: { style: { setProperty() {} } },
  };
  const window = {
    FLLM_RULES: { recScore: () => 0, SLA_DAYS: 90, DUE_SOON_DAYS: 60, freshnessStatus: () => 'fresh' },
    FLLM_SORT: { comparator: (a, b, left, right) => String(left.name).localeCompare(String(right.name)) },
    FLLM_ROWS: { rowHtml: () => '<tr></tr>' },
  };
  const location = { search, pathname: '/' };
  new Function('window', 'document', 'history', 'location', 'ResizeObserver', 'fetch', 'navigator', EXPLORER_JS)(
    window, document, { replaceState() {} }, location, undefined, undefined, {});
  return {
    get: (id) => elements.get(id),
    click: (id) => listeners.get(`${id}:click`)(),
    focused: () => focused,
  };
}

test('an empty result offers "Clear all filters", and using it restores every row', () => {
  const page = run('?q=no-provider-is-called-this-zzz');
  assert.equal(page.get('empty').textContent, 'No providers match these filters.');
  const btn = page.get('emptyClear');
  assert.ok(btn, 'the empty state adds its own clear button');
  assert.equal(btn.hidden, false);
  assert.equal(btn.textContent, 'Clear all filters');
  page.click('emptyClear');
  assert.equal(page.get('q').value, '');
  assert.equal(page.get('empty').textContent, '');
  assert.equal(btn.hidden, true, 'the button hides once rows show again');
  assert.equal(page.focused(), 'q', 'keyboard focus moves to the search box, not to <body>');
});

test('a page with results never creates the empty-state button', () => {
  const page = run('');
  assert.equal(page.get('emptyClear'), undefined);
});
