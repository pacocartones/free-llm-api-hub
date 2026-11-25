// The home explorer keeps the server-rendered rows on first paint (site/explorer.js patchServerRows): it replaces only the
// cells whose markup changes at the visitor's clock, and rebuilds the table as before whenever a filter or sort is active,
// the rows cannot be matched one for one, or the inline data carries no "asof" date.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const EXPLORER_JS = readFileSync(new URL('../site/explorer.js', import.meta.url), 'utf8');
const ASOF = '2026-11-20';
const ASOF_MS = Date.parse(ASOF + 'T00:00:00Z');
const PROVIDERS = [
  { slug: 'alpha', name: 'Alpha', category: 'ongoing', verified: true, last_verified: '2026-11-19' },
  { slug: 'beta', name: 'Beta', category: 'trial', verified: true, last_verified: '2026-11-18' },
];

// A row whose second cell depends on the clock, as the "Verified Nd ago" cell does.
const rowHtml = (p, { now }) => `<tr role="row"><td class="name"><a href="p/${p.slug}">${p.name}</a></td>` +
  `<td class="pver">${now === ASOF_MS ? 'served' : 'live'}-${p.slug}</td></tr>`;

function fakeRow(p) {
  const cells = [0, 1].map((k) => ({ k, outerHTML: null, set html(v) { this.outerHTML = v; } }));
  return {
    slug: p.slug, cells, outerHTML: null, tabIndex: -1,
    querySelector: (sel) => (sel === 'td.name a[href]' ? { getAttribute: () => `p/${p.slug}` } : null),
  };
}

function run({ asof = ASOF, search = '', rows = PROVIDERS.map(fakeRow) } = {}) {
  const el = (id, extra = {}) => ({
    id, checked: false, value: '', textContent: '', innerHTML: '', hidden: false, style: { display: '' }, options: [],
    addEventListener() {}, focus() {}, closest: () => null, classList: { toggle() {}, add() {}, remove() {} }, ...extra,
  });
  const inline = asof ? { asof, providers: PROVIDERS } : { providers: PROVIDERS };
  const tbody = el('tbody', { rows });
  const stats = el('stats', { innerHTML: 'server tiles' });
  const els = new Map([
    ['providers-data', el('providers-data', { textContent: JSON.stringify(inline) })],
    ['tbody', tbody], ['stats', stats],
    ...['q', 'modality', 'sortSel', 'empty', 'count', 'clearFilters', 'f-nocard', 'f-nophone', 'f-commercial', 'f-text',
      'f-notrain', 'f-openai', 'f-verified'].map((id) => [id, el(id)]),
  ]);
  const document = {
    getElementById: (id) => els.get(id), querySelectorAll: () => [], querySelector: () => null,
    documentElement: { style: { setProperty() {} } },
  };
  const window = {
    FLLM_RULES: { SLA_DAYS: 90, freshnessStatus: () => 'fresh' },
    FLLM_SORT: { comparator: (key, dir, a, b) => dir * String(a.name).localeCompare(String(b.name)) },
    FLLM_ROWS: { rowHtml, rowKeyTarget: () => null },
  };
  new Function('window', 'document', 'history', 'location', 'ResizeObserver', 'fetch', 'navigator', EXPLORER_JS)(
    window, document, { replaceState() {} }, { search, pathname: '/' }, undefined, undefined, {});
  return { tbody, stats, rows, count: els.get('count') };
}

test('first paint keeps the server rows and replaces only the cells the visitor clock changes', () => {
  const { tbody, rows, count } = run();
  assert.equal(tbody.innerHTML, '', 'the table is not rebuilt');
  for (const [i, p] of PROVIDERS.entries()) {
    assert.equal(rows[i].outerHTML, null, 'the row element is kept');
    assert.equal(rows[i].cells[0].outerHTML, null, 'an unchanged cell is not touched');
    assert.equal(rows[i].cells[1].outerHTML, `<td class="pver">live-${p.slug}</td>`, 'the clock-dependent cell is replaced');
  }
  assert.equal(count.textContent, '2 providers', 'the rest of the first render still runs');
});

test('first paint rebuilds the table as before when it cannot reuse the server rows', () => {
  const live = PROVIDERS.map((p) => rowHtml(p, { now: 1 })).join('\n');
  assert.equal(run({ asof: null }).tbody.innerHTML, live, 'no asof in the inline data');
  assert.equal(run({ search: '?q=alpha' }).tbody.innerHTML, rowHtml(PROVIDERS[0], { now: 1 }), 'a filter from the URL');
  assert.equal(run({ rows: [fakeRow(PROVIDERS[1]), fakeRow(PROVIDERS[0])] }).tbody.innerHTML, live, 'rows in another order');
  assert.equal(run({ rows: [fakeRow(PROVIDERS[0])] }).tbody.innerHTML, live, 'a different number of rows');
});

test('the build inlines the date the server rows are rendered for', () => {
  const build = readFileSync(new URL('./build.mjs', import.meta.url), 'utf8');
  assert.match(build, /id="providers-data">\{"asof":"\$\{ASOF\}",\\n"providers":\[/);
  assert.match(build, /rows\.explorerRowHtml\(p, \{ now: ASOF \}\)/, 'the same ASOF dates the server rows');
});
