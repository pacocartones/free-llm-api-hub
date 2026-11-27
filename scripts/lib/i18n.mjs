// i18n.mjs — the string catalogues of the site and the helpers that read them (docs/i18n.md).
//
// One catalogue per locale, i18n/<locale>.json, flat keys ("nav.models"). English is the source: every key exists in
// en.json, and a locale may only translate keys that exist there (scripts/i18n.test.mjs checks both ways).
//
//   t(key, params)       HTML. A plain value is escaped (escapeAttr, the build's own escaper, so English stays
//                        byte-identical); a key ending in `_html` is trusted markup written in the catalogue. Params are
//                        always escaped, so a provider name from the data can never inject markup.
//   text(key, params)    Plain text, not escaped: for <title>, meta descriptions and other places the caller escapes.
//   Plurals              A value may be { one, other, ... } (Intl.PluralRules categories); params.count picks the form.
//   date(iso)            The human date: "24 Nov 2026" (en, the same function the site already uses) or "24 nov 2026" (es).
//   time(iso)            The same inside <time datetime="2026-11-24">.
//   number(n)            Locale digits: 14,400 (en) / 14.400 (es). Four-digit numbers are not grouped in Spanish (1000).
//
// What is never translated (docs/i18n.md): quotes from a provider's page (they are evidence, kept verbatim and marked
// with their own lang), free text fields of the dataset (free_tier, notes, rate_limits, best_for: there is one dataset,
// in English), model IDs, URLs and code.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { escapeAttr } from './html.mjs';
import { humanDate, DATE_RE } from './dates.mjs';

const I18N_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../i18n');

/** The locale the site is written in, and the ones the build can add under /<locale>/. */
export const DEFAULT_LOCALE = 'en';
export const LOCALES = ['en', 'es'];

/** Spanish short months as the Real Academia abbreviates them, lower case and without the stop in running text. */
const ES_MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
const ES_MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const cache = new Map();

/** The catalogue of a locale, parsed once. */
export function loadCatalog(locale, dir = I18N_DIR) {
  const key = `${dir}\0${locale}`;
  if (!cache.has(key)) cache.set(key, JSON.parse(readFileSync(join(dir, `${locale}.json`), 'utf8')));
  return cache.get(key);
}

/** The keys of a catalogue that are strings to translate (everything but _meta). */
export const catalogKeys = (catalog) => Object.keys(catalog).filter((k) => k !== '_meta');

/** "{name}" placeholders of a value (both plural forms for a plural value), sorted, for the parity test. */
export function placeholders(value) {
  const forms = value && typeof value === 'object' ? Object.values(value) : [value];
  return [...new Set(forms.flatMap((f) => [...String(f).matchAll(/\{(\w+)\}/g)].map((m) => m[1])))].sort();
}

/** "2026-11-24" → "24 nov 2026" (es) / "24 Nov 2026" (en). Anything that is not an ISO day → null. */
export function formatDate(iso, locale = DEFAULT_LOCALE, withYear = true) {
  if (locale === 'en') return humanDate(iso, withYear);
  const m = DATE_RE.test(String(iso ?? '')) ? String(iso).split('-').map(Number) : null;
  if (!m || m[1] < 1 || m[1] > 12) return null;
  if (locale === 'es') return `${m[2]} ${ES_MONTHS[m[1] - 1]}${withYear === false ? '' : ` ${m[0]}`}`;
  throw new Error(`formatDate: no date format for locale ${locale}`);
}

/** "2026-11" → "nov 2026" (es) / "Nov 2026" (en), for page titles. */
export function formatShortMonth(month, locale = DEFAULT_LOCALE) {
  const d = formatDate(`${String(month).slice(0, 7)}-01`, locale);
  return d ? d.replace(/^1 /, '') : null;
}

/** "2026-11" → "noviembre de 2026" (es) / "November 2026" (en). */
export function formatMonth(month, locale = DEFAULT_LOCALE) {
  const [y, m] = String(month).split('-').map(Number);
  if (!y || !(m >= 1 && m <= 12)) return null;
  if (locale === 'es') return `${ES_MONTH_NAMES[m - 1]} de ${y}`;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

const numberFormats = new Map();
/** A number written the locale's way. Integers only in the site today; Intl does the grouping. */
export function formatNumber(n, locale = DEFAULT_LOCALE) {
  const tag = locale === 'es' ? 'es-ES' : 'en-US';
  if (!numberFormats.has(tag)) numberFormats.set(tag, new Intl.NumberFormat(tag));
  return numberFormats.get(tag).format(n);
}

/**
 * The translator of one locale. A key missing from the locale falls back to English and is recorded in `missing`
 * (the Spanish build lists them, docs/i18n.md); a key missing from English too is a bug and throws.
 */
export function createI18n(locale = DEFAULT_LOCALE, { dir = I18N_DIR } = {}) {
  const catalog = loadCatalog(locale, dir);
  const source = locale === DEFAULT_LOCALE ? catalog : loadCatalog(DEFAULT_LOCALE, dir);
  const plural = new Intl.PluralRules(locale);
  const missing = new Set();

  const lookup = (key) => {
    if (Object.hasOwn(catalog, key) && key !== '_meta') return catalog[key];
    if (Object.hasOwn(source, key) && key !== '_meta') { missing.add(key); return source[key]; }
    throw new Error(`i18n: unknown key "${key}" (add it to i18n/${DEFAULT_LOCALE}.json first)`);
  };
  const pick = (key, value, params) => {
    if (value === null || typeof value !== 'object') return String(value);
    if (!Number.isFinite(params.count)) throw new Error(`i18n: "${key}" is a plural and needs a numeric count`);
    const form = plural.select(params.count);
    return value[form] ?? value.other;
  };
  const fill = (str, params, escape) => str.replace(/\{(\w+)\}/g, (m, name) => {
    if (!Object.hasOwn(params, name)) throw new Error(`i18n: missing param "${name}"`);
    const v = name === 'count' && typeof params.count === 'number' ? formatNumber(params.count, locale) : params[name];
    return escape(v);
  });

  /** HTML (see the header). */
  const t = (key, params = {}) => {
    const value = pick(key, lookup(key), params);
    if (key.endsWith('_html')) return fill(value, params, escapeAttr);
    return fill(escapeAttr(value), params, escapeAttr);
  };
  /** Plain text: nothing escaped. Not for `_html` keys. */
  const text = (key, params = {}) => {
    if (key.endsWith('_html')) throw new Error(`i18n: "${key}" is HTML; use t()`);
    return fill(pick(key, lookup(key), params), params, (v) => String(v ?? ''));
  };
  /** t() for a value that already is HTML (a <time>, a link): the param is inserted as it is. Use sparingly. */
  const tHtml = (key, params = {}, rawParams = []) => {
    const raw = new Set(rawParams);
    const value = pick(key, lookup(key), params);
    const base = key.endsWith('_html') ? value : escapeAttr(value);
    return base.replace(/\{(\w+)\}/g, (m, name) => {
      if (!Object.hasOwn(params, name)) throw new Error(`i18n: missing param "${name}"`);
      const v = name === 'count' && typeof params.count === 'number' ? formatNumber(params.count, locale) : params[name];
      return raw.has(name) ? String(v) : escapeAttr(v);
    });
  };

  return {
    locale,
    htmlLang: catalog._meta?.htmlLang || locale,
    ogLocale: catalog._meta?.ogLocale || '',
    t,
    text,
    tHtml,
    has: (key) => Object.hasOwn(catalog, key),
    date: (iso, withYear) => formatDate(iso, locale, withYear),
    time: (iso) => {
      const h = formatDate(iso, locale);
      return h ? `<time datetime="${iso}">${h}</time>` : escapeAttr(String(iso ?? ''));
    },
    shortMonth: (month) => formatShortMonth(month, locale),
    month: (month) => formatMonth(month, locale),
    number: (n) => formatNumber(n, locale),
    missing,
  };
}

/**
 * The locales the build writes, from argv (`--locales=es` or `--locale es`) or BUILD_LOCALES ("es"). English is
 * always built and always at the root; the default is English only, so `npm run build` writes what it always wrote.
 */
export function buildLocales(argv = process.argv.slice(2), env = process.env) {
  let raw = env.BUILD_LOCALES || '';
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--locales=')) raw = a.slice('--locales='.length);
    else if (a === '--locales' || a === '--locale') raw = argv[i + 1] || '';
    else if (a.startsWith('--locale=')) raw = a.slice('--locale='.length);
  }
  const list = raw.split(',').map((s) => s.trim()).filter(Boolean);
  for (const l of list) if (!LOCALES.includes(l)) throw new Error(`unknown locale "${l}" (known: ${LOCALES.join(', ')})`);
  return [...new Set(list.filter((l) => l !== DEFAULT_LOCALE))];
}

/** The path prefix of a locale's pages: '' for English, 'es/' for Spanish. */
export const localeDir = (locale) => (locale === DEFAULT_LOCALE ? '' : `${locale}/`);

/**
 * The <link rel="alternate" hreflang> set of a page that exists in several locales, one per locale plus x-default
 * (the English page). `urls` maps locale → absolute URL. Same set, same order, on every version of the page.
 */
export function hreflangLinks(urls) {
  const entries = Object.entries(urls);
  if (entries.length < 2) return '';
  const lines = entries.map(([l, u]) => `<link rel="alternate" hreflang="${l}" href="${escapeAttr(u)}">`);
  if (urls[DEFAULT_LOCALE]) lines.push(`<link rel="alternate" hreflang="x-default" href="${escapeAttr(urls[DEFAULT_LOCALE])}">`);
  return lines.join('\n') + '\n';
}

/**
 * A locale's sitemap with its alternates (xhtml:link, the sitemap form of hreflang). `entries` is [{ urls, lastmod }],
 * urls mapping locale → absolute URL; the <loc> of each entry is its `locale` URL.
 */
export function localizedSitemapXml(entries, locale) {
  const alt = (urls) => Object.entries(urls).map(([l, u]) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${escapeAttr(u)}"/>`)
    .concat(urls[DEFAULT_LOCALE] ? [`    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeAttr(urls[DEFAULT_LOCALE])}"/>`] : []);
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
    entries.map((e) => [`  <url>`, `    <loc>${escapeAttr(e.urls[locale])}</loc>`, `    <lastmod>${e.lastmod}</lastmod>`, ...alt(e.urls), `  </url>`].join('\n')).join('\n') +
    `\n</urlset>\n`;
}
