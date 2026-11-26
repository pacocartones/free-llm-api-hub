// stamp.mjs — the "receipt" of brand H1: the signature of how we know a value. Two shapes of one receipt (docs/brand.md):
//
//   ticket  the main stamp (Cálida): a perforated ticket, side notches, a dashed cut line between the ✓ and the text,
//           apricot fill (--seal-bg), turned -1.5deg. "✓ | Verified 24 Nov 2026 · 7 sources". The provider page,
//           the social images and the badges use it.
//   pill    the compact stamp in tables and lists (H1-b's minimalist pill, in Cálida colours): flat, not turned, a
//           status dot + "Verified · 24 Nov 2026 · 7 sources".
//
// Both link to the page the entry was checked on, and their title carries the sentence we quoted from that page, so a
// hover shows the receipt itself. "N sources" counts the distinct pages behind the entry (stampSources).
//
// Freshness is said three ways, never by colour alone (WCAG 1.4.1): the mark or dot (✓ / ● fresh or due, ! stale), the
// border (dashed when a re-check is due or overdue) and words for screen readers. The colour follows --ok / --unk / --bad.
//
// Every shape value lives in STAMP_SHAPES (and its CSS in styles.css), so another variant is a parameter change.
// Shipped to the browser as source text (rows.clientBundle) like flags.mjs: keep stampDate, stampState and stampHtml
// self-contained (htmlEsc, freshnessStatus and the constants below). The quote, its URL and the count travel on the
// record as `stamp` ({ q, u, n }), set by the build from data/quotes.json (stampSource), so the server render and the
// browser repaint print the same receipt.

import { htmlEsc } from './rows.mjs';
import { freshnessStatus } from './rules.mjs';

export const STAMP_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const STAMP_WORDS = { fresh: 'Verified, fresh', due: 'Verified, due for re-check', stale: 'Verified, stale: re-check overdue' };

/**
 * The shapes, for the web (styles.css reads the same numbers) and the SVG renderings (OG images, badges):
 *   ticket  notch radius (px), cut line width (px), rotation (deg)
 *   pill    status dot size (px)
 */
export const STAMP_SHAPES = {
  ticket: { notch: 5, cut: 1.5, rotate: -1.5 },
  pill: { dot: 8 },
};

/** '2026-11-24' → '24 Nov' (or '24 Nov 2026' with the year). Anything else is returned escaped as it is. */
export function stampDate(iso, withYear) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return htmlEsc(iso || '');
  return Number(m[3]) + ' ' + STAMP_MONTHS[Number(m[2]) - 1] + (withYear ? ' ' + m[1] : '');
}

/** Freshness of a verified record against a reference date: { age (days), st ('fresh' | 'due' | 'stale'), cls }. */
export function stampState(p, now) {
  const nowMs = now == null ? Date.now() : typeof now === 'string' ? Date.parse(now + 'T00:00:00Z') : now instanceof Date ? now.getTime() : Number(now);
  const age = Math.floor((nowMs - Date.parse(p.last_verified + 'T00:00:00Z')) / 86400000);
  const st = freshnessStatus(age);
  return { age, st, cls: st === 'stale' ? 'b-stale' : st === 'due' ? 'b-warn' : 'b-ok' };
}

/**
 * The stamp of a verified record. opts.now is the reference date for its freshness (the build passes ASOF, the
 * browser its clock). opts.shape: 'ticket' (default; opts.long makes the large one of the provider page) or 'pill'
 * (tables and lists). Unverified records get no stamp.
 */
export function stampHtml(p, opts) {
  const o = opts || {};
  if (!p || !p.verified || !p.last_verified) return '';
  const fr = stampState(p, o.now);
  const s = p.stamp && typeof p.stamp === 'object' ? p.stamp : {};
  const url = typeof s.u === 'string' && /^https:\/\/[^\s"'<>]+$/.test(s.u) ? s.u : '';
  const n = Number.isInteger(s.n) && s.n > 0 ? s.n : 0;
  const date = htmlEsc(p.last_verified);
  const title = 'Verified ' + fr.age + 'd ago · ' + date + (s.q ? ' · “' + htmlEsc(s.q) + '”' : ' on the provider’s own docs');
  const sources = n ? ' · ' + n + (n === 1 ? ' source' : ' sources') : url ? ' · source' : '';
  const sr = '<span class="sr-only">' + STAMP_WORDS[fr.st] + ': </span>';
  const when = '<time datetime="' + date + '">' + stampDate(p.last_verified, true) + '</time>';
  const of = url ? '<span class="sr-only"> of the ' + htmlEsc(p.name || 'provider') + ' entry</span>' : '';
  let cls, inner;
  if (o.shape === 'pill') {
    cls = 'stamp stamp-pill ' + fr.cls;
    inner = '<span class="stamp-dot" aria-hidden="true">' + (fr.st === 'stale' ? '!' : '') + '</span>' + sr +
      '<b>Verified</b><span aria-hidden="true"> · </span>' + when + sources + of;
  } else {
    cls = 'stamp stamp-ticket ' + fr.cls + (o.long ? ' stamp-lg' : '');
    inner = '<b class="stamp-mark" aria-hidden="true">' + (fr.st === 'stale' ? '!' : '✓') + '</b>' +
      '<span class="stamp-text">' + sr + 'Verified ' + when + sources + of + '</span>';
  }
  const attrs = ' class="' + cls + '" title="' + title + '"';
  return url ? '<a' + attrs + ' href="' + htmlEsc(url) + '" rel="noopener">' + inner + '</a>' : '<span' + attrs + '>' + inner + '</span>';
}

/**
 * The distinct pages behind an entry: docs_url, the published limits' source, the data-policy source and every source
 * of field_checks (https only). Build-side only.
 */
export function stampSources(p) {
  const urls = new Set();
  const add = (u) => { if (typeof u === 'string' && /^https:\/\/[^\s"'<>]+$/.test(u)) urls.add(u.replace(/#.*$/, '')); };
  if (!p) return [];
  add(p.docs_url);
  if (p.free_limits && typeof p.free_limits === 'object') add(p.free_limits.source);
  if (p.data_policy && typeof p.data_policy === 'object') add(p.data_policy.source);
  if (p.field_checks && typeof p.field_checks === 'object') {
    for (const c of Object.values(p.field_checks)) {
      if (!c || typeof c !== 'object') continue;
      add(c.source);
      if (Array.isArray(c.sources)) c.sources.forEach(add);
    }
  }
  return [...urls];
}

/**
 * The receipt behind a record's stamp, from the quote register: the sentence quoted for the entry (kind "sentence"),
 * else the data-policy quote, else no quote; the URL is the quote's page, else the published limits' source, else the
 * docs; `n` is the number of distinct sources (stampSources). Build-side only (it reads the register); the result
 * travels as `stamp` on the record.
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
  const n = stampSources(p).length;
  if (n) out.n = n;
  return out;
}
