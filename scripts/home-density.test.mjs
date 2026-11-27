// The home page's density budget (feat/home-density): one primary action in the hero, one control bar above the table, rows
// of at most 72px, a «Needs / unknown» cell in words (no "Not stated", no tick marks), a compact cookie banner on phones,
// and server and client rows that are the same string. Reads the committed template and the shared modules; the layout
// measurements also run in a real browser when Playwright is installed (it is not a dependency of this repository, so
// that part is skipped in CI and the static budget below still holds the line).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clientBundle, explorerRowHtml, needsCellHtml } from './lib/rows.mjs';
import { FLAG_PAIRS, freshnessStatus } from './lib/rules.mjs';
import { consentScript } from './lib/analytics.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const INDEX = read('site/index.html');
const CSS = read('site/styles.css');
const PROVIDERS = JSON.parse(read('data/providers.json')).providers;
const INTERACTIVE = /<(a|button|input|select|summary|textarea)\b[^>]*>/g;
const section = (re) => (INDEX.match(re) || [])[1] || '';

test('hero: one primary action and one secondary link, nothing else to click', () => {
  const hero = section(/<section class="hero">([\s\S]*?)<\/section>/);
  assert.ok(hero, 'the hero');
  const controls = hero.match(INTERACTIVE) || [];
  assert.equal(controls.length, 2, 'two visible controls in the hero: ' + controls.join(' '));
  assert.equal((hero.match(/class="btn primary/g) || []).length, 1, 'exactly one primary action');
  assert.match(hero, /<a class="btn primary hero-find" href="find\/">Find my free API<\/a>/);
  assert.match(hero, /<a class="hero-browse" href="#all-providers">Browse all <span aria-hidden="true">↓<\/span><\/a>/);
  assert.doesNotMatch(hero, /Get started|Popular|star-btn|Star on GitHub/, 'no Get started or Popular rows, no Star button');
  assert.match(hero, /<p class="stats-line" id="stats">/, 'the counters stay, as one line');
  const header = section(/<header class="site-header">([\s\S]*?)<\/header>/);
  assert.match(header, /href="https:\/\/github\.com\/pacocartones\/free-llm-api-hub"/, 'the GitHub link stays in the header');
});

test('explorer: an "All providers" heading, then ONE control bar of four controls; collections are plain text links', () => {
  const h2 = INDEX.indexOf('<h2 id="all-providers" class="explorer-h">All providers</h2>');
  assert.ok(h2 > 0 && h2 < INDEX.indexOf('<table id="table"'), 'a visible heading above the table');
  const inner = section(/<div class="wrap controls-inner">([\s\S]*?)\n {2}<\/div>\n {2}<div class="wrap active-filters"/);
  assert.ok(inner, 'the control bar');
  const top = inner.replace(/<div class="req-panel">[\s\S]*?<\/details>/, '</details>');
  const controls = (top.match(INTERACTIVE) || []).map((t) => t.match(/id="([^"]+)"|class="([^"]+)"/).slice(1).filter(Boolean)[0]);
  assert.deepEqual(controls, ['q', 'sel req-btn', 'modality', 'sortSel'], 'search, Requirements, modality, sort');
  // Every boolean filter and the type sit inside the Requirements dropdown.
  const panel = section(/<div class="req-panel">([\s\S]*?)<\/details>/);
  for (const id of ['f-nocard', 'f-nophone', 'f-commercial', 'f-notrain', 'f-openai', 'f-text', 'f-verified']) assert.match(panel, new RegExp(`<input type="checkbox" id="${id}">`), id);
  assert.match(panel, /<div class="seg" id="cat" role="group" aria-label="Filter by type">/);
  assert.match(inner, /<label class="sort-by" for="sortSel">Sort by/);
  assert.doesNotMatch(INDEX, /Column sort/);
  // Active filters: removable chips with ✕, built by explorer.js.
  assert.match(INDEX, /<div class="wrap active-filters" id="activeFilters" hidden>/);
  assert.match(read('site/explorer.js'), /class="af-chip" data-clear="[^`]*✕/);
  // Collections: plain links, no buttons or chips.
  const presets = section(/<p class="presets">([\s\S]*?)<\/p>/);
  assert.ok((presets.match(/<a href="collections\/[a-z-]+">/g) || []).length >= 3, 'collection links');
  assert.doesNotMatch(presets, /<button|class="chip/);
});

test('GA4 hooks: the controls keep the ids and values lib/consent.client.js reads', () => {
  const src = read('scripts/lib/consent.client.js');
  const chips = JSON.parse(src.match(/var CHIPS = (\{[^}]*\})/)[1].replace(/'/g, '"'));
  for (const id of Object.keys(chips)) assert.match(INDEX, new RegExp(`<input type="checkbox" id="${id}">`), `explorer_filter: ${id}`);
  for (const cat of ['all', 'ongoing', 'trial']) assert.match(INDEX, new RegExp(`<button type="button" data-cat="${cat}"`), `explorer_filter: category ${cat}`);
  assert.match(INDEX, /<select id="modality"/, 'explorer_filter: modality');
  assert.match(INDEX, /<input type="search" id="q"/, 'site_search');
  const sortKeys = JSON.parse(src.match(/var SORT_KEYS = (\[[^\]]*\])/)[1].replace(/'/g, '"'));
  const opts = [...section(/<select id="sortSel"[^>]*>([\s\S]*?)<\/select>/).matchAll(/<option value="([a-z_]+):-?1">/g)].map((m) => m[1]);
  for (const k of opts) assert.ok(sortKeys.includes(k), `explorer_sort: ${k}`);
  for (const k of [...INDEX.matchAll(/<th data-key="([a-z_]+)"/g)].map((m) => m[1])) assert.ok(sortKeys.includes(k), `explorer_sort header: ${k}`);
});

test('rows: server render and browser copy are the same string, for every provider and every flag state', () => {
  const win = { FLLM_RULES: { FLAG_PAIRS, freshnessStatus } };
  new Function('window', clientBundle())(win);
  const synthetic = [];
  for (const card of [true, false, null]) for (const commercial of [true, false, 'conditional', null]) for (const train of [true, false, null, undefined]) {
    synthetic.push({ slug: 'x', name: 'X', category: 'trial', free_tier: 'f', card_required: card, phone_required: card, commercial_ok: commercial, commercial_ok_condition: 'c <b>', notes: 'n "q"', ...(train === undefined ? {} : { data_policy: { trains_on_prompts: train } }) });
  }
  for (const p of [...PROVIDERS, ...synthetic]) {
    for (const now of ['2026-11-25', Date.parse('2027-03-01T00:00:00Z')]) {
      assert.equal(win.FLLM_ROWS.rowHtml(p, { now }), explorerRowHtml(p, { now }), `${p.slug}: the whole row`);
    }
  }
  // The committed template carries rows made by the same function (the build injects them between the AUTOGEN markers).
  const tbody = section(/<!-- AUTOGEN:rows:start -->\n([\s\S]*?)\n<!-- AUTOGEN:rows:end -->/);
  for (const tr of tbody.split('\n')) {
    const slug = tr.match(/href="p\/([a-z0-9-]+)"/)[1];
    const p = PROVIDERS.find((x) => x.slug === slug);
    assert.ok(p && tr.includes(needsCellHtml(p)), `${slug}: the server row carries the shared «Needs / unknown» cell`);
  }
});

test('rows: no "Not stated" and no tick marks; the type sits next to the name; four cells', () => {
  for (const p of PROVIDERS) {
    const row = explorerRowHtml(p, { now: '2026-11-25' });
    const visible = row.replace(/<span class="sr-only">[^<]*<\/span>/g, '').replace(/<[^>]+>/g, ' ');
    assert.doesNotMatch(visible, /Not stated|✓/, p.slug);
    assert.match(row, /<div class="name-line"><a class="name-link"[^>]*>[^<]*<\/a> <span class="badge b-(ongoing|trial)"[^>]*>(Ongoing|Trial)<\/span>/, `${p.slug}: type next to the name`);
    assert.equal((row.match(/<td\b/g) || []).length, 4, `${p.slug}: four cells`);
  }
  assert.doesNotMatch(read('scripts/lib/rows.mjs'), /'Not stated'/);
  assert.doesNotMatch(section(/<tbody id="tbody" role="rowgroup">([\s\S]*?)<\/tbody>/), /Not stated|data-flag=|fmini/);
});

test('rows: the static height budget is at most 72px on a desktop', () => {
  // 9px + 9px of padding, two lines of at most 1.45 × 15.2px of text (0.95rem cells), and a 1px border: 63px. Every cell is
  // held to two lines: the name line does not wrap, the "best for" line and the other cells are clamped.
  const pad = CSS.match(/#table tbody td \{ padding-top: (\d+)px; padding-bottom: (\d+)px; \}/);
  assert.ok(pad, 'the row padding');
  assert.ok(Number(pad[1]) + Number(pad[2]) + 2 * 1.45 * 16 + 1 <= 72, 'padding + two lines + border fit in 72px');
  assert.match(CSS, /\.name-line \.name-link \{ min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; \}/, 'a long name does not wrap');
  assert.match(CSS, /\.name \.best \{ overflow: hidden; text-overflow: ellipsis; white-space: nowrap; \}/, 'the best-for line does not wrap');
  assert.ok((needsCellHtml({}).match(/class="clamp2"/g) || []).length === 1, 'the Needs cell is clamped to two lines');
});

test('cookie banner: a compact phone layout with the same texts and answers', () => {
  const src = consentScript('G-TEST000000');
  assert.match(src, /@media \(max-width:600px\)\{\.consent-banner\{[^}]*padding:8px 10px/, 'a phone layout');
  assert.match(src, /\.consent-text\{max-height:4\.05em;overflow:auto/, 'the explanation keeps three lines and scrolls');
  assert.match(src, /<div class="consent-text" tabindex="0">/, 'the scrolling text is reachable from the keyboard');
  assert.match(src, /\.consent-actions\{gap:6px;flex-wrap:nowrap\}/, 'the three answers share one row');
  assert.match(src, /May we use Google cookies for analytics and, separately, for advertising and personalised measurement/, 'the same text');
});

test('mobile menu: opaque, with "Find my free API" first', () => {
  assert.match(INDEX, /<nav class="nav" id="primary-nav" aria-label="Primary">\s*<a class="nav-find" href="find\/">Find my free API<\/a>/);
  const mobile = CSS.slice(CSS.indexOf('@media (max-width: 900px) {'));
  assert.match(mobile, /\.nav \{[^}]*background: var\(--bg\);/, 'a solid background token, not a translucent one');
  assert.match(mobile, /\.nav a\.nav-find \{ display: flex;/);
  assert.match(CSS, /^\.nav a\.nav-find \{ display: none; \}/m, 'desktop keeps it in the Providers group');
});

// ---------- measured in a real browser, when one is available ----------
let chromium = null;
try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch { /* not installed: skipped */ }
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' };

test('measured: hero controls, row heights and the phone banner', { skip: !chromium && 'Playwright is not installed' }, async () => {
  const site = join(ROOT, 'site');
  const server = createServer((req, res) => {
    let p = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
    if (p.endsWith('/')) p += 'index.html';
    // The banner script exists only in a build with a measurement ID: serve it from memory, under the page's own origin (CSP 'self').
    if (p === '/__consent-test.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(consentScript('G-TEST000000')); return; }
    const f = join(site, p);
    if (!f.startsWith(site) || !existsSync(f)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream' });
    res.end(readFileSync(f));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/`;
  let browser;
  try {
    browser = await chromium.launch();
    const desk = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await desk.goto(url);
    await desk.waitForTimeout(300);
    const m = await desk.evaluate(() => {
      const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top < innerHeight && r.bottom > 0; };
      const hero = [...document.querySelectorAll('.hero a[href], .hero button, .hero input, .hero select')].filter(vis).length;
      const rows = [...document.querySelectorAll('#tbody tr')].map((tr) => [tr.getBoundingClientRect().height, tr.querySelector('td.name a') && tr.querySelector('td.name a').textContent]);
      return { hero, rows };
    });
    assert.equal(m.hero, 2, 'two visible controls in the hero');
    for (const [h, name] of m.rows) assert.ok(h <= 72, `${name}: row is ${h}px tall (budget 72px)`);
    for (const width of [1000, 800]) {
      await desk.setViewportSize({ width, height: 900 });
      const tall = await desk.evaluate(() => [...document.querySelectorAll('#tbody tr')].filter((tr) => tr.getBoundingClientRect().height > 72).length);
      assert.equal(tall, 0, `no row above 72px at ${width}px`);
    }
    // The banner as it is built with a measurement ID, on the home page at 390px.
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await phone.route(/googletagmanager/, (r) => r.abort());
    await phone.goto(url);
    await phone.addScriptTag({ url: url + '__consent-test.js' });
    const h = await phone.evaluate(() => { const b = document.getElementById('consent-banner'); return b && !b.hidden ? b.getBoundingClientRect().height : -1; });
    assert.ok(h > 0 && h <= 120, `the banner is ${h}px tall at 390px (budget 120px)`);
  } finally {
    if (browser) await browser.close();
    server.close();
  }
});
