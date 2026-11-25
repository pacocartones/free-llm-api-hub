// aura.mjs — the generative identity of brand H1 ("Fingerprint"): every provider gets an aura drawn from its own data.
//
//   sectors   one per modality the provider serves, in the hue of that modality (--h-* in styles.css), in a fixed
//             order (AURA_ORDER), so a hue always sits in the same place and two auras compare at a glance;
//   disc/ring a full disc when the free tier is ongoing, a ring (a hole of AURA_HOLE of the radius) when it is a trial;
//   dashed    a dashed edge when at least one of the four production flags (lib/flags.mjs) is unknown: the docs leave
//             something unsaid, and the aura says so;
//   faded     desaturated when the last check is more than AURA_OLD_DAYS old (or the entry is unverified).
//
// Two renderings of the same spec: auraHtml() for the web (a CSS conic gradient, a mask for the ring) and auraSvg()
// for the social images, the logo and the README banner (SVG has no conic gradient, so the sectors are arcs).
// Deterministic: the same record and the same reference date give the same aura. The build passes ASOF (derived from
// the data, never the clock); the browser repaint passes its own clock, like the freshness colour of the row.
//
// Like flags.mjs, these functions are shipped to the browser as source text (rows.clientBundle), so keep them
// self-contained: they may only use htmlEsc, the flag helpers and the constants below.

import { htmlEsc } from './rows.mjs';
import { FLAG_DEFS, flagValue, flagState } from './flags.mjs';

/** The modalities in the order their sectors are drawn, clockwise from the start angle. Every schema modality is here. */
export const AURA_ORDER = ['text', 'vision', 'image', 'audio', 'embeddings', 'rerank', 'ocr'];

/** The graphic hue of each modality. The same values as --h-* in site/styles.css (a test keeps them equal). */
export const AURA_HUES = {
  text: '#7c5cff', vision: '#00c2e0', image: '#ff4f8b', audio: '#ffa31a', embeddings: '#2bc48a', rerank: '#4c8dff', ocr: '#ff7a3d',
};

/** Where the first sector starts, in degrees clockwise from the top (as CSS conic-gradient counts). */
export const AURA_START = 210;
/** The radius of a trial's hole, as a fraction of the aura's radius. */
export const AURA_HOLE = 0.52;
/** Older than this many days since the last check, the aura fades. */
export const AURA_OLD_DAYS = 30;
/** The colour of the dashed edge: --unk in each theme (the light value; the web uses the token). */
export const AURA_DASH = { light: '#8a5700', dark: '#f0ba4e' };

export const AURA_NAMES = { text: 'text', vision: 'vision', image: 'image', audio: 'speech', embeddings: 'embeddings', rerank: 'rerank', ocr: 'OCR' };

/**
 * The aura of one record. `now` is the reference date ('YYYY-MM-DD', a Date or ms); without it, the aura is never faded.
 * @returns {{modalities: string[], ongoing: boolean, unknown: number, old: boolean, label: string}}
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
  const label = names.join(', ') + ' · ' + (ongoing ? 'ongoing free tier (full disc)' : 'trial credit (ring)') +
    (unknown ? ' · ' + unknown + ' of 4 flags not stated (dashed edge)' : '') + (old ? ' · last checked over ' + AURA_OLD_DAYS + ' days ago (faded)' : '');
  return { modalities, ongoing, unknown, old, label };
}

/** The CSS conic gradient of a spec, reading the --h-* tokens so both themes share one definition. */
export function auraGradient(spec) {
  const n = spec.modalities.length;
  const stops = spec.modalities.map((m, i) => {
    const a = Math.round((i * 10000) / n) / 100;
    const b = Math.round(((i + 1) * 10000) / n) / 100;
    return 'var(--h-' + m + ') ' + a + '% ' + b + '%';
  });
  return 'conic-gradient(from ' + AURA_START + 'deg, ' + stops.join(', ') + ')';
}

/**
 * One aura as HTML: a <span class="aura"> sized by its CSS context. Decorative by default (aria-hidden, the label in a
 * title); opts.img makes it an image with the label as its accessible name; opts.cls adds classes (a size).
 */
export function auraHtml(p, opts) {
  const o = opts || {};
  const s = auraSpec(p, o);
  const cls = 'aura' + (s.ongoing ? '' : ' aura-ring') + (s.unknown ? ' aura-dash' : '') + (s.old ? ' aura-old' : '') + (o.cls ? ' ' + o.cls : '');
  const label = htmlEsc((p && p.name ? p.name + ': ' : '') + s.label);
  const a11y = o.img ? ' role="img" aria-label="' + label + '"' : ' aria-hidden="true" title="' + label + '"';
  return '<span class="' + cls + '" style="--aura:' + auraGradient(s) + '"' + a11y + '></span>';
}

const r2 = (x) => Math.round(x * 100) / 100;
const pt = (cx, cy, r, deg) => {
  const t = (deg * Math.PI) / 180;
  return r2(cx + r * Math.sin(t)) + ' ' + r2(cy - r * Math.cos(t));
};

/**
 * The same aura as SVG markup (a <g>), for the social images, the logo and the banner. Sectors are arc paths; a ring
 * is a hole filled with `ground`; the dashed edge is a circle just outside; a faded aura goes through a saturate filter.
 *   o.cx, o.cy, o.r  centre and radius
 *   o.ground         the colour behind the aura (the ring's hole)
 *   o.dash           the dashed edge colour (default: the light --unk)
 *   o.id             a prefix for the gradient and filter ids, unique within one SVG document
 *   o.shine          false to drop the soft highlight
 */
export function auraSvg(spec, opts) {
  const o = opts || {};
  const cx = o.cx || 0, cy = o.cy || 0, r = o.r || 50, id = o.id || 'a';
  const n = spec.modalities.length;
  let body = '';
  if (n === 1) {
    body += '<circle cx="' + r2(cx) + '" cy="' + r2(cy) + '" r="' + r2(r) + '" fill="' + AURA_HUES[spec.modalities[0]] + '"/>';
  } else {
    for (let i = 0; i < n; i++) {
      const a = AURA_START + (360 * i) / n, b = AURA_START + (360 * (i + 1)) / n;
      body += '<path d="M' + r2(cx) + ' ' + r2(cy) + 'L' + pt(cx, cy, r, a) + 'A' + r2(r) + ' ' + r2(r) + ' 0 ' + (b - a > 180 ? 1 : 0) + ' 1 ' + pt(cx, cy, r, b) + 'Z" fill="' + AURA_HUES[spec.modalities[i]] + '"/>';
    }
  }
  let defs = '';
  if (o.shine !== false) {
    defs += '<radialGradient id="' + id + '-sh" cx="35%" cy="30%" r="45%"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>';
    body += '<circle cx="' + r2(cx) + '" cy="' + r2(cy) + '" r="' + r2(r) + '" fill="url(#' + id + '-sh)"/>';
  }
  if (!spec.ongoing) body += '<circle cx="' + r2(cx) + '" cy="' + r2(cy) + '" r="' + r2(r * AURA_HOLE) + '" fill="' + (o.ground || '#ffffff') + '"/>';
  let filter = '';
  if (spec.old) {
    defs += '<filter id="' + id + '-old"><feColorMatrix type="saturate" values=".25"/></filter>';
    filter = ' filter="url(#' + id + '-old)"';
  }
  let edge = '';
  if (spec.unknown) {
    const w = Math.max(1, r2(r * 0.06));
    edge = '<circle cx="' + r2(cx) + '" cy="' + r2(cy) + '" r="' + r2(r + w * 1.6) + '" fill="none" stroke="' + (o.dash || AURA_DASH.light) + '" stroke-width="' + w + '" stroke-dasharray="' + r2(w * 2.2) + ' ' + r2(w * 1.6) + '"/>';
  }
  return (defs ? '<defs>' + defs + '</defs>' : '') + '<g' + filter + '>' + body + '</g>' + edge;
}

/** The hub's own aura (the logo): six modalities, a full disc, nothing unsaid. */
export const HUB_AURA = Object.freeze({ modalities: ['text', 'vision', 'image', 'audio', 'embeddings', 'ocr'], ongoing: true, unknown: 0, old: false, label: 'Free LLM API Hub' });
/** The favicon's aura: four sectors, legible at 16 px. */
export const FAVICON_AURA = Object.freeze({ modalities: ['text', 'vision', 'image', 'audio'], ongoing: true, unknown: 0, old: false, label: 'Free LLM API Hub' });
