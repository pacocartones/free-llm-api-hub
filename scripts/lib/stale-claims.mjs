// stale-claims.mjs — the block "What other sources get wrong" on a provider page, from data/stale-claims.json.
//
// AI assistants and third-party lists keep repeating free-tier figures a provider has since changed (our AEO baseline
// of 27 Nov 2026: Cerebras "1M tokens/day free", Gemini "1,500 RPD", Groq "14,400 RPD / Llama 4"). The file records
// each stale claim, where it was seen (and, for a public page, its URL and the page's own date) and the day it was noted; the evidence shown beside it is never typed here: it is
// a sentence of the quote register (data/quotes.json) or a field of the provider's record, with its own source and date.
// staleClaimErrors() is the guard build.mjs runs; staleClaimsHtml() renders the block. Pure: no file access.

import { escapeAttr } from './html.mjs';
import { timeHtml } from './dates.mjs';
import { LIMIT_METRICS, limitOf } from './long-guides.mjs';
import { NOT_STATED } from './not-stated.mjs';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const FIELDS = ['free_tier', 'rate_limits', 'free_limits'];
const httpsOnly = (u) => (typeof u === 'string' && /^https:\/\/[^\s"<>]+$/i.test(u) ? u : '');
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

/** The day the block is dated by: the latest `noted` of the provider's claims. */
export const staleClaimsNoted = (claims) => claims.map((c) => c.noted).filter((d) => DATE_RE.test(d || '')).sort().pop() || null;

/** The block for one provider, or '' when the file has no claim about it. */
export function staleClaimsHtml(p, claims, { quotes }) {
  if (!claims.length) return '';
  const name = escapeAttr(p.name);
  const t = (d) => (d ? timeHtml(d, escapeAttr) : 'date not stated');
  const srcLink = (u) => (httpsOnly(u) ? ` (<a href="${escapeAttr(u)}" target="_blank" rel="noopener">source</a>)` : '');
  const evidenceHtml = (e) =>
    `<li><strong>${escapeAttr(e.label)}:</strong> ${e.quoted ? `“${escapeAttr(e.text)}”` : escapeAttr(e.text)}` +
    `<br><small>Read ${t(e.date)}${srcLink(e.source)}</small></li>`;
  // A claim seen on a public page links it, with the page's own date ("not stated" when the page gives none).
  const seenHtml = (c) => (httpsOnly(c.seen_url)
    ? `<a href="${escapeAttr(c.seen_url)}" target="_blank" rel="noopener nofollow">${escapeAttr(c.seen_in)}</a> (${c.seen_date ? `page dated ${t(c.seen_date)}` : `page date ${NOT_STATED}`})`
    : escapeAttr(c.seen_in));
  const rows = claims.map((c) =>
    `<tr><td>“${escapeAttr(c.claim)}”<br><small>${seenHtml(c)}; noted ${t(c.noted)}</small></td>` +
    `<td><ul class="stale-evidence">${c.evidence.map((ev) => resolveEvidence(ev, p, quotes)).filter(Boolean).map(evidenceHtml).join('')}</ul></td></tr>`).join('');
  return `<h2 id="other-sources">What other sources get wrong</h2>` +
    `<p>Noted ${t(staleClaimsNoted(claims))}. Figures that AI assistants and other lists still repeat about the free tier of ${name}, next to what the provider’s own pages say now, with the day we read them. The provider’s page is the authority: follow the source before relying on either.</p>` +
    `<div class="table-scroll" role="region" aria-label="Stale claims about the free tier of ${name} and the current value" tabindex="0"><table class="stale-claims">` +
    `<thead><tr><th scope="col">What other sources say</th><th scope="col">What the provider’s own pages say now</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
