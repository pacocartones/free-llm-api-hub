// The i18n layer (lib/i18n.mjs, lib/i18n-pages.mjs, i18n/*.json, docs/i18n.md): catalogue parity, t() escaping and
// plurals, Spanish dates and numbers, the translation rules ("not stated" is "no indicado", quotes are never
// translated) and the hreflang / sitemap helpers. The build-level checks (English byte-identical) are in
// i18n-build.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { makeTmpDir } from './lib/tmp.mjs';
import { escapeText } from './lib/html.mjs';
import { pythonChatQuickstart } from './lib/quickstart.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createI18n, loadCatalog, catalogKeys, placeholders, formatDate, formatNumber, formatShortMonth, formatMonth, buildLocales, hreflangLinks, localizedSitemapXml, LOCALES } from './lib/i18n.mjs';
import { providerEsMain, homeEsMain, answerFirstL, flagWordsL, limitsL } from './lib/i18n-pages.mjs';
import { humanDate } from './lib/dates.mjs';
import { NOT_STATED } from './lib/not-stated.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const en = loadCatalog('en');
const es = loadCatalog('es');

test('every locale has a catalogue and translates only keys that exist in English', () => {
  for (const l of LOCALES) assert.ok(loadCatalog(l)._meta, `i18n/${l}.json has _meta`);
  const enKeys = new Set(catalogKeys(en));
  const extra = catalogKeys(es).filter((k) => !enKeys.has(k));
  assert.deepEqual(extra, [], 'keys in es.json that en.json does not have');
});

test('the Spanish slice is complete: every English key is translated', () => {
  const missing = catalogKeys(en).filter((k) => !Object.hasOwn(es, k));
  assert.deepEqual(missing, [], 'add these keys to i18n/es.json');
});

test('a translation keeps the placeholders and the plural shape of its English source', () => {
  for (const k of catalogKeys(es)) {
    assert.deepEqual(placeholders(es[k]), placeholders(en[k]), `${k}: placeholders differ`);
    assert.equal(typeof es[k], typeof en[k], `${k}: one is a plural, the other is not`);
    if (typeof es[k] === 'object') {
      assert.ok(es[k].other && es[k].one, `${k}: Spanish plurals need "one" and "other"`);
      for (const f of Object.keys(es[k])) assert.ok(['zero', 'one', 'two', 'few', 'many', 'other'].includes(f), `${k}: ${f} is not a plural category`);
    }
    for (const v of typeof es[k] === 'object' ? Object.values(es[k]) : [es[k]]) assert.ok(String(v).trim(), `${k}: empty translation`);
  }
});

test('only _html keys carry markup, and no catalogue value carries a script or a handler', () => {
  for (const cat of [en, es]) {
    for (const k of catalogKeys(cat)) {
      const values = typeof cat[k] === 'object' ? Object.values(cat[k]) : [cat[k]];
      for (const v of values) {
        if (!k.endsWith('_html')) assert.doesNotMatch(v, /<[a-z]/i, `${k}: markup in a plain key (name it *_html)`);
        assert.doesNotMatch(v, /<script|\son\w+=|javascript:/i, `${k}: unsafe markup`);
      }
    }
  }
});

test('translation rule: "not stated" is "no indicado", and English keeps the site-wide wording', () => {
  assert.equal(en['common.not_stated'], NOT_STATED);
  assert.equal(es['common.not_stated'], 'no indicado');
});

test('t() escapes plain values and every param; _html values are trusted markup', () => {
  const L = createI18n('es');
  assert.equal(L.t('provider.answer_ongoing', { name: '<b>X</b> & "Y"' }), 'Sí: &lt;b&gt;X&lt;/b&gt; &amp; &quot;Y&quot; tiene un nivel gratuito permanente.');
  assert.equal(L.t('home.stat_trial_html', { count: 3 }), '<strong>3</strong> créditos de prueba');
  assert.equal(createI18n('en').t('footer.guides'), 'Guides &amp; collections');
  assert.equal(createI18n('en').text('footer.guides'), 'Guides & collections');
  assert.throws(() => L.text('footer.blurb_html'), /is HTML/);
  assert.throws(() => L.t('provider.answer_ongoing'), /missing param "name"/);
  assert.throws(() => L.t('no.such.key'), /unknown key/);
});

test('plurals follow Intl.PluralRules and counts use the locale digits', () => {
  const L = createI18n('es');
  assert.equal(L.t('home.recheck_days', { count: 1 }), 'Revisado en el último día');
  assert.equal(L.t('home.recheck_days', { count: 7 }), 'Revisado en los últimos 7 días');
  assert.equal(L.t('common.sources', { count: 12000 }), '12.000 fuentes');
  assert.equal(createI18n('en').t('common.sources', { count: 1 }), '1 source');
  assert.throws(() => L.t('common.sources', {}), /needs a numeric count/);
});

test('a key missing from a locale falls back to English and is recorded', () => {
  const dir = makeTmpDir('flah-i18n-');
  writeFileSync(join(dir, 'en.json'), JSON.stringify({ _meta: { locale: 'en' }, 'only.english': 'Only in English' }));
  writeFileSync(join(dir, 'es.json'), JSON.stringify({ _meta: { locale: 'es', htmlLang: 'es' } }));
  const L = createI18n('es', { dir });
  assert.equal(L.t('only.english'), 'Only in English');
  assert.deepEqual([...L.missing], ['only.english']);
});

test('dates: "24 nov 2026" in Spanish, the site\'s own humanDate in English, ISO kept in <time>', () => {
  assert.equal(formatDate('2026-11-24', 'es'), '24 nov 2026');
  assert.equal(formatDate('2026-09-05', 'es'), '5 sept 2026');
  assert.equal(formatDate('2026-01-01', 'es', false), '1 ene');
  for (const d of ['2026-11-24', '2025-02-03', '2027-12-31']) assert.equal(formatDate(d, 'en'), humanDate(d));
  assert.equal(formatDate('2026-13-01', 'es'), null);
  assert.equal(formatDate('nope', 'es'), null);
  assert.equal(createI18n('es').time('2026-11-24'), '<time datetime="2026-11-24">24 nov 2026</time>');
  assert.equal(formatShortMonth('2026-11', 'es'), 'nov 2026');
  assert.equal(formatShortMonth('2026-11', 'en'), 'Nov 2026');
  assert.equal(formatMonth('2026-11', 'es'), 'noviembre de 2026');
  assert.equal(formatMonth('2026-11', 'en'), 'November 2026');
});

test('numbers: Spanish groups from five digits with a dot, English with a comma', () => {
  assert.equal(formatNumber(1000, 'es'), '1000');
  assert.equal(formatNumber(14400, 'es'), '14.400');
  assert.equal(formatNumber(1000000, 'es'), '1.000.000');
  assert.equal(formatNumber(14400, 'en'), '14,400');
});

test('the build writes English only unless a locale is asked for', () => {
  assert.deepEqual(buildLocales([], {}), []);
  assert.deepEqual(buildLocales(['--locales=es'], {}), ['es']);
  assert.deepEqual(buildLocales(['--locale', 'es'], {}), ['es']);
  assert.deepEqual(buildLocales([], { BUILD_LOCALES: 'en,es' }), ['es']);
  assert.throws(() => buildLocales(['--locales=fr'], {}), /unknown locale "fr"/);
});

test('hreflang: one link per locale plus x-default (English); nothing for a page in one language', () => {
  const out = hreflangLinks({ en: 'https://x/p/a', es: 'https://x/es/p/a' });
  assert.equal(out, '<link rel="alternate" hreflang="en" href="https://x/p/a">\n<link rel="alternate" hreflang="es" href="https://x/es/p/a">\n<link rel="alternate" hreflang="x-default" href="https://x/p/a">\n');
  assert.equal(hreflangLinks({ en: 'https://x/' }), '');
});

test('the localized sitemap lists the locale URL and every alternate', () => {
  const xml = localizedSitemapXml([{ urls: { en: 'https://x/', es: 'https://x/es/' }, lastmod: '2026-11-24' }], 'es');
  assert.match(xml, /xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml"/);
  assert.match(xml, /<loc>https:\/\/x\/es\/<\/loc>/);
  assert.match(xml, /hreflang="en" href="https:\/\/x\/"/);
  assert.match(xml, /hreflang="x-default" href="https:\/\/x\/"/);
});

// ---------- the Spanish pages ----------
const L = createI18n('es');
const P = {
  slug: 'acme', name: 'Acme <AI>', category: 'ongoing', free_type: 'renewing-quota', verified: true, last_verified: '2026-11-24', added: '2026-01-05',
  free_tier: 'Free tier with 1,000 requests per day', notes: 'Limits apply per organization.', best_for: 'Fast prototyping',
  card_required: false, phone_required: null, commercial_ok: 'conditional', commercial_ok_condition: 'Non-commercial on the free plan',
  docs_url: 'https://docs.acme.example/start', keys_url: 'https://acme.example/keys', openai_base_url: 'https://api.acme.example/v1',
  modalities: ['text'], models_free: ['acme-small'],
  free_limits: { requests_per_day: 14400, tokens_per_day: 1000, scope: 'per model', source: 'https://docs.acme.example/limits', checked: '2026-11-20' },
};
const QUOTE = 'You get 14,400 requests per day on the free tier.';
const page = providerEsMain(P, { L, prefixes: { root: '../../', home: '../' }, receipt: { q: QUOTE, u: 'https://docs.acme.example/limits', readOn: '2026-11-20' }, model: 'acme-small', enHref: '../../p/acme' });

test('translation rule: a quote is printed verbatim, in English, marked lang="en"', () => {
  assert.ok(page.includes(`<blockquote class="prov-receipt" lang="en"><p>“${QUOTE}”</p>`), 'the quote, byte for byte');
  assert.match(page, /<cite lang="es">De <a href="https:\/\/docs\.acme\.example\/limits"[^>]*>docs\.acme\.example\/limits<\/a> · leído el <time datetime="2026-11-20">20 nov 2026<\/time><\/cite>/);
});

test('dataset prose stays as recorded and says it is English; interface text is Spanish', () => {
  for (const field of ['free_tier', 'notes', 'best_for', 'commercial_ok_condition']) {
    assert.match(page, new RegExp(`lang="en">${P[field].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}<`), field);
  }
  assert.match(page, /<h2 id="whats-free">Qué es gratis<\/h2>/);
  assert.match(page, /<h2 id="limits">Límites gratuitos<\/h2>/);
  assert.match(page, /Cuota gratuita que se renueva/);
  assert.match(page, /Añadido al hub<\/span><span class="meta-v"><time datetime="2026-01-05">5 ene 2026<\/time>/);
});

test('data-built sentences are translated and a missing value reads "no indicado"', () => {
  assert.equal(stripP(answerFirstL(P, L)), 'Sí: Acme &lt;AI&gt; tiene un nivel gratuito permanente. Tarjeta de crédito: no obligatoria. Verificación por teléfono: no indicado. Uso comercial: permitido con condiciones.');
  assert.equal(flagWordsL('card_required', undefined, L), 'no indicado');
  assert.equal(flagWordsL('commercial_ok', false, L), 'solo evaluación');
  assert.match(page, /<span class="tri tri-unk">no indicado<\/span>/);
});

test('limits use Spanish units and digits, with their source and day', () => {
  const html = limitsL(P, L);
  assert.match(html, /<th scope="row">peticiones por día<\/th><td>14\.400<\/td>/);
  assert.match(html, /<th scope="row">tokens por día<\/th><td>1000<\/td>/);
  assert.match(html, /leída el <time datetime="2026-11-20">20 nov 2026<\/time>/);
  assert.match(limitsL({ ...P, free_limits: null }, L), /no indicados de forma estructurada/);
});

test('code is never translated: the quickstart is the English page\'s, byte for byte', () => {
  assert.ok(page.includes(`<pre><code>${escapeText(pythonChatQuickstart(P.openai_base_url, 'acme-small'))}</code></pre>`));
  assert.match(page, /<h2 id="quickstart">Inicio rápido: chat completions<\/h2>/);
});

test('the Spanish home lists every provider, linking to its Spanish page', () => {
  const html = homeEsMain({ providers: [P, { ...P, slug: 'beta', name: 'Beta', category: 'trial', verified: false, free_tier: '' }], asOf: '2026-11-27', L, slaDays: 90, prefixes: { root: '../', home: '' } });
  assert.match(html, /<a href="p\/acme">Acme &lt;AI&gt;<\/a>/);
  assert.match(html, /<a href="p\/beta">Beta<\/a><\/td><td><span class="type">Prueba<\/span><\/td><td><span class="tri tri-unk">no indicado<\/span><\/td><td>sin verificar<\/td>/);
  assert.match(html, /<strong>2<\/strong> proveedores seguidos/);
  assert.match(html, /Revisado en los últimos 3 días/);
  assert.match(html, /<h1>Leemos la documentación\. <span class="h1-key">Tú publicas el código\.<\/span><\/h1>/);
});

test('docs/i18n.md states the rules the code follows', () => {
  const doc = readFileSync(join(ROOT, 'docs/i18n.md'), 'utf8');
  assert.match(doc, /"not stated" → "no indicado"/);
  assert.match(doc, /never translated/i);
  assert.match(doc, /npm run build:es/);
});

function stripP(html) { return html.replace(/^<p[^>]*>|<\/p>$/g, ''); }
