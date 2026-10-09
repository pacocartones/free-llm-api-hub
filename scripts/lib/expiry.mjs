// expiry.mjs — what a provider's `expires` / `no_expiry` pair means, in ONE place.
// The provider page and the comparison read it from here (and the API carries the data itself),
// so they cannot disagree again:
//   a window or date in `expires`            -> shown as is
//   `no_expiry` (trial credit, provider says) -> "no expiry", with the source and the reading date
//   a trial credit with neither               -> "not confirmed" (nobody has said)
//   anything else with a null `expires`       -> "no expiry" (a continuous free tier has no end date)

import { htmlEsc } from './rows.mjs';

/**
 * HTML for the provider page and the comparison. Self-contained on purpose: compare.mjs serialises
 * this function into the browser bundle (site/shared-compare.js), where only `htmlEsc` is in scope.
 */
export function expiryHtml(p) {
  if (p.expires) return htmlEsc(String(p.expires));
  if (p.no_expiry) {
    const src = /^https?:\/\//i.test(String(p.no_expiry.source || '')) ? htmlEsc(p.no_expiry.source) : '';
    const who = src ? `<a href="${src}" target="_blank" rel="noopener">per the provider</a>` : 'per the provider';
    return `no expiry <span class="muted">(${who}, read ${htmlEsc(p.no_expiry.checked)})</span>`;
  }
  if (p.free_type === 'trial-credit') return '<span class="tri tri-unk">not confirmed</span>';
  return 'no expiry';
}
