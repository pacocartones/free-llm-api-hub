// stale-claims-data.mjs — the guard on data/stale-claims.json and the evidence it resolves, apart from the renderer in stale-claims.mjs.
//
// A data module: no markup, no file access. build.mjs (through stale-claims.mjs, which re-exports it) and validate.mjs run
// the same staleClaimErrors(), so `npm run validate` reports what the build would refuse.

import { LIMIT_METRICS, limitOf } from './free-limits.mjs';

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const FIELDS = ['free_tier', 'rate_limits', 'free_limits'];
export const httpsOnly = (u) => (typeof u === 'string' && /^https:\/\/[^\s"<>]+$/i.test(u) ? u : '');
const num = (n) => Number(n).toLocaleString('en-US');
const nonEmpty = (s) => typeof s === 'string' && s.trim() !== '';

/** The entries of the file for one provider, in file order. */
export const staleClaimsFor = (file, slug) => ((file && file.claims) || []).filter((c) => c.slug === slug);

/** The structured free limits in words: "10,000 requests per day, 200 requests per minute". */
export const freeLimitsWords = (p) => LIMIT_METRICS.filter((m) => limitOf(p, m.key) != null).map((m) => `${num(limitOf(p, m.key))} ${m.label}`).join(', ');

/**
 * One piece of evidence resolved against the data: { label, text, quoted, source, date }, or null when it cannot be
 * shown (unknown quote, quote of another provider, empty field). `quoted` is true only for a verbatim register sentence.
 */
export function resolveEvidence(ev, p, quotes) {
  if (ev && typeof ev.quote === 'string') {
    const q = (quotes || []).find((x) => x.id === ev.quote);
    if (!q || q.slug !== p.slug || !nonEmpty(q.text)) return null;
    return { label: 'In the provider’s words', text: q.text, quoted: true, source: q.source_url, date: q.read_on };
  }
  const field = ev && ev.field;
  if (field === 'free_limits') {
    const words = p.free_limits ? freeLimitsWords(p) : '';
    if (!words) return null;
    const scope = nonEmpty(p.free_limits.scope) ? `; scope: ${p.free_limits.scope}` : '';
    return { label: 'Published free limits', text: words + scope, quoted: false, source: p.free_limits.source, date: p.free_limits.checked || p.last_verified };
  }
  if (field === 'free_tier' || field === 'rate_limits') {
    if (!nonEmpty(p[field])) return null;
    return { label: field === 'free_tier' ? 'Free tier, per its page' : 'Rate limits, per its page', text: p[field], quoted: false, source: p.docs_url, date: p.last_verified };
  }
  return null;
}

/** Every problem with the file: unknown or unverified provider, missing text, bad or future date, unresolvable evidence. */
export function staleClaimErrors(file, { providers, quotes, today }) {
  const errors = [];
  if (!file || !Array.isArray(file.claims)) return ['stale-claims.json: claims must be an array'];
  file.claims.forEach((c, i) => {
    const where = `stale-claims.json: claims[${i}]${c && c.slug ? ` (${c.slug})` : ''}`;
    const p = providers.find((x) => x.slug === (c && c.slug));
    if (!p) { errors.push(`${where}: slug is not a provider in data/providers.json`); return; }
    if (p.verified !== true) errors.push(`${where}: the provider is not verified, so there is no current value to show`);
    if (!nonEmpty(c.claim)) errors.push(`${where}: claim must be the stale figure as it is repeated`);
    if (!nonEmpty(c.seen_in)) errors.push(`${where}: seen_in must say where the claim was seen`);
    if (c.seen_url != null && !httpsOnly(c.seen_url)) errors.push(`${where}: seen_url must be an https URL of the page that repeats the claim`);
    if (c.seen_date != null) {
      if (!c.seen_url) errors.push(`${where}: seen_date is the date of the page at seen_url, so it needs seen_url`);
      if (!DATE_RE.test(c.seen_date)) errors.push(`${where}: seen_date must be YYYY-MM-DD (leave it out when the page states no date)`);
      else if (DATE_RE.test(c.noted || '') && c.seen_date > c.noted) errors.push(`${where}: seen_date (${c.seen_date}) is after noted (${c.noted})`);
    }
    if (!DATE_RE.test(c.noted || '')) errors.push(`${where}: noted must be YYYY-MM-DD`);
    else if (today && c.noted > today) errors.push(`${where}: noted (${c.noted}) is after today in UTC (${today})`);
    if (!Array.isArray(c.evidence) || !c.evidence.length) { errors.push(`${where}: evidence must list at least one quote or field`); return; }
    c.evidence.forEach((ev, j) => {
      if (ev && ev.field != null && !FIELDS.includes(ev.field)) errors.push(`${where}: evidence[${j}].field must be one of ${FIELDS.join(', ')}`);
      else if (!resolveEvidence(ev, p, quotes)) errors.push(`${where}: evidence[${j}] does not resolve (unknown quote id, a quote of another provider, or an empty field)`);
    });
  });
  return errors;
}
