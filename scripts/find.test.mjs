// "Find my free API" (/find/): lib/find.mjs (questions, filters, hash, explorer link, payload, result markup), the
// generated page and its links, and the agreement with the explorer. The filters are run three ways — the module, the
// serialised browser bundle (site/shared-find.js) and the real site/explorer.js driven through the link the wizard
// gives — and must name the same providers in the same order for every combination of answers.
import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { privateTree } from './lib/private-tree.mjs';
import * as find from './lib/find.mjs';
import { findJsonLd, findMainHtml, FIND_PATH } from './lib/find-page.mjs';
import { clientBundle as sortBundle } from './lib/sort.mjs';
import { recScore, intentRank, recommendedCmp, FREE_TYPE_RANK, freeTypeRank, FLAG_PAIRS, SLA_DAYS, DUE_SOON_DAYS, freshnessStatus } from './lib/rules.mjs';
import { pythonChatQuickstart, pythonEmbeddingsQuickstart } from './lib/quickstart.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = JSON.parse(readFileSync(join(REPO, 'data/providers.json'), 'utf8')).providers;
const EXPLORER_JS = readFileSync(join(REPO, 'site/explorer.js'), 'utf8');

const RULES = { recScore, intentRank, recommendedCmp, FREE_TYPE_RANK, freeTypeRank, FLAG_PAIRS, SLA_DAYS, DUE_SOON_DAYS, freshnessStatus };
// The browser bundle, run as the page runs it (after shared-rules.js).
function browserFind() {
  const win = { FLLM_RULES: RULES };
  new Function('window', find.clientBundle())(win);
  return win.FLLM_FIND;
}

// Every combination of answers: each use (or none) × each constraint answered yes, no or not at all.
function* allAnswers() {
  const uses = [undefined, ...find.USES.map((u) => u.value)];
  const n = find.CONSTRAINTS.length;
  for (const use of uses) {
    for (let mask = 0; mask < 3 ** n; mask++) {
      const a = use ? { use } : {};
      let m = mask;
      for (const c of find.CONSTRAINTS) { const v = m % 3; m = Math.floor(m / 3); if (v) a[c.key] = v === 1 ? 'yes' : 'no'; }
      yield a;
    }
  }
}

const base = { slug: 'x', name: 'X', category: 'ongoing', free_type: 'perpetual', free_tier: 'free', is_text_llm: true, modalities: ['text'], verified: true, last_verified: '2026-11-01' };
const one = (over, answers) => find.shortlist([{ ...base, ...over }], answers);
const where = (over, answers) => { const r = one(over, answers); return r.matches.length ? 'match' : r.possible.length ? 'possible' : 'out'; };

describe('filters: one per question, null is never yes', () => {
  test('card: "No card" keeps a confirmed no-card provider, sets aside an unconfirmed one, drops a card-required one', () => {
    assert.equal(where({ card_required: false }, { card: 'no' }), 'match');
    assert.equal(where({ card_required: null }, { card: 'no' }), 'possible');
    assert.equal(where({}, { card: 'no' }), 'possible', 'a missing field is not stated either');
    assert.equal(where({ card_required: true }, { card: 'no' }), 'out');
    assert.equal(where({ card_required: true }, { card: 'yes' }), 'match', 'a visitor who can add a card is not filtered');
    assert.equal(where({ card_required: null }, { card: 'yes' }), 'match');
  });
  test('phone: "No phone" works the same way', () => {
    assert.equal(where({ phone_required: false }, { phone: 'no' }), 'match');
    assert.equal(where({ phone_required: null }, { phone: 'no' }), 'possible');
    assert.equal(where({ phone_required: true }, { phone: 'no' }), 'out');
    assert.equal(where({ phone_required: true }, { phone: 'yes' }), 'match');
  });
  test('commercial: only a confirmed true is a yes; "conditional" and null are not stated; false is out', () => {
    assert.equal(where({ commercial_ok: true }, { commercial: 'yes' }), 'match');
    assert.equal(where({ commercial_ok: 'conditional', commercial_ok_condition: 'under 1M requests' }, { commercial: 'yes' }), 'possible');
    assert.equal(where({ commercial_ok: null }, { commercial: 'yes' }), 'possible');
    assert.equal(where({ commercial_ok: false }, { commercial: 'yes' }), 'out');
    assert.equal(where({ commercial_ok: false }, { commercial: 'no' }), 'match');
  });
  test('training: only a stated trains_on_prompts: false passes; no policy is "not stated"', () => {
    assert.equal(where({ data_policy: { trains_on_prompts: false } }, { train: 'yes' }), 'match');
    assert.equal(where({ data_policy: null }, { train: 'yes' }), 'possible');
    assert.equal(where({ data_policy: { trains_on_prompts: null } }, { train: 'yes' }), 'possible');
    assert.equal(where({ data_policy: { trains_on_prompts: true } }, { train: 'yes' }), 'out');
    assert.equal(where({ data_policy: { trains_on_prompts: true } }, { train: 'no' }), 'match');
  });
  test('openai: only a confirmed true passes', () => {
    assert.equal(where({ openai_compatible: true }, { openai: 'yes' }), 'match');
    assert.equal(where({ openai_compatible: null }, { openai: 'yes' }), 'possible');
    assert.equal(where({ openai_compatible: false }, { openai: 'yes' }), 'out');
  });
  test('use: chat and code are text LLMs (is_text_llm), the others are modalities', () => {
    assert.equal(where({ is_text_llm: true }, { use: 'chat' }), 'match');
    assert.equal(where({ is_text_llm: false }, { use: 'code' }), 'out');
    assert.equal(where({ is_text_llm: false, modalities: ['embeddings'] }, { use: 'embeddings' }), 'match');
    assert.equal(where({ modalities: ['audio'] }, { use: 'speech' }), 'match');
    assert.equal(where({ modalities: ['image'] }, { use: 'image' }), 'match');
    assert.equal(where({ modalities: ['ocr'] }, { use: 'ocr' }), 'match');
    assert.equal(where({ modalities: ['text'] }, { use: 'ocr' }), 'out', 'not stated never rescues a provider that lacks the use');
  });
  test('a contradicted answer drops a provider even when another answer is not stated', () => {
    assert.equal(where({ card_required: true, phone_required: null }, { card: 'no', phone: 'no' }), 'out');
  });
  test('the order is the explorer\'s Recommended order (recommendedCmp), for matches and possible alike', () => {
    for (const a of [{}, { use: 'chat', card: 'no' }, { use: 'embeddings', commercial: 'yes' }]) {
      const r = find.shortlist(DATA, a);
      assert.deepEqual(r.matches.map((p) => p.slug), [...r.matches].sort(recommendedCmp).map((p) => p.slug));
      assert.deepEqual(r.possible.map((p) => p.slug), [...r.possible].sort(recommendedCmp).map((p) => p.slug));
    }
  });
});

// The real explorer, with a fake DOM, loaded at the URL the wizard links to. Its rows are rendered by a stub that writes
// the slug, so the order it shows can be read back.
function explorerAt(search) {
  const element = (id, extra = {}) => ({
    id, checked: false, value: '', textContent: '', innerHTML: '', hidden: false, style: { display: '' }, options: [], rows: [],
    addEventListener() {}, focus() {},
    closest() { return { classList: { toggle() {}, add() {}, remove() {} } }; },
    classList: { toggle() {}, add() {}, remove() {} },
    ...extra,
  });
  const mods = ['all', 'text', 'image', 'audio', 'embeddings', 'rerank', 'ocr', 'vision'];
  const elements = new Map([
    ['providers-data', element('providers-data', { textContent: JSON.stringify({ providers: DATA }) })],
    ['q', element('q')], ['modality', element('modality', { options: mods.map((value) => ({ value })) })],
    ['sortSel', element('sortSel')], ['tbody', element('tbody')], ['empty', element('empty')], ['count', element('count')],
    ['stats', element('stats')], ['clearFilters', element('clearFilters')],
    ...['f-nocard', 'f-nophone', 'f-commercial', 'f-text', 'f-notrain', 'f-openai', 'f-verified'].map((id) => [id, element(id)]),
  ]);
  const document = { getElementById: (id) => elements.get(id), querySelectorAll: () => [], querySelector: () => null, documentElement: { style: { setProperty() {} } } };
  const window = { FLLM_RULES: { ...RULES }, FLLM_ROWS: { rowHtml: (p) => `<tr data-slug="${p.slug}"></tr>`, rowKeyTarget: () => null } };
  new Function('window', sortBundle())(window);
  new Function('window', 'document', 'history', 'location', 'ResizeObserver', 'fetch', 'navigator', EXPLORER_JS)(
    window, document, { replaceState() {} }, { search, pathname: '/' }, undefined, undefined, {});
  return [...elements.get('tbody').innerHTML.matchAll(/data-slug="([^"]+)"/g)].map((m) => m[1]);
}

describe('agreement with the explorer', () => {
  test('for every combination of answers, the explorer link shows exactly the matches, in the same order', () => {
    let checked = 0;
    for (const a of allAnswers()) {
      const href = find.explorerHref(a, '../');
      const search = href.slice('../'.length).replace(/#explorer$/, '');
      assert.deepEqual(explorerAt(search), find.shortlist(DATA, a).matches.map((p) => p.slug), `answers ${JSON.stringify(a)} → ${href}`);
      checked++;
    }
    assert.equal(checked, 7 * 3 ** find.CONSTRAINTS.length);
  });
  test('the explorer link uses only parameters explorer.js reads', () => {
    const read = new Set(['mod', ...[...EXPLORER_JS.matchAll(/\['([a-z]+)', 'f-[a-z]+'\]/g)].map((m) => m[1])]);
    for (const a of allAnswers()) {
      const qs = find.explorerHref(a, '').replace(/#explorer$/, '').replace(/^\?/, '');
      for (const pair of qs ? qs.split('&') : []) assert.ok(read.has(pair.split('=')[0]), `${pair} is read by explorer.js`);
    }
    assert.equal(find.explorerHref({}, '../'), '../#explorer');
    assert.equal(find.explorerHref({ use: 'speech', card: 'no', train: 'yes' }, '../'), '../?mod=audio&nocard=1&notrain=1#explorer');
  });
  test('the browser bundle gives the same shortlist, explorer link and markup as the module, for every combination', () => {
    const B = browserFind();
    const payload = DATA.map(find.findProvider);
    for (const a of allAnswers()) {
      const m = find.shortlist(payload, a), b = B.shortlist(payload, a);
      assert.deepEqual(b.matches.map((p) => p.slug), m.matches.map((p) => p.slug));
      assert.deepEqual(b.possible.map((p) => p.slug), m.possible.map((p) => p.slug));
      assert.equal(B.explorerHref(a, '../'), find.explorerHref(a, '../'));
      assert.equal(B.toHash(a), find.toHash(a));
      for (const p of [...m.matches.slice(0, 2), ...m.possible.slice(0, 1)]) assert.equal(B.resultHtml(p, a, { rank: 1 }), find.resultHtml(p, a, { rank: 1 }));
    }
    // and the payload filters exactly like the full records
    for (const a of [{ use: 'chat', card: 'no', train: 'yes' }, { use: 'ocr', commercial: 'yes' }]) {
      assert.deepEqual(find.shortlist(payload, a).matches.map((p) => p.slug), find.shortlist(DATA, a).matches.map((p) => p.slug));
    }
  });
});

describe('the URL hash', () => {
  test('round trip: every combination of answers survives toHash → parseHash, in one canonical order', () => {
    for (const a of allAnswers()) {
      const h = find.toHash(a);
      assert.deepEqual(find.parseHash('#' + h), a);
      assert.equal(find.toHash(find.parseHash(h)), h);
      const keys = h ? h.split('&').map((kv) => kv.split('=')[0]) : [];
      assert.deepEqual(keys, find.HASH_KEYS.filter((k) => keys.includes(k)), 'keys in HASH_KEYS order');
    }
    assert.equal(find.toHash({ card: 'no', use: 'chat' }), 'use=chat&card=no');
  });
  test('unknown keys and values, repeats and broken escapes are dropped, never guessed', () => {
    assert.deepEqual(find.parseHash('#use=chat&card=maybe&evil=<script>&phone=no&phone=yes&%E0%A4%A=1'), { use: 'chat', phone: 'no' });
    assert.deepEqual(find.parseHash('#use=everything'), {});
    assert.deepEqual(find.parseHash(''), {});
    assert.deepEqual(find.parseHash(null), {});
    assert.equal(find.toHash({ use: 'nope', card: 'no' }), 'card=no');
  });
});

describe('payload and result markup', () => {
  test('every field of a result card is escaped; a non-kebab slug gets no link', () => {
    const evil = '<img src=x onerror=alert(1)>"\'';
    const p = find.findProvider({ ...base, slug: 'Bad Slug', name: evil, free_tier: evil, best_for: evil, expires: evil, card_required: null, commercial_ok: 'conditional', commercial_ok_condition: evil, openai_base_url: 'https://api.example.com/v1', models_free: [evil] });
    const html = find.resultHtml(p, { use: 'chat', card: 'no', commercial: 'yes' });
    assert.ok(!html.includes('<img'), 'no markup from data');
    assert.ok(!/href="[^"]*Bad Slug/.test(html), 'no link from a bad slug');
  });
  test('"Get a free key" appears only with an https keys_url; without it the card degrades to the docs', () => {
    const withKey = find.resultHtml(find.findProvider({ ...base, docs_url: 'https://docs.example.com', keys_url: 'https://console.example.com/keys' }), {});
    assert.match(withKey, /<a class="btn primary" href="https:\/\/console\.example\.com\/keys"[^>]*>Get a free key/);
    // tagged like the provider page's key button, so a click is an outbound_provider_click with link "keys"
    assert.match(withKey, /href="https:\/\/console\.example\.com\/keys"[^>]*data-provider="x" data-link="keys"/);
    const without = find.resultHtml(find.findProvider({ ...base, docs_url: 'https://docs.example.com' }), {});
    assert.doesNotMatch(without, /Get a free key/);
    assert.match(without, /href="https:\/\/docs\.example\.com"[^>]*data-provider="x" data-link="docs"/);
    for (const bad of ['javascript:alert(1)', 'http://console.example.com', '']) {
      assert.doesNotMatch(find.resultHtml(find.findProvider({ ...base, keys_url: bad }), {}), /Get a free key/, `keys_url ${JSON.stringify(bad)}`);
    }
  });
  test('an asked requirement that is not stated says so in words, with the warning icon and its own class', () => {
    const html = find.resultHtml({ ...base, card_required: null, data_policy: null }, { card: 'no', train: 'yes' });
    assert.match(html, /class="flag-badge find-flag is-unknown"><svg class="i" aria-hidden="true"><use href="#ic-warn"\/><\/svg>card: not stated/);
    assert.match(html, /is-unknown"><svg[^]*?training: not stated/);
    const yes = find.resultHtml({ ...base, card_required: false }, { card: 'no' });
    assert.match(yes, /find-flag is-yes"><svg class="i" aria-hidden="true"><use href="#ic-nocard"\/><\/svg>no card/);
  });
  test('the quickstart matches the per-provider page snippets and is offered only for an OpenAI-compatible base URL', () => {
    const p = { ...base, openai_base_url: 'https://api.example.com/v1', model: 'm-1' };
    assert.deepEqual(find.quickstartFor(p, 'chat'), { lang: 'python', code: pythonChatQuickstart(p.openai_base_url, 'm-1') });
    assert.deepEqual(find.quickstartFor(p, 'embeddings'), { lang: 'python', code: pythonEmbeddingsQuickstart(p.openai_base_url, 'm-1') });
    assert.equal(find.quickstartFor(p, 'image'), null);
    assert.equal(find.quickstartFor({ ...base }, 'chat'), null);
    assert.match(find.resultHtml({ ...base }, { use: 'chat' }), /No OpenAI-compatible endpoint is recorded/);
  });
  test('wizard_complete parameters come from fixed lists and a bounded count', () => {
    assert.deepEqual(find.completeEvent({ use: 'chat', card: 'no', commercial: 'yes', phone: 'yes' }, 4), { use: 'chat', filters: 'card,commercial', results: 4 });
    assert.deepEqual(find.completeEvent({}, 5000), { use: 'any', filters: 'none', results: 999 });
  });
});

describe('the page in the build', () => {
  const ROOT = privateTree(REPO);
  const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
  let html;
  before(() => {
    execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: ROOT, stdio: 'pipe' });
    html = read('site/find/index.html');
  });

  test('the inlined payload is providers.json, field for field (only the wizard\'s fields, no env_key)', () => {
    const m = html.match(/<script type="application\/json" id="find-data">([^<]*)<\/script>/);
    assert.ok(m, 'the page inlines its data');
    const payload = JSON.parse(m[1]);
    const site = JSON.parse(read('site/providers.json'));
    assert.deepEqual(payload.providers.map((p) => p.slug), site.providers.map((p) => p.slug), 'every provider, in dataset order');
    payload.providers.forEach((p, i) => {
      const src = site.providers[i];
      assert.ok(!('env_key' in p));
      for (const k of Object.keys(p)) {
        if (k === 'model') { assert.equal(p.model, find.firstModel(src)); continue; }
        if (k === 'free_limits') { for (const [lk, v] of Object.entries(p.free_limits)) assert.equal(v, src.free_limits[lk], `${p.slug}.free_limits.${lk}`); continue; }
        if (k === 'data_policy') { assert.equal(p.data_policy.trains_on_prompts, src.data_policy.trains_on_prompts); continue; }
        assert.ok(find.FIND_FIELDS.includes(k), `${k} is a wizard field`);
        assert.deepEqual(p[k], src[k], `${p.slug}.${k}`);
      }
      for (const k of ['card_required', 'phone_required', 'commercial_ok', 'openai_compatible', 'is_text_llm', 'modalities', 'name', 'category']) {
        if (src[k] !== undefined) assert.deepEqual(p[k], src[k], `${p.slug}.${k} is carried`);
      }
    });
    assert.ok(!/<\/script/i.test(m[1]));
  });

  test('scripts, structured data, sitemap and the three entry points', () => {
    assert.match(html, /<script src="\.\.\/shared-rules\.js(\?v=\w+)?" defer><\/script>\n<script src="\.\.\/shared-find\.js(\?v=\w+)?" defer><\/script>\n<script src="\.\.\/find\.js(\?v=\w+)?" defer><\/script>/);
    assert.equal(read('site/shared-find.js'), find.clientBundle());
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([^<]*)<\/script>/)[1]);
    const app = ld['@graph'].find((n) => n['@type'] === 'WebApplication');
    assert.ok(app && app.url === 'https://freellmapihub.com/find/');
    assert.doesNotMatch(JSON.stringify(ld), /Offer|AggregateRating|Review|Product/);
    assert.match(html, /<link rel="canonical" href="https:\/\/freellmapihub\.com\/find\/">/);
    assert.match(read('site/sitemap.xml'), /<loc>https:\/\/freellmapihub\.com\/find\/<\/loc>/);
    assert.match(read('site/index.html'), /<div class="hero-cta">\s*<a class="btn primary hero-find" href="find\/">Find my free API<\/a>/, 'home hero: the one primary action');
    for (const rel of ['site/index.html', 'site/find/index.html', 'site/compare/index.html']) {
      assert.match(read(rel), /<div class="nav-sub"><a href="[^"]*#explorer">All providers<\/a><a href="(\.\.\/)?find\/">Find my free API<\/a>/, `${rel}: Providers menu`);
    }
    assert.match(read('site/guides-and-collections/index.html'), /<a href="\.\.\/find\/">Find my free API<\/a>/, 'guides hub');
  });

  test('accessible structure: labelled questions, one live count, a focusable results heading, a no-JS fallback', () => {
    const qs = html.match(/<fieldset class="find-q"[^]*?<\/fieldset>/g);
    assert.equal(qs.length, 1 + find.CONSTRAINTS.length);
    for (const q of qs) {
      assert.match(q, /<legend>/);
      assert.ok([...q.matchAll(/<input type="radio"/g)].length === [...q.matchAll(/<label class="find-opt"><input/g)].length, 'every radio sits in its label');
    }
    assert.equal([...html.matchAll(/aria-live="polite"/g)].length, 1);
    // The count and the questions are in the page from the first paint (no layout shift when find.js runs).
    const payload = JSON.parse(html.match(/<script type="application\/json" id="find-data">([^]*?)<\/script>/)[1]);
    const start = find.shortlist(payload.providers, {});
    const count = find.countText(start.matches.length, start.possible.length, false);
    assert.match(count, /^So far: \d+ providers? match\./);
    assert.ok(html.includes(`<p id="find-count" class="find-count" role="status" aria-live="polite" aria-atomic="true">${count}</p>`), 'the count is filled at first paint');
    assert.match(html, /<form id="find-form" class="find-form" novalidate aria-describedby="find-count">/, 'the form is not hidden in the markup');
    assert.match(read('site/styles.css'), /@media \(scripting: none\) \{ \.find-form \{ display: none; \} \.find-count \{ visibility: hidden; height: 1\.3em; overflow: hidden; \} \}/, 'without scripts the form is hidden by CSS');
    assert.match(html, /<h2 id="find-results-h" tabindex="-1">/);
    const nos = html.match(/<noscript>([^]*?)<\/noscript>/)[1];
    assert.match(nos, /href="\.\.\/\?text=1&amp;nocard=1#explorer"|href="\.\.\/\?nocard=1&amp;text=1#explorer"/);
  });

  test('every local link and asset on the page resolves to a built file', () => {
    const urls = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'))
      .filter((u) => !/^(https?:|mailto:|#)/.test(u));
    assert.ok(urls.length > 10);
    for (const u of urls) {
      const path = new URL(u, 'https://x.test/find/').pathname;
      const file = join(ROOT, 'site', decodeURIComponent(path));
      const ok = path.endsWith('/') ? existsSync(join(file, 'index.html')) : existsSync(file) || existsSync(file + '.html');
      assert.ok(ok, `${u} → ${path}`);
    }
  });

  test('countText: the live count wording, before and after the last answer', () => {
    assert.equal(find.countText(1, 0, false), 'So far: 1 provider matches.');
    assert.equal(find.countText(5, 2, false), 'So far: 5 providers match. 2 more might fit (not stated).');
    assert.equal(find.countText(0, 1, true), '0 providers match your answers. 1 more might fit (not stated).');
  });

  test('the page body is pure: same inputs, same markup', () => {
    const pageHero = ({ h1 }) => `<section class="page-hero"><h1>${h1}</h1></section>`;
    assert.equal(findMainHtml({ pageHero, total: 3, verified: 2 }), findMainHtml({ pageHero, total: 3, verified: 2 }));
    assert.equal(JSON.parse(findJsonLd({ site: 'https://s.test', asof: '2026-01-01' }))['@graph'][0].url, `https://s.test${FIND_PATH}`);
  });
});
