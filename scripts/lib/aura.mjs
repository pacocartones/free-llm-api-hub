// aura.mjs — the generative identity of brand H1 ("Fingerprint"): every provider gets an aura drawn from its own data.
// Shape: the Cálida variant's radial bars (docs/brand.md), 40 bars in a fan around the centre.
//
//   sectors   the bars are split into contiguous sectors, one per modality the provider serves, in the hue of that
//             modality (--h-* in styles.css) and in a fixed order (AURA_ORDER);
//   seed      the rotation of the fan and the length of every bar come from the provider's slug, so each aura is its
//             own and stays the same from build to build;
//   ongoing   the bars grow from the centre (a sun) when the free tier keeps going; a trial has only an outer crown;
//   dashed    a dashed outer circle (in --unk) when at least one of the four production flags (lib/flags.mjs) is not
//             stated: the docs leave something unsaid, and the aura says so;
//   faded     desaturated when the last check is more than AURA_OLD_DAYS old (or the entry is unverified).
//
// Every number of the shape is in AURA_GEOMETRY, so a later variant changes parameters, not code. Two renderings of
// one geometry: auraHtml() for the web (inline SVG whose colours are the --h-* tokens, so both themes share it) and
// auraSvg() for the social images, the logo and the README banner (hex colours of one theme, no CSS).
// Deterministic: the same record and the same reference date give the same aura. The build passes ASOF (derived from
// the data, never the clock); the browser repaint passes its own clock, like the freshness colour of the row.
//
// Like flags.mjs, auraSpec, auraRng, auraPaths and auraHtml are shipped to the browser as source text
// (rows.clientBundle), so keep them self-contained: they may only use htmlEsc, the flag helpers and the constants below.

import { escapeHtml as htmlEsc } from './html.mjs'; // the name these functions use when serialised
import { FLAG_DEFS, flagValue, flagState } from './flags.mjs';

/** The modalities in the order their sectors are drawn, clockwise from the seeded start. Every schema modality is here. */
export const AURA_ORDER = ['text', 'vision', 'image', 'audio', 'embeddings', 'rerank', 'ocr'];

/** The graphic hue of each modality per theme: the same values as --h-* in site/styles.css (a test keeps them equal). */
export const AURA_HUES = {
  light: { text: '#d9502a', vision: '#c48200', image: '#d85a85', audio: '#c2185b', embeddings: '#8e7a00', rerank: '#7b2d6b', ocr: '#8b3a2e' },
  dark: { text: '#ff7a4d', vision: '#f5b21f', image: '#ff9cbc', audio: '#ff5c93', embeddings: '#c9b02e', rerank: '#c77ab8', ocr: '#d97a62' },
};

/** The colour of the dashed circle: --unk in each theme (the web uses the token). */
export const AURA_DASH = { light: '#7f5a00', dark: '#f2c14e' };

/** Older than this many days since the last check, the aura fades. */
export const AURA_OLD_DAYS = 30;

/**
 * The radial-bar geometry, in a 100-unit box centred on (50, 50) (brand-drafts/08-variantes-h1.md, "H1-e · Cálida"):
 *   bars     how many bars in the fan
 *   minLen   the shortest bar, as a fraction of the sector's full length (the seed picks minLen…1)
 *   ongoing  bars from radius r0, up to len long, stroke width (a sun)
 *   trial    the same for a trial (an outer crown only)
 *   dash     the dashed circle for flags not stated: radius, stroke width, dash pattern
 *   faded    the saturation of an aura last checked over AURA_OLD_DAYS ago
 */
export const AURA_GEOMETRY = {
  bars: 40,
  minLen: 0.45,
  ongoing: { r0: 9, len: 37, width: 3.3 },
  trial: { r0: 27, len: 18, width: 3 },
  dash: { r: 48.4, width: 2.2, array: '4 3' },
  faded: 0.2,
};

export const AURA_NAMES = { text: 'text', vision: 'vision', image: 'image', audio: 'speech', embeddings: 'embeddings', rerank: 'rerank', ocr: 'OCR' };

/** A small deterministic random generator seeded from a string (the slug): the same seed gives the same sequence. */
export function auraRng(seed) {
  const str = String(seed || '');
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/**
 * The aura of one record. `now` is the reference date ('YYYY-MM-DD', a Date or ms); without it, the aura is never faded.
 * @returns {{seed: string, modalities: string[], ongoing: boolean, unknown: number, old: boolean, label: string}}
 */
export function auraSpec(p, opts) {
  const o = opts || {};
  const listed = Array.isArray(p && p.modalities) ? p.modalities : [];
  let modalities = AURA_ORDER.filter((m) => listed.indexOf(m) !== -1);
  if (!modalities.length) modalities = ['text'];
  const ongoing = !!p && p.category === 'ongoing';
  let unknown = 0;
  for (const d of FLAG_DEFS) if (flagState(d, flagValue(d, p)) === 'unk') unknown++;
  let old = false;
  if (o.now != null) {
    const nowMs = typeof o.now === 'string' ? Date.parse(o.now + 'T00:00:00Z') : o.now instanceof Date ? o.now.getTime() : Number(o.now);
    const t = p && p.verified && p.last_verified ? Date.parse(p.last_verified + 'T00:00:00Z') : NaN;
    old = Number.isNaN(t) || (nowMs - t) / 86400000 > AURA_OLD_DAYS;
  }
  const names = modalities.map((m) => AURA_NAMES[m] || m);
  const label = names.join(', ') + ' · ' + (ongoing ? 'ongoing free tier (rays from the centre)' : 'trial credit (outer crown only)') +
    (unknown ? ' · ' + unknown + ' of 4 flags not stated (dashed circle)' : '') + (old ? ' · last checked over ' + AURA_OLD_DAYS + ' days ago (faded)' : '');
  return { seed: String((p && (p.slug || p.name)) || ''), modalities, ongoing, unknown, old, label };
}

/**
 * The bars of a spec as SVG path data, one path per modality sector: [[modality, d], …], in the 100-unit box.
 * `digits` is the number of decimals kept (0 for small auras, 1 for large ones). A spec may override the number of
 * bars (`bars`) and the shortest bar (`minLen`), as the favicon does.
 */
export function auraPaths(spec, digits) {
  const G = AURA_GEOMETRY;
  const shape = spec.ongoing ? G.ongoing : G.trial;
  const n = spec.modalities.length;
  const N = spec.bars || G.bars;
  const minLen = spec.minLen == null ? G.minLen : spec.minLen;
  const k = Math.pow(10, digits || 0);
  const f = (x) => String(Math.round(x * k) / k);
  const rnd = auraRng(spec.seed);
  const rot = rnd() * Math.PI * 2;
  const out = [];
  for (let i = 0; i < N; i++) {
    const m = spec.modalities[Math.floor((i * n) / N)];
    const a = (i / N) * Math.PI * 2 + rot;
    const len = shape.len * (minLen + rnd() * (1 - minLen));
    const c = Math.cos(a), s = Math.sin(a);
    const seg = 'M' + f(50 + shape.r0 * c) + ' ' + f(50 + shape.r0 * s) + 'L' + f(50 + (shape.r0 + len) * c) + ' ' + f(50 + (shape.r0 + len) * s);
    if (out.length && out[out.length - 1][0] === m) out[out.length - 1][1] += seg; else out.push([m, seg]);
  }
  return out;
}

/**
 * One aura as HTML: a <span class="aura"> holding an inline SVG, sized by its CSS context. Decorative by default
 * (aria-hidden, the label in a title); opts.img makes it an image with the label as its accessible name; opts.cls adds
 * classes (a size); opts.digits keeps decimals for a large aura.
 */
export function auraHtml(p, opts) {
  const o = opts || {};
  const s = auraSpec(p, o);
  const G = AURA_GEOMETRY;
  const cls = 'aura' + (s.ongoing ? '' : ' aura-trial') + (s.unknown ? ' aura-dash' : '') + (s.old ? ' aura-old' : '') + (o.cls ? ' ' + o.cls : '');
  const label = htmlEsc((p && p.name ? p.name + ': ' : '') + s.label);
  const a11y = o.img ? ' role="img" aria-label="' + label + '"' : ' aria-hidden="true" title="' + label + '"';
  const bars = auraPaths(s, o.digits).map((x) => '<path class="h-' + x[0] + '" d="' + x[1] + '"/>').join('');
  const edge = s.unknown ? '<circle class="aura-edge" cx="50" cy="50" r="' + G.dash.r + '" stroke-width="' + G.dash.width + '" stroke-dasharray="' + G.dash.array + '"/>' : '';
  return '<span class="' + cls + '"' + a11y + '><svg viewBox="0 0 100 100" focusable="false"><g stroke-width="' +
    (s.ongoing ? G.ongoing.width : G.trial.width) + '">' + bars + '</g>' + edge + '</svg></span>';
}

const r2 = (x) => Math.round(x * 100) / 100;

/**
 * The same aura as SVG markup (a <g>), for the social images, the logo and the banner, with the hex colours of one theme.
 *   o.cx, o.cy, o.r  centre and radius (the 100-unit box is scaled to 2r)
 *   o.theme          'light' (default) or 'dark': which hues and dashed-circle colour to use; 'css' paints with the
 *                    --h-* and --unk tokens instead (the #logo sprite symbol, which follows the page's theme)
 *   o.dash           the dashed circle colour (default: --unk of the theme)
 *   o.id             a prefix for the filter id, unique within one SVG document
 */
export function auraSvg(spec, opts) {
  const o = opts || {};
  const cx = o.cx || 0, cy = o.cy || 0, r = o.r || 50, id = o.id || 'a';
  const css = o.theme === 'css';
  const theme = o.theme === 'dark' ? 'dark' : 'light';
  const hues = AURA_HUES[theme];
  const paint = (m) => (css ? ' style="stroke:var(--h-' + m + ')"' : ' stroke="' + hues[m] + '"');
  const G = AURA_GEOMETRY;
  const width = spec.width || (spec.ongoing ? G.ongoing.width : G.trial.width);
  let defs = '';
  let filter = '';
  if (spec.old) {
    defs = '<defs><filter id="' + id + '-old"><feColorMatrix type="saturate" values="' + G.faded + '"/></filter></defs>';
    filter = ' filter="url(#' + id + '-old)"';
  }
  const bars = auraPaths(spec, 1).map((x) => '<path d="' + x[1] + '"' + paint(x[0]) + '/>').join('');
  const edge = spec.unknown
    ? '<circle cx="50" cy="50" r="' + G.dash.r + '" fill="none"' + (css && !o.dash ? ' style="stroke:var(--unk)"' : ' stroke="' + (o.dash || AURA_DASH[theme]) + '"') + ' stroke-width="' + G.dash.width + '" stroke-dasharray="' + G.dash.array + '"/>'
    : '';
  return defs + '<g transform="translate(' + r2(cx - r) + ' ' + r2(cy - r) + ') scale(' + Math.round((r / 50) * 1000) / 1000 + ')">' +
    '<g' + filter + ' fill="none" stroke-linecap="round" stroke-width="' + width + '">' + bars + '</g>' + edge + '</g>';
}

/** The hub's own aura (the logo): six modalities, rays from the centre, nothing unsaid. */
export const HUB_AURA = Object.freeze({ seed: 'free-llm-api-hub', modalities: ['text', 'vision', 'image', 'audio', 'embeddings', 'ocr'], ongoing: true, unknown: 0, old: false, label: 'Free LLM API Hub' });
/** The favicon's aura: four sectors and fewer, thicker, longer bars, so it reads at 16 px. */
export const FAVICON_AURA = Object.freeze({ seed: 'free-llm-api-hub', modalities: ['text', 'vision', 'image', 'audio'], ongoing: true, unknown: 0, old: false, bars: 12, minLen: 0.8, width: 8, label: 'Free LLM API Hub' });
