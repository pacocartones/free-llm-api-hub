// stamp.mjs — the "receipt" stamp of brand H1: the signature of how we know a value. "✓ 24 Nov · source", slightly
// rotated, links to the page the entry was checked on, and its title carries the sentence we quoted from that page, so
// a hover shows the receipt itself. It replaces the verified badge in the explorer and on the provider page.
//
// Freshness is said three ways, never by colour alone (WCAG 1.4.1): the mark (✓ fresh or due, ! stale), the border
// (solid, or dashed when a re-check is due) and words for screen readers. The colour follows --ok / --unk / --bad.
//
// Shipped to the browser as source text (rows.clientBundle) like flags.mjs: keep it self-contained (htmlEsc, ICON,
// freshnessStatus and the constants below). The quote and its URL travel on the record as `stamp` ({ q, u }), set by
// the build from data/quotes.json (stampSource), so the server render and the browser repaint print the same receipt.

import { htmlEsc } from './rows.mjs';
import { freshnessStatus } from './rules.mjs';

export const STAMP_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const STAMP_WORDS = { fresh: 'Verified, fresh', due: 'Verified, due for re-check', stale: 'Verified, stale: re-check overdue' };

/** '2026-11-24' → '24 Nov' (or '24 Nov 2026' with the year). Anything else is returned escaped as it is. */
export function stampDate(iso, withYear) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return htmlEsc(iso || '');
  return Number(m[3]) + ' ' + STAMP_MONTHS[Number(m[2]) - 1] + (withYear ? ' ' + m[1] : '');
}

/**
 * The stamp of a verified record. opts.now is the reference date for its freshness (the build passes ASOF, the
 * browser its clock); opts.long prints "Verified 24 Nov 2026" (the provider page). Unverified records get no stamp.
 */
export function stampHtml(p, opts) {
  const o = opts || {};
  if (!p || !p.verified || !p.last_verified) return '';
  const nowMs = o.now == null ? Date.now() : typeof o.now === 'string' ? Date.parse(o.now + 'T00:00:00Z') : o.now instanceof Date ? o.now.getTime() : Number(o.now);
  const age = Math.floor((nowMs - Date.parse(p.last_verified + 'T00:00:00Z')) / 86400000);
  const st = freshnessStatus(age);
  const cls = st === 'stale' ? 'b-stale' : st === 'due' ? 'b-warn' : 'b-ok';
  const s = p.stamp && typeof p.stamp === 'object' ? p.stamp : {};
  const url = typeof s.u === 'string' && /^https:\/\/[^\s"'<>]+$/.test(s.u) ? s.u : '';
  const date = htmlEsc(p.last_verified);
  const title = 'Verified ' + age + 'd ago · ' + date + (s.q ? ' · “' + htmlEsc(s.q) + '”' : ' on the provider’s own docs');
  const mark = '<span class="stamp-mark" aria-hidden="true">' + (st === 'stale' ? '!' : '✓') + '</span>';
  const when = '<time datetime="' + date + '">' + (o.long ? 'Verified ' : '') + stampDate(p.last_verified, !!o.long) + '</time>';
  const inner = mark + '<span class="sr-only">' + STAMP_WORDS[st] + ': </span>' + when +
    (url ? '<span class="stamp-sep" aria-hidden="true"> · </span>source<span class="sr-only"> of the ' + htmlEsc(p.name || 'provider') + ' entry</span>' : '');
  const attrs = ' class="stamp badge ' + cls + (o.long ? ' stamp-lg' : '') + '" title="' + title + '"';
  return url ? '<a' + attrs + ' href="' + htmlEsc(url) + '" rel="noopener">' + inner + '</a>' : '<span' + attrs + '>' + inner + '</span>';
}

/**
 * The receipt behind a record's stamp, from the quote register: the sentence quoted for the entry (kind "sentence"),
 * else the data-policy quote, else no quote; the URL is the quote's page, else the published limits' source, else the
 * docs. Build-side only (it reads the register); the result travels as `stamp` on the record.
 */
export function stampSource(p, registry) {
  const entries = (registry && Array.isArray(registry.entries)) ? registry.entries : [];
  const e = entries.find((x) => x && x.slug === p.slug && x.kind === 'sentence' && typeof x.text === 'string');
  const dp = p.data_policy && typeof p.data_policy === 'object' ? p.data_policy : {};
  const q = e ? e.text : (typeof dp.quote === 'string' ? dp.quote : '');
  const u = (e && e.source_url) || (q && dp.source) || (p.free_limits && p.free_limits.source) || p.docs_url || '';
  const out = {};
  if (q) out.q = q.length > 280 ? q.slice(0, 279).replace(/\s+\S*$/, '') + '…' : q;
  if (/^https:\/\//.test(u)) out.u = u;
  return out;
}
