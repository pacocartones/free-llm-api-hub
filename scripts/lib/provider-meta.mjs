// provider-meta.mjs — the meta description of a provider page (/p/<slug>), Q11 of the 2026-11-25 audit.
//
// A search result is where a developer decides whether to click, and the numbers are what they search for. When the
// provider publishes numeric free limits (free_limits, each with its source and the day it was read), the description
// leads with them: "Groq free tier: 30 RPM, 1,000 RPD, 200K TPD, no card. Verified 24 Nov 2026 with source."
// Otherwise it keeps the previous text ("<name>: <free_tier>"), now cut at a word boundary instead of mid-word.
// Only recorded values are used: an unknown card requirement says nothing rather than "no card".

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const META_MAX = 160;

/** "2026-11-24" → "24 Nov 2026"; anything else → null. */
export function shortDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return null;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

/** 1000 → "1,000", 14400 → "14.4K", 200000 → "200K", 1500000 → "1.5M": exact below 10,000, compact above. */
export function compactNumber(n) {
  if (!Number.isInteger(n) || n < 0) return null;
  if (n < 10000) return n.toLocaleString('en-US');
  const [div, unit] = n >= 1e6 ? [1e6, 'M'] : [1e3, 'K'];
  const v = n / div;
  return `${Number.isInteger(v) ? v : Number(v.toFixed(1))}${unit}`;
}

// The free_limits fields, in the order a description lists them, with their unit.
const LIMIT_UNITS = [
  ['requests_per_second', (v) => `${v} RPS`],
  ['requests_per_minute', (v) => `${v} RPM`],
  ['requests_per_day', (v) => `${v} RPD`],
  ['requests_per_month', (v) => `${v} requests/month`],
  ['tokens_per_day', (v) => `${v} TPD`],
  ['tokens_per_month', (v) => `${v} tokens/month`],
];

/** The limit figures of a free_limits object, e.g. ["30 RPM", "1,000 RPD", "200K TPD"]. */
export function limitFigures(fl) {
  if (!fl || typeof fl !== 'object') return [];
  return LIMIT_UNITS.filter(([k]) => Number.isInteger(fl[k])).map(([k, unit]) => unit(compactNumber(fl[k])));
}

/** `text` cut to at most `max` characters at a word boundary, with an ellipsis when it was cut. */
export function trimAtWord(text, max = META_MAX) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.–—-]+$/, '')}…`;
}

/** The meta description of a provider page. */
export function providerMetaDescription(p) {
  const figures = limitFigures(p.free_limits);
  if (!figures.length) return trimAtWord(`${p.name}: ${p.free_tier}`);
  const card = p.card_required === false ? ['no card'] : p.card_required === true ? ['card required'] : [];
  const when = p.verified === true && shortDate(p.last_verified)
    ? `Verified ${shortDate(p.last_verified)} with source.`
    : shortDate(p.free_limits.checked) ? `Limits read ${shortDate(p.free_limits.checked)} at the source.` : '';
  return trimAtWord(`${p.name} free tier: ${[...figures, ...card].join(', ')}.${when ? ` ${when}` : ''}`);
}
