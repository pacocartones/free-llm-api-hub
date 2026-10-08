// Regression tests for the explorer's XSS story after the shared-rows refactor.
// provider data (providers.json) is editable via community PRs, so every field
// must be escaped before it reaches innerHTML. Rows no longer render from a
// client-side DOM skeleton: the client repaints with window.FLLM_ROWS.rowHtml —
// the SAME function build.mjs uses to SSR the table — so the escaping lives in
// exactly one place (scripts/lib/rows.mjs). These tests exercise the real
// serialised client copy (site/shared-rows.js) against hostile input.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clientBundle } from './lib/rows.mjs';
import { clientBundle as sortClientBundle } from './lib/sort.mjs';
import { freeTypeRank } from './lib/rules.mjs';
import { readFileSync } from 'node:fs';
import { clientBundle as compareClientBundle } from './lib/compare.mjs';

// The exact client bundle the browser runs — serialised by lib/rows.mjs itself
// (the same string build.mjs writes to site/shared-rows.js), so no generated
// file has to exist on disk for the suite to pass in a clean checkout.
const SHARED_ROWS = clientBundle();

const base = {
  slug: 'groq', name: 'Groq', category: 'ongoing', free_tier: 'free tier', notes: 'n',
  rate_limits: '10 rpm', verified: true, last_verified: '2026-08-01', card_required: false,
};

// Runs the serialised client copy and returns rowHtml bound to a fake
// window.FLLM_RULES (the module imports FLAG_PAIRS/freshnessStatus from there).
function clientRowHtml(extraRules = {}) {
  const rules = {
    FLAG_PAIRS: [
      ['card_required', false, 'ic-nocard', 'no card'], ['card_required', true, 'ic-card', 'card'],
      ['phone_required', false, 'ic-nophone', 'no phone'], ['phone_required', true, 'ic-phone', 'phone'],
      ['commercial_ok', true, 'ic-building', 'commercial'], ['commercial_ok', false, 'ic-flask', 'eval only'],
      ['openai_compatible', true, 'ic-code', 'OpenAI-compat'],
    ],
    freshnessStatus: (age) => {
      if (age === null || age === undefined) return 'due';
      if (age > 90) return 'stale';
      if (age > 60) return 'due';
      return 'fresh';
    },
    ...extraRules,
  };
  const win = { FLLM_RULES: rules };
  const run = new Function('window', SHARED_ROWS);
  run(win);
  return win.FLLM_ROWS.rowHtml;
}

test('the client bundle exposes rowHtml', () => {
  const rowHtml = clientRowHtml();
  assert.equal(typeof rowHtml, 'function');
  const out = rowHtml(base, { now: '2026-08-13' });
  assert.match(out, /<tr>/);
  assert.match(out, /href="p\/groq"/);
  assert.ok(!out.includes('.html'), 'client link must match the clean-URL standard (#132)');
});

test('an HTML payload in any provider field never becomes markup', () => {
  const payload = '<img src=x onerror=alert(1)>';
  const rowHtml = clientRowHtml();
  const out = rowHtml({
    ...base,
    name: `Evil ${payload}`, free_tier: `free ${payload}`, notes: `notes ${payload}`,
    best_for: `best ${payload}`, last_verified: `2026-08-01 ${payload}`,
  }, { now: '2026-08-13' });
  // The payload must survive as escaped TEXT. The escaped output legitimately
  // contains the substrings 'onerror=' and 'alert(' as text inside entities —
  // the attack only lands if a real tag opens, so assert on that.
  assert.ok(!/<(img|script)[\s>]/i.test(out), `payload became a real tag:\n${out}`);
  assert.ok(out.includes('&lt;img'), 'payload must be escaped, not stripped');
  // the anchor survives with escaped text, not the payload as markup
  assert.match(out, /href="p\/groq"/);
  assert.ok(out.includes('Evil &lt;img'), 'escaped payload survives in the name cell');
  assert.ok(out.includes('best &lt;img'), 'escaped payload survives in best_for');
  assert.ok(out.includes('notes &lt;img'), 'escaped payload survives in notes');
  assert.ok(out.includes('free &lt;img'), 'escaped payload survives in free_tier');
});

test('a slug that is not kebab-case renders the name without a link', () => {
  const rowHtml = clientRowHtml();
  const out = rowHtml({ ...base, slug: 'x" onmouseover="alert(1)' }, { now: '2026-08-13' });
  assert.ok(!out.includes('href="p/'), 'invalid slug must drop the anchor');
  // the hostile slug text is escaped into the name cell, never an attribute
  assert.ok(out.includes('Groq'), 'name still renders');
  assert.ok(!out.includes('onmouseover='), 'no event handler may survive');
});

test('freshness status drives the badge class and title', () => {
  const d = (daysAgo) => {
    const t = new Date('2026-08-13T00:00:00Z'); t.setUTCDate(t.getUTCDate() - daysAgo);
    return t.toISOString().slice(0, 10);
  };
  const rowHtml = clientRowHtml();
  assert.match(rowHtml({ ...base, last_verified: d(10) }, { now: '2026-08-13' }), /badge b-ok/);
  assert.match(rowHtml({ ...base, last_verified: d(75) }, { now: '2026-08-13' }), /badge b-warn/);
  assert.match(rowHtml({ ...base, last_verified: d(95) }, { now: '2026-08-13' }), /badge b-stale/);
  assert.match(rowHtml({ ...base, last_verified: d(75) }, { now: '2026-08-13' }), /title="Verified 75d ago/);
});

test('unverified entries render the warning badge and no date', () => {
  const rowHtml = clientRowHtml();
  const out = rowHtml({ ...base, verified: false, last_verified: undefined }, { now: '2026-08-13' });
  assert.match(out, /badge b-warn/);
  assert.match(out, /unverified/);
  assert.ok(!out.includes('ver-date'), 'no date cell for unverified rows');
});

test('the hero shield derives its bucket from FLLM_RULES, not a local copy', () => {
  const src = readFileSync(new URL('../site/explorer.js', import.meta.url), 'utf8');
  // It must consume the shared function…
  assert.ok(src.includes('const { recScore, SLA_DAYS, DUE_SOON_DAYS, freshnessStatus } = window.FLLM_RULES;'), 'must consume freshnessStatus from FLLM_RULES');
  assert.ok(src.includes('freshnessStatus(oldest)'), 'shield must derive its bucket via the shared function');
  // …and never re-declare the bucket thresholds inline (the drift that made
  // the hero disagree with the badge/worklist possible).
  assert.ok(!src.includes("oldest > slaDays ? 'stale'"), 'inline bucket ternary must not return');
  assert.ok(!src.includes("(DUE_SOON_DAYS || 60)"), 'inline due-soon fallback must not return');
});

// Runs the serialised sort comparator (site/shared-sort.js source) bound to a
// fake window.FLLM_RULES — recScore is only consulted by the 'recommended'
// branch, never by the mapped columns under test.
function clientComparator() {
  const rules = { recScore: () => 0, freeTypeRank };
  const win = { FLLM_RULES: rules };
  const run = new Function('window', sortClientBundle());
  run(win);
  return win.FLLM_SORT.comparator;
}

test('verified sort: ascending is oldest-first with unverified rows last', () => {
  const cmp = clientComparator();
  const rows = [
    { name: 'Zeta', last_verified: '2026-08-14' },
    { name: 'Alpha', last_verified: '2026-08-02' },
    { name: 'Beta', last_verified: null }, // unverified: no date
    { name: 'Gamma', last_verified: '2026-08-14' }, // date tie with Zeta
  ];
  const got = [...rows].sort((a, b) => cmp('verified', 1, a, b)).map((r) => r.name);
  assert.deepEqual(got, ['Alpha', 'Gamma', 'Zeta', 'Beta']);
});

test('verified sort: descending is newest-first with unverified rows still last', () => {
  const cmp = clientComparator();
  const rows = [
    { name: 'Zeta', last_verified: '2026-08-14' },
    { name: 'Alpha', last_verified: '2026-08-02' },
    { name: 'Beta', last_verified: null },
    { name: 'Gamma', last_verified: '2026-08-14' },
  ];
  const got = [...rows].sort((a, b) => cmp('verified', -1, a, b)).map((r) => r.name);
  assert.deepEqual(got, ['Zeta', 'Gamma', 'Alpha', 'Beta']);
});

test('verified sort: the boolean plays no role — only last_verified decides, with name as the tiebreak', () => {
  const cmp = clientComparator();
  const rows = [
    { name: 'Zed', verified: true, last_verified: '2026-08-01' },
    { name: 'Old', verified: true, last_verified: '2026-08-01' },
    // Same date as the others but verified:false — must NOT be pinned last:
    // the comparator keys on the date, not the flag.
    { name: 'Bool', verified: false, last_verified: '2026-08-01' },
    { name: 'Undated', verified: false, last_verified: null },
  ];
  const got = [...rows].sort((a, b) => cmp('verified', 1, a, b)).map((r) => r.name);
  assert.deepEqual(got, ['Bool', 'Old', 'Zed', 'Undated']);
});

test('shareable sort URLs preserve a valid ascending or descending direction', () => {
  const src = readFileSync(new URL('../site/explorer.js', import.meta.url), 'utf8');
  assert.match(src, /params\.set\('dir', sortDir === 1 \? 'asc' : 'desc'\)/, 'a non-default sort must write its direction');
  assert.match(src, /const dir = params\.get\('dir'\)/, 'URL state must read the direction');
  assert.match(src, /sortDir = dir === 'desc' \? -1 : 1/, 'only desc may invert the default ascending direction');
  assert.match(src, /th\.classList\.toggle\('asc', sortDir === 1\)/, 'the restored visual indicator must match the restored direction');
});

// ---------- provider compare view (#175) ----------
// The interactive /compare/ view renders with window.FLLM_COMPARE — the
// serialised copy of lib/compare.mjs that also renders the static
// /compare/<a>-vs-<b>/ pages. Exercise that exact client string.

function clientCompare() {
  const win = {};
  new Function('window', compareClientBundle())(win);
  return win.FLLM_COMPARE;
}

const cmpBase = {
  slug: 'groq', name: 'Groq', category: 'ongoing', free_type: 'renewing-quota', free_tier: 'free',
  rate_limits: '30 rpm', notes: 'n', modalities: ['text'], models_free: ['m1'],
  docs_url: 'https://console.groq.com/docs', card_required: false, phone_required: true,
  commercial_ok: null, openai_compatible: true, openai_base_url: 'https://api.groq.com/openai/v1',
  verified: true, last_verified: '2026-08-01',
};

test('compare: the URL parser keeps 2-4 known, well-formed, unique slugs in order', () => {
  const { parseCompareSlugs, COMPARE_MIN, COMPARE_MAX } = clientCompare();
  assert.equal(COMPARE_MIN, 2);
  assert.equal(COMPARE_MAX, 4);
  const known = ['groq', 'cloudflare-workers-ai', 'openrouter', 'jina-ai', 'cohere'];
  assert.deepEqual(parseCompareSlugs('?compare=groq,cloudflare-workers-ai', known), ['groq', 'cloudflare-workers-ai']);
  assert.deepEqual(parseCompareSlugs('?compare=GROQ, groq,nope,../x,openrouter', known), ['groq', 'openrouter'],
    'case-folded duplicates, unknown and malformed slugs are dropped');
  assert.deepEqual(parseCompareSlugs('?compare=groq,openrouter,jina-ai,cohere,cloudflare-workers-ai', known),
    ['groq', 'openrouter', 'jina-ai', 'cohere'], 'capped at four');
  assert.deepEqual(parseCompareSlugs('?p=jina-ai&p=&p=groq', known), ['jina-ai', 'groq'], 'the no-JS form shape (?p=a&p=b) parses too');
  assert.deepEqual(parseCompareSlugs('', known), []);
  assert.deepEqual(parseCompareSlugs('?compare=groq', null), [], 'nothing is valid without a known list');
});

test('compare: a null tri-state renders "not confirmed", never "no"', () => {
  const { compareTableHtml } = clientCompare();
  const out = compareTableHtml([cmpBase, { ...cmpBase, slug: 'b', name: 'B', card_required: null, phone_required: null, commercial_ok: false, openai_compatible: null, openai_base_url: null }]);
  const row = (label) => out.split('\n').find((l) => l.includes(`<th scope="row">${label}</th>`));
  assert.match(row('Credit card'), /tri-no">not required<\/span><\/td><td><span class="tri tri-unk">not confirmed/);
  assert.match(row('Phone verification'), /tri-yes">required<\/span><\/td><td><span class="tri tri-unk">not confirmed/);
  assert.match(row('Commercial use'), /tri-unk">not confirmed<\/span><\/td><td><span class="tri tri-no">not allowed \(eval only\)/);
  assert.match(row('OpenAI-compatible'), /tri-yes">yes<\/span><div class="cmp-sub"><code>https:\/\/api\.groq\.com\/openai\/v1<\/code>/);
  assert.match(row('OpenAI-compatible'), /<td><span class="tri tri-unk">not confirmed<\/span><\/td><\/tr>$/);
});

test('compare: every dataset field the issue lists has a row, one column per provider', () => {
  const { compareTableHtml } = clientCompare();
  const out = compareTableHtml([cmpBase, { ...cmpBase, slug: 'b', name: 'B' }, { ...cmpBase, slug: 'c', name: 'C' }], { prefix: '../' });
  for (const label of ['Type', 'What&#39;s free', 'Rate limits', 'Credit card', 'Phone verification', 'Commercial use',
    'OpenAI-compatible', 'Modalities', 'Free models (sample)', 'Official docs', 'Last verified']) {
    assert.ok(out.includes(`<th scope="row">${label}</th>`), `missing row ${label}`);
  }
  assert.equal((out.match(/<th scope="col">/g) || []).length, 4, 'a label column plus one per provider');
  assert.match(out, /<th scope="col"><a href="\.\.\/p\/groq">Groq<\/a><\/th>/);
  assert.match(out, /<span class="v ok">2026-08-01<\/span>/);
  assert.match(compareTableHtml([{ ...cmpBase, verified: false, last_verified: null }]), /<span class="v warn">unverified<\/span>/);
});

test('compare: an HTML payload in any provider field never becomes markup', () => {
  const { compareTableHtml } = clientCompare();
  const payload = '<img src=x onerror=alert(1)>';
  const out = compareTableHtml([{
    ...cmpBase,
    name: `Evil ${payload}`, free_tier: `free ${payload}`, rate_limits: `rl ${payload}`, notes: `notes ${payload}`,
    expires: `exp ${payload}`, free_type: `ft ${payload}`, modalities: [`text ${payload}`], models_free: [`m ${payload}`],
    openai_base_url: `https://x.test/${payload}`, docs_url: `https://x.test/"><script>alert(1)</script>`,
    last_verified: `2026-08-01 ${payload}`,
  }, { ...cmpBase, slug: 'x" onmouseover="alert(1)', docs_url: 'javascript:alert(1)' }]);
  assert.ok(!/<(img|script)[\s>]/i.test(out), `payload became a real tag:\n${out}`);
  assert.ok(!out.includes('onmouseover='), 'no event handler may survive');
  assert.ok(!/href="javascript:/i.test(out), 'a non-http docs_url must not become a link');
  assert.ok(!out.includes('href="p/x'), 'a non-kebab slug must not become a link');
  for (const s of ['Evil &lt;img', 'free &lt;img', 'rl &lt;img', 'notes &lt;img', 'exp &lt;img', 'ft &lt;img', 'text &lt;img', 'm &lt;img', '2026-08-01 &lt;img']) {
    assert.ok(out.includes(s), `escaped payload must survive as text: ${s}`);
  }
});

test('compare: the client view renders through the shared renderer only', () => {
  const src = readFileSync(new URL('../site/compare.js', import.meta.url), 'utf8');
  assert.match(src, /C\.compareTableHtml\(list/, 'compare.js must render with FLLM_COMPARE.compareTableHtml');
  assert.match(src, /C\.parseCompareSlugs\(/, 'compare.js must parse slugs with the shared parser');
  // the only innerHTML write is the shared, escaping renderer
  const writes = src.match(/innerHTML\s*=[^;]*/g) || [];
  assert.deepEqual(writes, ["innerHTML = C.compareTableHtml(list, { prefix: '../' })"]);
  assert.doesNotMatch(src, /\.name\s*\+|\+\s*p\.\w+/, 'compare.js must not concatenate provider fields into markup');
});
