// The brand H1 aura (scripts/lib/aura.mjs: the Cálida radial bars), the receipt (scripts/lib/stamp.mjs: the perforated
// ticket and the compact pill) and the mark drawn from the aura (scripts/icons.mjs). Each test names the mutant it catches.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { AURA_ORDER, AURA_HUES, AURA_GEOMETRY, auraRng, auraSpec, auraPaths, auraHtml, auraSvg, HUB_AURA, FAVICON_AURA } from './lib/aura.mjs';
import { stampHtml, stampSource, stampSources, stampDate } from './lib/stamp.mjs';
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

test('aura: every schema modality has a sector order and a hue per theme, equal to the --h-* tokens of the stylesheet', () => {
  // Mutant: change a hue in one place only; the SVG (OG, logo) and the web aura would disagree.
  const schema = JSON.parse(read('data/schema.json'));
  const find = (o) => { if (!o || typeof o !== 'object') return null; if (o.modalities?.items?.enum) return o.modalities.items.enum; for (const v of Object.values(o)) { const r = find(v); if (r) return r; } return null; };
  const css = read('site/styles.css');
  const block = (selector) => css.slice(css.indexOf(selector + ' {'), css.indexOf('\n}', css.indexOf(selector + ' {')));
  for (const [theme, b] of [['dark', block(':root')], ['light', block('[data-theme="light"]')]]) {
    for (const m of find(schema)) {
      assert.ok(AURA_ORDER.includes(m), m + ' is in AURA_ORDER');
      const tok = b.match(new RegExp('--h-' + m + ':\\s*(#[0-9a-f]{6});', 'i'));
      assert.ok(tok, theme + ': --h-' + m);
      assert.equal(tok[1].toLowerCase(), AURA_HUES[theme][m], theme + ' ' + m + ': aura.mjs and styles.css agree');
      assert.match(css, new RegExp('\\.aura \\.h-' + m + ' \\{ stroke: var\\(--h-' + m + '\\); \\}'), 'the web bars of ' + m + ' read the token');
    }
  }
});

test('aura: sun or crown by category, dashed circle when a flag is unknown, faded when older than 30 days', () => {
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
  assert.match(auraSpec({ ...base, phone_required: null, category: 'trial' }).label, /text, speech · trial credit \(outer crown only\) · 1 of 4 flags not stated \(dashed circle\)/);
  assert.equal(auraSpec(base).seed, 'acme', 'the slug is the seed');
});

test('aura: 40 radial bars, one contiguous sector per modality, rotation and lengths from the slug, stable across runs', () => {
  // Mutant: a seed from Math.random (the aura would change at every build), sectors that interleave, or bars outside the box.
  const G = AURA_GEOMETRY;
  assert.equal(G.bars, 40);
  const spec = auraSpec({ ...base, modalities: ['text', 'vision', 'audio'] });
  const paths = auraPaths(spec, 1);
  assert.deepEqual(paths.map((x) => x[0]), ['text', 'vision', 'audio'], 'one path per sector, in order');
  const segs = paths.flatMap((x) => x[1].match(/M[^M]+/g));
  assert.equal(segs.length, 40, '40 bars');
  for (const seg of segs) {
    const [x1, y1, x2, y2] = seg.slice(1).split(/[ L]/).map(Number);
    const r0 = Math.hypot(x1 - 50, y1 - 50), r1 = Math.hypot(x2 - 50, y2 - 50);
    assert.ok(Math.abs(r0 - G.ongoing.r0) < 0.2, 'an ongoing bar starts at the centre ring: ' + r0);
    assert.ok(r1 - r0 >= G.ongoing.len * G.minLen - 0.2 && r1 - r0 <= G.ongoing.len + 0.2, 'its length is within minLen…1 of the sector: ' + (r1 - r0));
  }
  const trial = auraPaths({ ...spec, ongoing: false }, 1).flatMap((x) => x[1].match(/M[^M]+/g));
  for (const seg of trial) {
    const [x1, y1, x2, y2] = seg.slice(1).split(/[ L]/).map(Number);
    assert.ok(Math.abs(Math.hypot(x1 - 50, y1 - 50) - G.trial.r0) < 0.2, 'a trial is an outer crown only');
    assert.ok(Math.hypot(x2 - 50, y2 - 50) <= G.trial.r0 + G.trial.len + 0.2);
  }
  assert.deepEqual(auraPaths(spec, 1), auraPaths(auraSpec({ ...base, modalities: ['audio', 'vision', 'text'] }), 1), 'same record, same aura');
  assert.notDeepEqual(auraPaths(spec, 1), auraPaths({ ...spec, seed: 'other' }, 1), 'another slug, another aura');
  const a = auraRng('groq'), b = auraRng('groq');
  assert.equal(a(), b(), 'the generator is deterministic');
});

test('aura: the web form is an inline SVG whose bars take the --h-* tokens by class, the state as classes, the name escaped', () => {
  // Mutant: paint a raw hue into the web SVG (the theme could not restyle it), or let a name close the attribute.
  const html = auraHtml({ ...base, category: 'trial', phone_required: null, name: 'A"><script>' }, { now: '2027-02-01', cls: 'aura-sm' });
  assert.match(html, /^<span class="aura aura-trial aura-dash aura-old aura-sm" aria-hidden="true" title="A&quot;&gt;&lt;script&gt;: /);
  assert.ok(!html.includes('<script>'));
  assert.match(html, /<svg viewBox="0 0 100 100" focusable="false"><g stroke-width="3"><path class="h-text" d="M/);
  assert.match(html, /<path class="h-audio" d="M/);
  assert.match(html, /<circle class="aura-edge" cx="50" cy="50" r="48.4" stroke-width="2.2" stroke-dasharray="4 3"\/>/, 'the dashed circle');
  assert.doesNotMatch(html, /#[0-9a-f]{6}/i, 'no raw colour on the web');
  assert.doesNotMatch(auraHtml(base), /aura-edge/, 'no dashed circle when every flag is stated');
  assert.match(auraHtml(base), /<g stroke-width="3.3">/, 'the ongoing stroke');
  assert.match(auraHtml(base, { img: true }), /role="img" aria-label="Acme: text, speech · ongoing free tier \(rays from the centre\)"/);
  assert.match(auraHtml(base, { digits: 1 }), /d="M[^"]*\.\d/, 'a large aura keeps a decimal');
  assert.doesNotMatch(auraHtml(base), /d="M[^"]*\.\d/, 'a small aura keeps whole units (a lighter page)');
});

test('aura: the SVG form draws the same bars in one theme\'s hues, the dashed circle and a saturate filter, deterministically', () => {
  // Mutant: lose a sector or the dashed circle in the social images, mix the themes, or depend on anything but the spec.
  const spec = auraSpec({ ...base, modalities: ['text', 'vision', 'audio'], category: 'trial', phone_required: null }, { now: '2027-02-01' });
  const svg = auraSvg(spec, { cx: 50, cy: 50, r: 40, id: 'p', theme: 'dark' });
  assert.match(svg, /<g transform="translate\(10 10\) scale\(0.8\)">/, 'the 100-unit box scaled to the radius');
  assert.equal((svg.match(/<path d="M/g) || []).length, 3, 'three sectors');
  for (const m of ['text', 'vision', 'audio']) assert.ok(svg.includes(`stroke="${AURA_HUES.dark[m]}"`), m);
  assert.ok(!svg.includes(AURA_HUES.light.text), 'one theme only');
  assert.match(svg, /stroke="#f2c14e" stroke-width="2.2" stroke-dasharray="4 3"/, 'the dashed circle in the dark --unk');
  assert.match(svg, /<feColorMatrix type="saturate" values="0.2"\/>/, 'faded');
  assert.equal(svg, auraSvg(spec, { cx: 50, cy: 50, r: 40, id: 'p', theme: 'dark' }));
  assert.match(auraSvg(HUB_AURA, { theme: 'css' }), /style="stroke:var\(--h-text\)"/, 'the sprite form reads the tokens');
});

test('aura and stamp run in the browser from the client bundle and print exactly what the server prints', () => {
  // Mutant: an aura or stamp helper that reads a name the bundle does not define; the first repaint would throw.
  const ctx = { window: { FLLM_RULES: (() => { const m = { exports: {} }; return m; })() } };
  const rules = read('site/shared-rules.js');
  vm.runInNewContext(rules + '\n' + clientBundle(), ctx);
  const p = { ...base, stamp: { q: 'Free plan: 30 requests per minute.', u: 'https://acme.example/limits' }, phone_required: null };
  assert.equal(ctx.window.FLLM_ROWS.auraHtml(p, { now: '2026-12-01' }), auraHtml(p, { now: '2026-12-01' }));
  assert.equal(ctx.window.FLLM_ROWS.stampHtml(p, { now: '2026-12-01' }), stampHtml(p, { now: '2026-12-01' }));
  assert.equal(ctx.window.FLLM_ROWS.stampHtml(p, { now: '2026-12-01', shape: 'pill' }), stampHtml(p, { now: '2026-12-01', shape: 'pill' }));
});

test('stamp: the perforated ticket "✓ | Verified 24 Nov 2026 · N sources" links the checked page and carries the quote', () => {
  // Mutant: drop the quote, link a non-https URL, lose the cut line between the mark and the text, or stamp an unverified record.
  const p = { ...base, last_verified: '2026-11-24', stamp: { q: 'Free: 30 "RPM"', u: 'https://acme.example/limits', n: 7 } };
  const html = stampHtml(p, { now: '2026-11-25' });
  assert.match(html, /^<a class="stamp stamp-ticket b-ok" title="Verified 1d ago · 2026-11-24 · “Free: 30 &quot;RPM&quot;”" href="https:\/\/acme\.example\/limits" rel="noopener">/);
  assert.match(html, /<b class="stamp-mark" aria-hidden="true">✓<\/b><span class="stamp-text"><span class="sr-only">Verified, fresh: <\/span>Verified <time datetime="2026-11-24">24 Nov 2026<\/time> · 7 sources/);
  assert.match(stampHtml(p, { now: '2026-11-25', long: true }), /class="stamp stamp-ticket b-ok stamp-lg"/);
  assert.match(stampHtml({ ...p, stamp: { ...p.stamp, n: 1 } }, { now: '2026-11-25' }), / · 1 source</, 'singular');
  assert.match(stampHtml({ ...p, stamp: { u: 'javascript:alert(1)' } }, { now: '2026-11-25' }), /^<span class="stamp stamp-ticket b-ok"/, 'no link without an https URL');
  assert.match(stampHtml(p, { now: '2027-03-01' }), /class="stamp stamp-ticket b-stale".*<b class="stamp-mark" aria-hidden="true">!<\/b>/, 'stale: the mark changes, not only the colour');
  assert.equal(stampHtml({ ...p, verified: false }, { now: '2026-11-25' }), '');
  const css = read('site/styles.css');
  assert.match(css, /\.stamp-ticket \{[^}]*background: var\(--seal-bg\);[^}]*transform: rotate\(-1\.5deg\);[^}]*mask: radial-gradient\(circle at 0 50%, transparent 5px/, 'apricot fill, turned, notched');
  assert.match(css, /\.stamp-ticket \.stamp-mark \{[^}]*border-right: 1\.5px dashed currentColor;/, 'the cut line');
  assert.equal(stampDate('2026-01-05'), '5 Jan');
  assert.equal(stampDate('2026-01-05', true), '5 Jan 2026');
});

test('stamp: the compact pill is flat, a status dot then "Verified · 24 Nov 2026 · N sources", and dashed when due', () => {
  // Mutant: rotate the pill, drop the dot or say freshness by colour alone.
  const p = { ...base, last_verified: '2026-11-24', stamp: { u: 'https://acme.example/limits', n: 3 } };
  const html = stampHtml(p, { now: '2026-11-25', shape: 'pill' });
  assert.match(html, /^<a class="stamp stamp-pill b-ok" title="Verified 1d ago · 2026-11-24 on the provider’s own docs" href="https:\/\/acme\.example\/limits" rel="noopener"><span class="stamp-dot" aria-hidden="true"><\/span><span class="sr-only">Verified, fresh: <\/span><b>Verified<\/b><span aria-hidden="true"> · <\/span><time datetime="2026-11-24">24 Nov 2026<\/time> · 3 sources/);
  assert.match(stampHtml(p, { now: '2027-02-01', shape: 'pill' }), /class="stamp stamp-pill b-warn"[^>]*>.*Verified, due for re-check/);
  const css = read('site/styles.css');
  const rule = css.match(/\.stamp-pill \{[^}]*\}/)[0];
  assert.doesNotMatch(rule, /rotate/, 'flat');
  assert.match(rule, /border-radius: 999px/);
  assert.match(css, /\.stamp-pill\.b-warn \{ border-style: dashed; \}/, 'due is dashed, not only amber');
});

test('stamp: N sources counts the distinct https pages behind the entry', () => {
  // Mutant: count the same page twice, or count a non-https value.
  const p = { docs_url: 'https://a.example/docs', free_limits: { source: 'https://a.example/limits' }, data_policy: { source: 'https://a.example/docs#privacy' },
    field_checks: { phone_required: { sources: ['https://a.example/terms', 'https://a.example/limits'] }, commercial_ok: { source: 'http://insecure.example' } } };
  assert.deepEqual(stampSources(p), ['https://a.example/docs', 'https://a.example/limits', 'https://a.example/terms']);
  const groq = JSON.parse(read('data/providers.json')).providers.find((x) => x.slug === 'groq');
  assert.ok(stampSources(groq).length >= 3, 'the example entry has several sources');
});

test('stamp: the receipt comes from the quote register, then the data-policy quote, then the docs', () => {
  // Mutant: pick another provider's sentence, or a note passage instead of the entry's own sentence.
  const reg = { entries: [
    { slug: 'acme', kind: 'note_passage', text: 'a passage', source_url: 'https://acme.example/terms' },
    { slug: 'other', kind: 'sentence', text: 'not ours', source_url: 'https://other.example' },
    { slug: 'acme', kind: 'sentence', text: 'Our free tier.', source_url: 'https://acme.example/pricing' },
  ] };
  assert.deepEqual(stampSource({ ...base, docs_url: 'https://acme.example/docs' }, reg), { q: 'Our free tier.', u: 'https://acme.example/pricing', n: 1 });
  assert.deepEqual(stampSource({ ...base, slug: 'zed', data_policy: { quote: 'We do not train.', source: 'https://zed.example/privacy' }, docs_url: 'https://zed.example/docs' }, reg),
    { q: 'We do not train.', u: 'https://zed.example/privacy', n: 2 });
  assert.deepEqual(stampSource({ slug: 'zed', docs_url: 'https://zed.example/docs' }, reg), { u: 'https://zed.example/docs', n: 1 });
  assert.ok(stampSource({ slug: 'acme' }, { entries: [{ slug: 'acme', kind: 'sentence', text: 'x '.repeat(200) }] }).q.length <= 281, 'a long quote is cut');
});

test('the committed home gives every verified row the pill and every row its aura', () => {
  const html = read('site/index.html');
  const rows = html.slice(html.indexOf('<!-- AUTOGEN:rows:start -->'), html.indexOf('<!-- AUTOGEN:rows:end -->'));
  const n = (rows.match(/<tr role="row">/g) || []).length;
  assert.ok(n > 30);
  assert.equal((rows.match(/<span class="aura[ "]/g) || []).length, n, 'one aura per row');
  const providers = JSON.parse(read('data/providers.json')).providers;
  assert.equal((rows.match(/class="stamp stamp-pill /g) || []).length, providers.filter((p) => p.verified && p.last_verified).length, 'one pill per verified row');
  assert.equal((rows.match(/stamp-ticket/g) || []).length, 0, 'the ticket is for the provider page, not the table');
  assert.ok((rows.match(/<a class="stamp stamp-pill [^"]+" title="Verified \d+d ago · [0-9-]+ · “/g) || []).length > 20, 'most stamps carry a quote');
  assert.ok((rows.match(/ · \d+ sources?</g) || []).length > 30, 'the pills count their sources');
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
  assert.ok(FAVICON_AURA.bars < AURA_GEOMETRY.bars, 'fewer, thicker bars at 16 px');
  assert.doesNotMatch(logoSvg('light'), /<text/, 'the wordmark is outlined: no font needed');
});
