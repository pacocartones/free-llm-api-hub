// The production flag component (scripts/lib/flags.mjs): four flags in a fixed order, each state drawn with a
// shape as well as a colour, the same markup from the server render and the browser's copy, and a full sentence
// as the accessible text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FLAG_DEFS, FLAG_MARKS, flagHtml, flagsHtml, flagState, flagText } from './lib/flags.mjs';
import { explorerRowHtml } from './lib/rows.mjs';
import { requirementsHtml, dataPolicyHtml } from './lib/provider-sections.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const PROVIDERS = JSON.parse(read('data/providers.json')).providers;

const def = (id) => FLAG_DEFS.find((d) => d.id === id);
const flagOf = (html, id) => (html.match(new RegExp(`<span class="pflag [^"]*" data-flag="${id}"[\\s\\S]*?<span class="sr-only">[^<]*</span></span>`)) || [''])[0];

test('flags: four, in the fixed order Card · Phone · Commercial · Training on prompts', () => {
  assert.deepEqual(FLAG_DEFS.map((d) => d.id), ['card', 'phone', 'commercial', 'training']);
  assert.deepEqual(FLAG_DEFS.map((d) => d.field), ['card_required', 'phone_required', 'commercial_ok', 'data_policy.trains_on_prompts']);
  const html = flagsHtml({ card_required: false });
  assert.deepEqual([...html.matchAll(/data-flag="([a-z]+)"/g)].map((m) => m[1]), ['card', 'phone', 'commercial', 'training']);
});

test('flags: each state has its own shape — ✓ ok, ✕ bad, ~ conditional, ? unknown — and its own class', () => {
  assert.deepEqual(FLAG_MARKS, { ok: '✓', bad: '✕', cond: '~', unk: '?' });
  const cases = [
    ['card', { card_required: false }, 'ok', 'Card required: no'],
    ['card', { card_required: true }, 'bad', 'Card required: yes'],
    ['card', { card_required: null }, 'unk', "Card required: not stated"],
    ['card', {}, 'unk', "Card required: not stated"],
    ['phone', { phone_required: false }, 'ok', 'Phone required: no'],
    ['phone', { phone_required: true }, 'bad', 'Phone required: yes'],
    ['phone', { phone_required: null }, 'unk', "Phone required: not stated"],
    ['commercial', { commercial_ok: true }, 'ok', 'Commercial use allowed: yes'],
    ['commercial', { commercial_ok: false }, 'bad', 'Commercial use allowed: no'],
    ['commercial', { commercial_ok: 'conditional' }, 'cond', 'Commercial use allowed: conditional'],
    ['commercial', { commercial_ok: null }, 'unk', "Commercial use allowed: not stated"],
    ['training', { data_policy: { trains_on_prompts: false } }, 'ok', 'Trains on prompts: no'],
    ['training', { data_policy: { trains_on_prompts: true } }, 'bad', 'Trains on prompts: yes'],
    ['training', { data_policy: { trains_on_prompts: null } }, 'unk', "Trains on prompts: not stated"],
    ['training', {}, 'unk', "Trains on prompts: not stated"],
  ];
  for (const [id, p, state, sentence] of cases) {
    for (const opts of [{}, { mini: true }]) {
      const html = flagHtml(def(id), p, opts);
      assert.match(html, new RegExp(`^<span class="pflag pflag-${state}${opts.mini ? ' pflag-mini' : ''}" data-flag="${id}"`), `${id} ${JSON.stringify(p)}: class pflag-${state}`);
      assert.ok(html.includes(`<span class="pflag-mark" aria-hidden="true">${FLAG_MARKS[state]}</span>`), `${id} ${JSON.stringify(p)}: the ${state} shape, hidden from screen readers`);
      assert.ok(html.includes(`<span class="sr-only">${sentence.replace(/'/g, '&#39;')}</span>`), `${id} ${JSON.stringify(p)}: the accessible sentence «${sentence}»`);
      assert.ok(html.includes(`title="${sentence.replace(/'/g, '&#39;')}"`), `${id}: the same sentence as tooltip`);
    }
  }
});

test('flags: an unknown names its reason from field_checks, as the spec example says', () => {
  const d = def('card');
  assert.equal(flagText(d, null, { status: 'source_silent' }), "Card required: not stated in the provider's docs");
  assert.equal(flagText(d, null, { status: 'needs_account' }), 'Card required: not stated: needs an account to check');
  assert.equal(flagText(d, null, { status: 'sources_disagree' }), "Card required: not stated: the provider's pages disagree");
  assert.equal(flagText(d, null, { status: 'toString' }), "Card required: not stated", 'an unknown status never reads a prototype key');
  assert.equal(flagText(d, false, { status: 'source_silent' }), 'Card required: no', 'a confirmed value ignores the check');
  assert.equal(flagState(d, 'yes'), 'unk', 'a value outside the tri-state is unknown, never a guess');
});

test('flags: the visible part and the mark are aria-hidden, so the sentence is read once', () => {
  const html = flagHtml(def('phone'), { phone_required: null }, { visible: '<span class="tri tri-unk">not stated</span>' });
  assert.match(html, /<span class="pflag-vis" aria-hidden="true"><span class="tri tri-unk">not stated<\/span><\/span>/);
  const mini = flagHtml(def('phone'), { phone_required: null }, { mini: true });
  assert.match(mini, /^<span class="pflag pflag-unk pflag-mini" data-flag="phone" title="[^"]+"><svg class="i" aria-hidden="true"><use href="#ic-phone"\/><\/svg><span class="pflag-mark" aria-hidden="true">\?<\/span><span class="sr-only">/);
  assert.doesNotMatch(html + mini, /role="img"/, 'no role=img: the sr-only sentence is the name');
});

test('flags: escaping holds for every field the component prints', () => {
  const evil = { card_required: '<img src=x onerror=alert(1)>' };
  const html = flagsHtml(evil);
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /data-flag="card"[^>]*>/);
});

// The home explorer no longer draws the flags as icons with ✓ marks: it says what is required or unknown in words (lib/rows.mjs
// needsOf), and its server/client parity is covered by home-density.test.mjs. The component stays on the provider pages.
test('flags: the explorer row says the four flags in words, with no icon marks', () => {
  const p = { slug: 'acme', name: 'Acme', category: 'ongoing', free_tier: 'f', card_required: false, phone_required: null, commercial_ok: true, openai_compatible: true, data_policy: { trains_on_prompts: true } };
  const html = explorerRowHtml(p, { now: '2026-11-25' });
  assert.doesNotMatch(html, /data-flag=|pflag|fmini|✓/, 'no flag icons and no tick marks in the row');
  assert.match(html, /<span class="need-req">Trains on prompts<\/span><span class="need-unk">Not stated: phone<\/span>/);
});

test('flags: the provider page uses the same component around its own words, with the field_checks reason', () => {
  const p = {
    slug: 'acme', name: 'Acme', card_required: null, phone_required: false, commercial_ok: 'conditional', commercial_ok_condition: 'not for resale',
    field_checks: { card_required: { status: 'source_silent', checked: '2026-11-20', sources: ['https://acme.example/terms'] } },
    data_policy: { trains_on_prompts: false, source: 'https://acme.example/privacy', checked: '2026-11-20' },
  };
  const req = requirementsHtml(p);
  assert.match(flagOf(req, 'card'), /^<span class="pflag pflag-unk" data-flag="card" title="Card required: not stated in the provider&#39;s docs">/);
  assert.match(flagOf(req, 'card'), /<span class="pflag-vis" aria-hidden="true"><span class="tri tri-unk tri-why"/, 'the words the page already used stay');
  assert.match(flagOf(req, 'phone'), /pflag-ok[\s\S]*>✓<[\s\S]*not required/);
  assert.match(flagOf(req, 'commercial'), /pflag-cond[\s\S]*>~</);
  assert.ok(req.indexOf('data-flag="card"') < req.indexOf('data-flag="phone"') && req.indexOf('data-flag="phone"') < req.indexOf('data-flag="commercial"'), 'in order');
  assert.match(flagOf(dataPolicyHtml(p), 'training'), /pflag-ok[\s\S]*Trains on prompts: no/);
});

test('flags: the built provider pages carry the component and the styles draw each shape', () => {
  const home = read('site/index.html');
  const groq = read('site/p/groq.html');
  for (const id of ['card', 'phone', 'commercial', 'training']) {
    assert.ok(groq.includes(`data-flag="${id}"`), `the Groq page shows the ${id} flag`);
  }
  assert.ok(!home.includes('data-flag='), 'the explorer says the flags in words instead (Needs / not stated)');
  const css = read('site/styles.css');
  assert.match(css, /\.pflag-ok \.pflag-mark \{ color: var\(--ok\); \}/);
  assert.match(css, /\.pflag-bad \.pflag-mark \{ color: var\(--bad\); \}/);
  assert.match(css, /\.pflag-unk \.pflag-mark \{ color: var\(--unk\); border-style: dashed; \}/, 'unknown is dashed, not only another colour');
  assert.match(css, /\.pflag-cond \.pflag-mark \{ color: var\(--unk\); \}/);
  // The collection tables already own .flags / .flag (build.mjs): the component keeps its own prefix so neither restyles the other.
  const all = flagsHtml({}, { mini: true }) + flagsHtml({});
  assert.deepEqual([...new Set([...all.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(' ')))].filter((c) => !/^(pflags?(-[a-z]+)?|sr-only|i)$/.test(c)), [], 'only pflag-prefixed classes');
  assert.doesNotMatch(css.slice(css.indexOf('/* The production flag (lib/flags.mjs)')), /^\.flags? [{,]/m, 'the component adds no rule for the collection-table classes');
});

test('modality filter: plain-text options with unchanged values, and a decorative dot coloured by the --m-* tokens', () => {
  const home = read('site/index.html');
  const select = home.match(/<select id="modality"[\s\S]*?<\/select>/)[0];
  const options = [...select.matchAll(/<option value="([^"]+)">([^<]*)<\/option>/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(options, [
    ['all', 'All modalities'], ['text', 'Text / LLM'], ['image', 'Image generation'], ['audio', 'Speech (STT/TTS)'],
    ['embeddings', 'Embeddings'], ['rerank', 'Rerank'], ['ocr', 'OCR / documents'], ['vision', 'Vision'],
  ], 'the values explorer.js and the GA4 hook read are unchanged');
  for (const [, label] of options) assert.doesNotMatch(label, /\p{Extended_Pictographic}/u, `no emoji in «${label}»: a screen reader would announce it`);
  assert.match(home, /<span class="mod-dot" id="modality-dot" data-mod="all" aria-hidden="true"><\/span><select id="modality"/, 'the dot is decorative');
  const css = read('site/styles.css');
  for (const [value] of options.slice(1)) assert.ok(css.includes(`.mod-dot[data-mod="${value}"] { background: var(--m-${value}); }`), `the ${value} dot reads --m-${value}`);
  assert.match(read('site/explorer.js'), /getElementById\('modality-dot'\)[\s\S]{0,40}if \(modDot\) modDot\.setAttribute\('data-mod', modality\)/, 'explorer.js keeps the dot in step with the filter');
});
