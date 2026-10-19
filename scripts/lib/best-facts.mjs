// The three cards of an entry on /best/: Free quota, Rate limit and Requirements.
// Every value is a field of data/providers.json shown as it is, with the date and the source the provider record already carries
// (last_verified and docs_url); nothing is computed or added. A field the record does not have reads «not stated», never a guess.
import { htmlEsc } from './rows.mjs';

const NOT_STATED = 'not stated';
const safeUrl = (u) => (/^https?:\/\//i.test(String(u || '')) ? htmlEsc(u) : '');
const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : '');

const source = (p) => {
  const url = safeUrl(p.docs_url);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(p.last_verified || '')) ? `Checked ${htmlEsc(p.last_verified)}` : 'Not yet verified';
  return `<p class="best-fact-src">${day}${url ? ` · <a href="${url}" target="_blank" rel="noopener">source</a>` : ''}</p>`;
};

const textCard = (label, value, p) => {
  const v = text(value);
  return `<div class="best-fact"><h3 class="best-fact-h">${label}</h3>` +
    `<p class="best-fact-v${v ? '' : ' muted'}"${v ? ` title="${htmlEsc(v)}"` : ''}>${v ? htmlEsc(v) : NOT_STATED}</p>${source(p)}</div>`;
};

// icon(id) is the sprite helper of the build; the three flags are tri-state: true, false or unknown (null).
const flag = (icon, v, yes, no, unknown) => {
  const [id, label, cls] = v === true ? [yes[0], yes[1], 'yes'] : v === false ? [no[0], no[1], 'no'] : [unknown[0], unknown[1], 'unknown'];
  return `<li class="best-req-${cls}">${icon(id)}<span>${label}</span></li>`;
};

/** @returns {string} the three cards, as one block */
export function bestFactsHtml(p, icon) {
  const requirements = `<div class="best-fact best-req"><h3 class="best-fact-h">Requirements</h3><ul class="best-req-list">` +
    flag(icon, p.card_required, ['ic-card', 'Credit card required'], ['ic-nocard', 'No credit card'], ['ic-card', 'Credit card: not stated']) +
    flag(icon, p.phone_required, ['ic-phone', 'Phone verification'], ['ic-nophone', 'No phone verification'], ['ic-phone', 'Phone: not stated']) +
    flag(icon, p.commercial_ok, ['ic-building', 'Commercial use allowed'], ['ic-flask', 'Evaluation use only'], ['ic-building', 'Commercial use: not stated']) +
    `</ul>${source(p)}</div>`;
  return `<div class="best-facts">${textCard('Free quota', p.free_tier, p)}${textCard('Rate limit', p.rate_limits, p)}${requirements}</div>`;
}
