// GA4 product events (the events section of lib/consent.client.js, and the provider-link attributes from
// lib/provider-links.mjs). The consent script runs against a small fake DOM: each event's payload is checked, and the
// consent gate (nothing is sent unless the analytics category is granted).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { consentScript } from './lib/analytics.mjs';
import { providerLinkTargets, tagProviderLinks, LINK_TYPES } from './lib/provider-links.mjs';

const ID = 'G-TEST12345X';
const saved = (analytics, ads) => JSON.stringify({ v: 1, analytics, ads, at: '2026-11-24' });

// A fake element: `sels` lists the selectors (as written in the script) it answers in closest(); `parent` chains them.
function el({ sels = [], attrs = {}, parent = null, id = '', ...rest } = {}) {
  const e = {
    sels, attrs, parent, id, ...rest,
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    classList: { contains: (c) => sels.includes('.' + c) },
    closest(sel) {
      const parts = sel.split(',').map((s) => s.trim());
      for (let n = this; n; n = n.parent) if (parts.some((s) => n.sels.includes(s))) return n;
      return null;
    },
  };
  return e;
}

function page({ consent = null, path = '/', search = '' } = {}) {
  const listeners = {};
  const timers = [];
  const q = el({ id: 'q', value: '' });
  const document = {
    readyState: 'complete',
    head: { appendChild() {} },
    body: { insertBefore() {}, firstChild: null },
    createElement: () => el({ setAttribute() {}, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] }),
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: (i) => (i === 'q' ? q : null),
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
    cookie: '',
  };
  const store = new Map(consent ? [['cookie-consent', consent]] : []);
  const window = {};
  const ctx = {
    window, document, URL,
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
    location: { hostname: 'freellmapihub.com', pathname: path, search, href: `https://freellmapihub.com${path}${search}` },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: (n) => { if (timers[n - 1]) timers[n - 1].fn = null; },
  };
  runInNewContext(consentScript(ID), ctx);
  const fire = (type, target, extra = {}) => (listeners[type] || []).forEach((fn) => fn({ target, ...extra }));
  // JSON round trip: the script runs in another realm, so its arrays and objects are not this realm's.
  const events = () => JSON.parse(JSON.stringify((window.dataLayer || []).map((a) => Array.from(a)).filter((c) => c[0] === 'event').map((c) => [c[1], c[2]])));
  return { window, q, fire, events, timers, runTimers: () => timers.splice(0).forEach((t) => t.fn && t.fn()) };
}

const link = (href, attrs = {}) => el({ sels: ['a[href]'], attrs: { href, ...attrs } });

describe('consent gate', () => {
  for (const [label, consent] of [['no choice', null], ['everything rejected', saved(false, false)], ['advertising only', saved(false, true)]]) {
    test(`${label}: no product event is sent`, () => {
      const p = page({ consent, path: '/compare/groq-vs-openrouter/' });
      p.fire('click', link('https://groq.com', { 'data-provider': 'groq', 'data-link': 'website' }));
      p.fire('click', link('/providers.json'));
      p.fire('click', link('https://github.com/pacocartones/free-llm-api-hub'));
      p.fire('change', el({ id: 'f-nocard', checked: true }));
      p.q.value = 'llama';
      p.fire('keydown', p.q, { key: 'Enter' });
      assert.deepEqual(p.events(), []);
    });
  }

  test('analytics granted: events flow', () => {
    const p = page({ consent: saved(true, false) });
    p.fire('click', link('https://groq.com', { 'data-provider': 'groq', 'data-link': 'website' }));
    assert.equal(p.events().length, 1);
  });
});

describe('event payloads (analytics granted)', () => {
  const on = (opts = {}) => page({ consent: saved(true, false), ...opts });

  test('outbound_provider_click: provider slug and link type from the fixed list only', () => {
    const p = on({ path: '/p/groq' });
    for (const t of LINK_TYPES) p.fire('click', link('https://example.com/x', { 'data-provider': 'groq', 'data-link': t }));
    p.fire('click', link('https://example.com/x', { 'data-provider': 'groq', 'data-link': 'pricing-page' }));
    p.fire('click', link('https://example.com/x', { 'data-provider': 'Groq <b>', 'data-link': 'docs' }));
    p.fire('click', link('https://example.com/x'));
    p.fire('auxclick', link('https://example.com/x', { 'data-provider': 'groq', 'data-link': 'docs' }), { button: 1 });
    assert.deepEqual(p.events(), [...LINK_TYPES.map((t) => ['outbound_provider_click', { provider: 'groq', link_type: t }]), ['outbound_provider_click', { provider: 'groq', link_type: 'docs' }]]);
  });

  test('repo_click: links to this repository only, with the location from the fixed list', () => {
    const p = on({ path: '/p/groq' });
    const REPO = 'https://github.com/pacocartones/free-llm-api-hub';
    const inside = (sel, href) => el({ sels: ['a[href]'], attrs: { href }, parent: el({ sels: [sel] }) });
    p.fire('click', inside('.site-header', REPO));
    p.fire('click', inside('.site-footer', REPO));
    p.fire('auxclick', inside('.site-footer', REPO), { button: 1 });
    p.fire('click', link(`${REPO}/issues/new?template=add-provider.yml`));
    p.fire('click', link(`${REPO}/discussions`));
    p.fire('click', link(`${REPO}/blob/main/CONTRIBUTING.md`));
    p.fire('click', link(`${REPO}/blob/main/docs/api.md`));
    p.fire('click', link(REPO, { 'data-repo-location': 'contribute' }));
    p.fire('click', link(REPO, { 'data-repo-location': 'someone@example.com' }));
    // not this repository: no event
    for (const href of ['https://github.com/pacocartones', 'https://github.com/someone/free-llm-api-hub', 'https://github.com/pacocartones/free-llm-api-hub-fork', 'https://example.com/pacocartones/free-llm-api-hub']) p.fire('click', link(href));
    assert.deepEqual(p.events(), ['header', 'footer', 'footer', 'contribute', 'contribute', 'contribute', 'content', 'contribute', 'content'].map((location) => ['repo_click', { location }]));
  });

  test('repo_click: any repository link on /contributing/ or /submit/ counts as contribute', () => {
    for (const path of ['/contributing/', '/submit/']) {
      const p = on({ path });
      p.fire('click', link('https://github.com/pacocartones/free-llm-api-hub/blob/main/README.md'));
      p.fire('click', el({ sels: ['a[href]'], attrs: { href: 'https://github.com/pacocartones/free-llm-api-hub' }, parent: el({ sels: ['.site-header'] }) }));
      assert.deepEqual(p.events(), [['repo_click', { location: 'contribute' }], ['repo_click', { location: 'header' }]]);
    }
  });

  test('copy_snippet: kind from the code block, never its text', () => {
    const p = on();
    const block = (text) => {
      const pre = el({ sels: ['pre'] });
      pre.querySelector = () => ({ textContent: text });
      return el({ sels: ['.pre-copy'], parent: pre });
    };
    p.fire('click', block('curl https://api.groq.com/openai/v1/chat/completions \\'));
    p.fire('click', block('from openai import OpenAI'));
    p.fire('click', block('export GROQ_API_KEY=sk-secret'));
    p.fire('click', block('<script src="https://freellmapihub.com/widget.js"></script>'));
    p.fire('click', block('something else'));
    p.fire('click', el({ sels: ['.api-copy'], attrs: { 'data-api-url': 'https://freellmapihub.com/api/v1/providers.json' } }));
    assert.deepEqual(p.events().map((e) => e[1].snippet), ['curl', 'python', 'env_key', 'embed', 'other', 'api_url']);
    assert.ok(p.events().every(([n, prm]) => n === 'copy_snippet' && Object.keys(prm).join() === 'snippet'));
  });

  test('copy_snippet: a block of /embed/ names its kind from the fixed list; anything else falls back to the text', () => {
    const p = on({ path: '/embed/' });
    const block = (kind, text) => {
      const pre = el({ sels: ['pre'], attrs: kind ? { 'data-snippet': kind } : {} });
      pre.querySelector = () => ({ textContent: text });
      return el({ sels: ['.pre-copy'], parent: pre });
    };
    p.fire('click', block('citation', '@misc{freellmapihub2026,'));
    p.fire('click', block('citation', 'pacocartones. (2026). Free LLM API Hub'));
    p.fire('click', block('badge', '[![Groq on Free LLM API Hub](https://img.shields.io/endpoint?url=x)](y)'));
    p.fire('click', block('embed', '<div id="flh-widget" data-count="6"></div>'));
    p.fire('click', block(null, '<div id="flh-widget" data-count="6"></div>'));
    p.fire('click', block('someone@example.com', 'curl https://x'));
    assert.deepEqual(p.events().map((e) => e[1].snippet), ['citation', 'citation', 'badge', 'embed', 'embed', 'curl']);
    assert.ok(p.events().every(([n, prm]) => n === 'copy_snippet' && Object.keys(prm).join() === 'snippet'));
  });

  test('explorer_filter: category, modality and each chip, values from fixed lists', () => {
    const p = on();
    p.fire('click', el({ sels: ['#cat button[data-cat]'], attrs: { 'data-cat': 'trial' } }));
    p.fire('click', el({ sels: ['#cat button[data-cat]'], attrs: { 'data-cat': 'weird' } }));
    p.fire('change', el({ id: 'modality', value: 'image' }));
    p.fire('change', el({ id: 'modality', value: 'not a value!' }));
    for (const id of ['f-nocard', 'f-nophone', 'f-commercial', 'f-text', 'f-notrain', 'f-openai', 'f-verified']) p.fire('change', el({ id, checked: true }));
    p.fire('change', el({ id: 'f-nocard', checked: false }));
    p.fire('change', el({ id: 'something-else', checked: true }));
    assert.deepEqual(p.events(), [
      ['explorer_filter', { filter_name: 'category', filter_value: 'trial' }],
      ['explorer_filter', { filter_name: 'modality', filter_value: 'image' }],
      ...['no_card', 'no_phone', 'commercial', 'text_only', 'no_training', 'openai_compatible', 'verified'].map((n) => ['explorer_filter', { filter_name: n, filter_value: 'on' }]),
      ['explorer_filter', { filter_name: 'no_card', filter_value: 'off' }],
    ]);
  });

  test('explorer_sort: header click (after the explorer set aria-sort) and the sort menu', () => {
    const p = on();
    p.fire('click', el({ sels: ['thead th[data-key]'], attrs: { 'data-key': 'name', 'aria-sort': 'ascending' } }));
    p.fire('click', el({ sels: ['thead th[data-key]'], attrs: { 'data-key': 'verified', 'aria-sort': 'descending' } }));
    p.fire('click', el({ sels: ['thead th[data-key]'], attrs: { 'data-key': 'nope', 'aria-sort': 'descending' } }));
    p.fire('change', el({ id: 'sortSel', value: 'free_tier:1' }));
    p.fire('change', el({ id: 'sortSel', value: 'name:-1' }));
    assert.deepEqual(p.events(), [
      ['explorer_sort', { sort_key: 'name', sort_dir: 'asc' }],
      ['explorer_sort', { sort_key: 'verified', sort_dir: 'desc' }],
      ['explorer_sort', { sort_key: 'free_tier', sort_dir: 'asc' }],
      ['explorer_sort', { sort_key: 'name', sort_dir: 'desc' }],
    ]);
  });

  test('compare_view: once, for a static pair page or a shared ?compare= link', () => {
    assert.deepEqual(on({ path: '/compare/groq-vs-openrouter/' }).events(), [['compare_view', { pair: 'groq-vs-openrouter' }]]);
    assert.deepEqual(on({ path: '/compare/', search: '?compare=groq,openrouter,BAD!,cerebras' }).events(), [['compare_view', { pair: 'groq,openrouter,cerebras' }]]);
    assert.deepEqual(on({ path: '/compare/', search: '?compare=groq' }).events(), []);
    assert.deepEqual(on({ path: '/compare/' }).events(), []);
  });

  test('collection_view: the collection slug, not the hub page', () => {
    assert.deepEqual(on({ path: '/collections/no-credit-card' }).events(), [['collection_view', { collection: 'no-credit-card' }]]);
    assert.deepEqual(on({ path: '/collections/no-credit-card.html' }).events(), [['collection_view', { collection: 'no-credit-card' }]]);
    assert.deepEqual(on({ path: '/collections/' }).events(), []);
  });

  test('page events wait for consent and fire when analytics is granted on the page', () => {
    // no stored choice: nothing yet (the banner is up); the same page granting later is covered by apply() -> pageEvents()
    assert.deepEqual(page({ path: '/collections/multimodal' }).events(), []);
    assert.deepEqual(page({ consent: saved(false, true), path: '/collections/multimodal' }).events(), []);
  });

  test('api_download: our own data files only, as a path', () => {
    const p = on();
    for (const href of ['/providers.json', '../providers.csv', '/api/v1/providers.json', '/api/v1/litellm.yaml', '/llms-full.txt', '/badge-verified.json']) p.fire('click', link(href));
    for (const href of ['https://example.com/providers.json', '/p/groq', '/api/', '/styles.css']) p.fire('click', link(href));
    assert.deepEqual(p.events().map((e) => e[1].file), ['providers.json', 'providers.csv', 'api/v1/providers.json', 'api/v1/litellm.yaml', 'llms-full.txt', 'badge-verified.json']);
    assert.ok(p.events().every(([n]) => n === 'api_download'));
  });

  test('site_search: debounced 1.5 s, flushed on Enter or blur, deduplicated, normalised, truncated to 60, no personal data', () => {
    const p = on();
    p.q.value = '  Llama   3 ';
    p.fire('input', p.q);
    p.fire('input', p.q);
    assert.deepEqual(p.events(), [], 'nothing while typing');
    assert.equal(p.timers.filter((t) => t.fn).length, 1, 'one pending timer');
    assert.equal(p.timers[1].ms, 1500);
    p.runTimers();
    assert.deepEqual(p.events(), [['site_search', { search_term: 'llama 3' }]]);
    p.fire('focusout', p.q);
    p.fire('keydown', p.q, { key: 'Enter' });
    assert.equal(p.events().length, 1, 'the same query is sent once');
    p.q.value = 'x'.repeat(80);
    p.fire('keydown', p.q, { key: 'Enter' });
    assert.equal(p.events()[1][1].search_term, 'x'.repeat(60));
    for (const pii of ['me@example.com', 'call 612345678', '']) { p.q.value = pii; p.fire('focusout', p.q); }
    assert.equal(p.events().length, 2, 'emails, long numbers and empty queries are never sent');
    p.q.value = 'gemini';
    p.fire('keydown', p.q, { key: 'Tab' });
    assert.equal(p.events().length, 2, 'only Enter flushes');
  });

  test('no event carries more than the documented parameters', () => {
    const src = consentScript(ID);
    const names = [...src.matchAll(/track\('([a-z_]+)'/g)].map((m) => m[1]);
    assert.deepEqual([...new Set(names)].sort(), ['api_download', 'collection_view', 'compare_view', 'copy_snippet', 'explorer_filter', 'explorer_sort', 'outbound_provider_click', 'repo_click', 'site_search', 'wizard_complete']);
  });
});

describe('provider link attributes', () => {
  const p = { slug: 'acme', docs_url: 'https://docs.acme.ai/limits?a=1&b=2', keys_url: 'https://console.acme.ai/keys', models_url: 'https://docs.acme.ai/models', playground_url: 'https://play.acme.ai', free_limits: { source: 'https://docs.acme.ai/limits?a=1&b=2' }, data_policy: { source: 'https://acme.ai/privacy' } };

  test('targets in priority order; a URL shared by two fields keeps the first label', () => {
    assert.deepEqual(providerLinkTargets(p, { website: 'https://acme.ai' }).map((t) => [t.link, t.href]), [
      ['docs', p.docs_url], ['keys', p.keys_url], ['playground', p.playground_url], ['website', 'https://acme.ai'], ['models', p.models_url], ['data_policy', 'https://acme.ai/privacy'],
    ]);
  });

  test('tags matching links (escaped hrefs too), leaves others and already tagged links alone', () => {
    const html = '<a class="btn primary" href="https://docs.acme.ai/limits?a=1&amp;b=2" target="_blank">Docs</a>' +
      '<a href="https://acme.ai/privacy">p</a><a href="https://elsewhere.example">x</a><a href="https://docs.acme.ai/models" data-link="docs">m</a>';
    const out = tagProviderLinks(html, providerLinkTargets(p));
    assert.ok(out.includes('target="_blank" data-provider="acme" data-link="docs">Docs'));
    assert.ok(out.includes('<a href="https://acme.ai/privacy" data-provider="acme" data-link="data_policy">'));
    assert.ok(out.includes('<a href="https://elsewhere.example">x'));
    assert.ok(out.includes('<a href="https://docs.acme.ai/models" data-link="docs">m'));
  });

  test('rejects a bad slug or link type', () => {
    assert.throws(() => tagProviderLinks('', [{ href: 'https://x', provider: 'Bad Slug', link: 'docs' }]));
    assert.throws(() => tagProviderLinks('', [{ href: 'https://x', provider: 'ok', link: 'pricing' }]));
  });
});

// /find/ reports a finished wizard as a DOM event (site/find.js); consent.js sends it as wizard_complete, only with
// analytics consent, and only when every parameter is from its fixed list (lib/find.mjs completeEvent).
describe('wizard_complete', () => {
  const done = (detail) => ({ detail });
  test('sent with analytics consent, with exactly the validated parameters', () => {
    const p = page({ consent: saved(true, false), path: '/find/' });
    p.fire('fllm:wizard-complete', null, done({ use: 'chat', filters: 'card,commercial', results: 6 }));
    p.fire('fllm:wizard-complete', null, done({ use: 'any', filters: 'none', results: 0 }));
    assert.deepEqual(p.events(), [
      ['wizard_complete', { use: 'chat', filters: 'card,commercial', result_count: 6 }],
      ['wizard_complete', { use: 'any', filters: 'none', result_count: 0 }],
    ]);
  });
  for (const [label, consent] of [['no choice', null], ['everything rejected', saved(false, false)], ['advertising only', saved(false, true)]]) {
    test(`${label}: nothing is sent`, () => {
      const p = page({ consent, path: '/find/' });
      p.fire('fllm:wizard-complete', null, done({ use: 'chat', filters: 'none', results: 3 }));
      assert.deepEqual(p.events(), []);
    });
  }
  test('anything outside the fixed lists drops the event', () => {
    const p = page({ consent: saved(true, false), path: '/find/' });
    for (const d of [
      { use: 'me@example.com', filters: 'none', results: 1 },
      { use: 'chat', filters: 'card,evil', results: 1 },
      { use: 'chat', filters: 'card,card', results: 1 },
      { use: 'chat', filters: 'none', results: 1.5 },
      { use: 'chat', filters: 'none', results: 1000 },
      { use: 'chat', filters: 'none', results: '3' },
      null,
    ]) p.fire('fllm:wizard-complete', null, done(d));
    assert.deepEqual(p.events(), []);
  });
});
