// The brand H1 aura (scripts/lib/aura.mjs), the receipt stamp (scripts/lib/stamp.mjs) and the mark drawn from the aura
// (scripts/icons.mjs). Each test names the mutant it catches.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { AURA_ORDER, AURA_HUES, AURA_HOLE, auraSpec, auraGradient, auraHtml, auraSvg, HUB_AURA, FAVICON_AURA } from './lib/aura.mjs';
import { stampHtml, stampSource, stampDate } from './lib/stamp.mjs';
import { clientBundle } from './lib/rows.mjs';
import { faviconSvg, logoSymbol, logoSvg, logoFullSvg } from './icons.mjs';

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const base = { slug: 'acme', name: 'Acme', category: 'ongoing', modalities: ['audio', 'text'], verified: true, last_verified: '2026-11-20',
  card_required: false, phone_required: false, commercial_ok: true, data_policy: { trains_on_prompts: false } };

test('aura: sectors follow the fixed modality order, whatever order the record lists them in', () => {
  // Mutant: draw sectors in record order; two providers with the same modalities would get different auras.
  assert.deepEqual(auraSpec(base).modalities, ['text', 'audio']);
  assert.deepEqual(auraSpec({ ...base, modalities: ['text', 'audio'] }).modalities, ['text', 'audio']);
  assert.deepEqual(auraSpec({ ...base, modalities: ['ocr', 'nonsense', 'vision'] }).modalities, ['vision', 'ocr'], 'unknown values are ignored');
  assert.deepEqual(auraSpec({ ...base, modalities: [] }).modalities, ['text'], 'an empty list still draws an aura');
});

test('aura: every schema modality has a sector order and a hue, and the hues equal the --h-* tokens of the stylesheet', () => {
  // Mutant: change a hue in one place only; the SVG (OG, logo) and the web aura would disagree.
  const schema = JSON.parse(read('data/schema.json'));
  const find = (o) => { if (!o || typeof o !== 'object') return null; if (o.modalities?.items?.enum) return o.modalities.items.enum; for (const v of Object.values(o)) { const r = find(v); if (r) return r; } return null; };
  const css = read('site/styles.css');
  for (const m of find(schema)) {
    assert.ok(AURA_ORDER.includes(m), m + ' is in AURA_ORDER');
    const tok = css.match(new RegExp('--h-' + m + ':\\s*(#[0-9a-f]{6});', 'i'));
    assert.ok(tok, '--h-' + m);
    assert.equal(tok[1].toLowerCase(), AURA_HUES[m], m + ': aura.mjs and styles.css agree');
  }
});

test('aura: disc or ring by category, dashed edge when a flag is unknown, faded when older than 30 days', () => {
  // Mutant: count a confirmed "no" as unknown, or fade from the build's clock instead of the reference date.
  assert.equal(auraSpec(base).ongoing, true);
  assert.equal(auraSpec({ ...base, category: 'trial' }).ongoing, false);
  assert.equal(auraSpec(base).unknown, 0);
  assert.equal(auraSpec({ ...base, phone_required: null, commercial_ok: undefined }).unknown, 2);
  assert.equal(auraSpec({ ...base, card_required: true }).unknown, 0, 'a confirmed bad answer is known');
  assert.equal(auraSpec(base, { now: '2026-12-20' }).old, false, '30 days is not old');
  assert.equal(auraSpec(base, { now: '2026-12-21' }).old, true, '31 days is');
  assert.equal(auraSpec(base).old, false, 'no reference date, never faded');
  assert.equal(auraSpec({ ...base, verified: false }, { now: '2026-11-20' }).old, true, 'unverified is faded');
  assert.match(auraSpec({ ...base, phone_required: null, category: 'trial' }).label, /text, speech · trial credit \(ring\) · 1 of 4 flags not stated \(dashed edge\)/);
});

test('aura: the web form is a conic gradient of the --h-* tokens with the state as classes, and escapes the name', () => {
  // Mutant: put a raw hue in the inline style (the theme could not restyle it), or let a name close the attribute.
  assert.equal(auraGradient(auraSpec(base)), 'conic-gradient(from 210deg, var(--h-text) 0% 50%, var(--h-audio) 50% 100%)');
  const html = auraHtml({ ...base, category: 'trial', phone_required: null, name: 'A"><script>' }, { now: '2027-02-01', cls: 'aura-sm' });
  assert.match(html, /^<span class="aura aura-ring aura-dash aura-old aura-sm" style="--aura:conic-gradient\(/);
  assert.match(html, /aria-hidden="true" title="A&quot;&gt;&lt;script&gt;: /);
  assert.ok(!html.includes('<script>'));
  assert.match(auraHtml(base, { img: true }), /role="img" aria-label="Acme: text, speech · ongoing free tier \(full disc\)"/);
});

test('aura: the SVG form draws one arc per modality, a hole for a trial, a dashed edge and a saturate filter, deterministically', () => {
  // Mutant: lose a sector, the hole or the dashed edge in the social images, or make the output depend on anything but the spec.
  const spec = auraSpec({ ...base, modalities: ['text', 'vision', 'audio'], category: 'trial', phone_required: null }, { now: '2027-02-01' });
  const svg = auraSvg(spec, { cx: 50, cy: 50, r: 40, ground: '#0e0e11', id: 'p' });
  assert.equal((svg.match(/<path d="M50 50L/g) || []).length, 3, 'three sectors');
  for (const m of ['text', 'vision', 'audio']) assert.ok(svg.includes(`fill="${AURA_HUES[m]}"`), m);
  assert.ok(svg.includes(`r="${40 * AURA_HOLE}" fill="#0e0e11"`), 'the ring hole in the ground colour');
  assert.match(svg, /stroke-dasharray=/, 'the dashed edge');
  assert.match(svg, /<feColorMatrix type="saturate" values=".25"\/>/, 'faded');
  assert.equal(svg, auraSvg(spec, { cx: 50, cy: 50, r: 40, ground: '#0e0e11', id: 'p' }));
  assert.match(auraSvg(auraSpec({ ...base, modalities: ['ocr'] }), { r: 10 }), /<circle cx="0" cy="0" r="10" fill="#ff7a3d"\/>/, 'one modality is a whole disc');
});

test('aura and stamp run in the browser from the client bundle and print exactly what the server prints', () => {
  // Mutant: an aura or stamp helper that reads a name the bundle does not define; the first repaint would throw.
  const ctx = { window: { FLLM_RULES: (() => { const m = { exports: {} }; return m; })() } };
  const rules = read('site/shared-rules.js');
  vm.runInNewContext(rules + '\n' + clientBundle(), ctx);
  const p = { ...base, stamp: { q: 'Free plan: 30 requests per minute.', u: 'https://acme.example/limits' }, phone_required: null };
  assert.equal(ctx.window.FLLM_ROWS.auraHtml(p, { now: '2026-12-01' }), auraHtml(p, { now: '2026-12-01' }));
  assert.equal(ctx.window.FLLM_ROWS.stampHtml(p, { now: '2026-12-01' }), stampHtml(p, { now: '2026-12-01' }));
});

test('stamp: "✓ 24 Nov · source" links the checked page and carries the quoted sentence in its title', () => {
  // Mutant: drop the quote, link a non-https URL, or print the stamp for an unverified record.
  const p = { ...base, last_verified: '2026-11-24', stamp: { q: 'Free: 30 "RPM"', u: 'https://acme.example/limits' } };
  const html = stampHtml(p, { now: '2026-11-25' });
  assert.match(html, /^<a class="stamp badge b-ok" title="Verified 1d ago · 2026-11-24 · “Free: 30 &quot;RPM&quot;”" href="https:\/\/acme\.example\/limits" rel="noopener">/);
  assert.match(html, /<time datetime="2026-11-24">24 Nov<\/time><span class="stamp-sep" aria-hidden="true"> · <\/span>source/);
  assert.match(stampHtml(p, { now: '2026-11-25', long: true }), /<time datetime="2026-11-24">Verified 24 Nov 2026<\/time>/);
  assert.match(stampHtml({ ...p, stamp: { u: 'javascript:alert(1)' } }, { now: '2026-11-25' }), /^<span class="stamp badge b-ok"/, 'no link without an https URL');
  assert.equal(stampHtml({ ...p, verified: false }, { now: '2026-11-25' }), '');
  assert.equal(stampDate('2026-01-05'), '5 Jan');
  assert.equal(stampDate('2026-01-05', true), '5 Jan 2026');
});

test('stamp: the receipt comes from the quote register, then the data-policy quote, then the docs', () => {
  // Mutant: pick another provider's sentence, or a note passage instead of the entry's own sentence.
  const reg = { entries: [
    { slug: 'acme', kind: 'note_passage', text: 'a passage', source_url: 'https://acme.example/terms' },
    { slug: 'other', kind: 'sentence', text: 'not ours', source_url: 'https://other.example' },
    { slug: 'acme', kind: 'sentence', text: 'Our free tier.', source_url: 'https://acme.example/pricing' },
  ] };
  assert.deepEqual(stampSource({ ...base, docs_url: 'https://acme.example/docs' }, reg), { q: 'Our free tier.', u: 'https://acme.example/pricing' });
  assert.deepEqual(stampSource({ ...base, slug: 'zed', data_policy: { quote: 'We do not train.', source: 'https://zed.example/privacy' }, docs_url: 'https://zed.example/docs' }, reg),
    { q: 'We do not train.', u: 'https://zed.example/privacy' });
  assert.deepEqual(stampSource({ slug: 'zed', docs_url: 'https://zed.example/docs' }, reg), { u: 'https://zed.example/docs' });
  assert.ok(stampSource({ slug: 'acme' }, { entries: [{ slug: 'acme', kind: 'sentence', text: 'x '.repeat(200) }] }).q.length <= 281, 'a long quote is cut');
});

test('the committed home stamps every verified row and gives every row its aura', () => {
  const html = read('site/index.html');
  const rows = html.slice(html.indexOf('<!-- AUTOGEN:rows:start -->'), html.indexOf('<!-- AUTOGEN:rows:end -->'));
  const n = (rows.match(/<tr role="row">/g) || []).length;
  assert.ok(n > 30);
  assert.equal((rows.match(/<span class="aura[ "]/g) || []).length, n, 'one aura per row');
  const providers = JSON.parse(read('data/providers.json')).providers;
  assert.equal((rows.match(/class="stamp badge /g) || []).length, providers.filter((p) => p.verified && p.last_verified).length, 'one stamp per verified row');
  assert.ok((rows.match(/<a class="stamp badge [^"]+" title="Verified \d+d ago · [0-9-]+ · “/g) || []).length > 20, 'most stamps carry a quote');
});

test('the mark: the sprite, the favicon and the logo files are the hub aura, exactly as icons.mjs writes them', () => {
  // Mutant: edit one copy of the logo by hand; the sprite of index.html, 404.html and build.mjs would drift apart.
  for (const rel of ['site/index.html', 'site/404.html', 'site/best/index.html']) assert.ok(read(rel).includes(logoSymbol()), rel + ': the #logo symbol');
  assert.equal(read('site/favicon.svg'), faviconSvg(), 'favicon.svg (npm run icons)');
  assert.doesNotMatch(faviconSvg(), /<animate/, 'the tab icon does not move');
  assert.equal(read('assets/logo-light.svg'), logoSvg('light'));
  assert.equal(read('assets/logo-dark.svg'), logoSvg('dark'));
  assert.equal(read('assets/logo-full.svg'), logoFullSvg());
  assert.equal(HUB_AURA.modalities.length, 6);
  assert.equal(FAVICON_AURA.modalities.length, 4, 'four sectors stay legible at 16 px');
  assert.doesNotMatch(logoSvg('light'), /<text/, 'the wordmark is outlined: no font needed');
});
