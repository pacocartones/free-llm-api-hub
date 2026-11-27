// stale-claims.mjs — the block "What other sources get wrong" on a provider page, from data/stale-claims.json.
//
// AI assistants and third-party lists keep repeating free-tier figures a provider has since changed (our AEO baseline
// of 27 Nov 2026: Cerebras "1M tokens/day free", Gemini "1,500 RPD", Groq "14,400 RPD / Llama 4"). The file records
// each stale claim, where it was seen (and, for a public page, its URL and the page's own date) and the day it was noted; the evidence shown beside it is never typed here: it is
// a sentence of the quote register (data/quotes.json) or a field of the provider's record, with its own source and date.
// staleClaimErrors() is the guard build.mjs and validate.mjs run (stale-claims-data.mjs); staleClaimsHtml() renders the block. Pure: no file access.

import { escapeAttr } from './html.mjs';
import { timeHtml } from './dates.mjs';
import { NOT_STATED } from './not-stated.mjs';
// The guard and the evidence it resolves are a data module of their own, so validate.mjs runs it without this renderer.
import { DATE_RE, httpsOnly, resolveEvidence } from './stale-claims-data.mjs';
export { staleClaimsFor, freeLimitsWords, resolveEvidence, staleClaimErrors } from './stale-claims-data.mjs';

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
