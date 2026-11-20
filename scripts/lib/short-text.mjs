// short-text.mjs — shorten long authored prose for compact surfaces (the README top table)
// without cutting a claim in half. The full text always stays on the provider page.

export const README_CATCH_MAX = 220;

/**
 * Returns `text` unchanged when it fits in `max` characters. Otherwise it keeps whole
 * sentences up to `max`. If even the first sentence is too long, it cuts at the last
 * word boundary and adds an ellipsis. `shortened` says whether anything was dropped.
 */
export const shortenProse = (text, max = README_CATCH_MAX) => {
  const s = String(text ?? '').trim();
  if (s.length <= max) return { text: s, shortened: false };
  // Sentence ends: ". ", "! ", "? " or ") " after a period, followed by an upper-case letter or a quote.
  const ends = [...s.matchAll(/[.!?]["')\]]?(?=\s+["'(A-Z0-9])/g)].map((m) => m.index + m[0].length);
  const fit = ends.filter((i) => i <= max);
  if (fit.length) return { text: s.slice(0, fit[fit.length - 1]), shortened: true };
  const cut = s.lastIndexOf(' ', max - 1);
  return { text: s.slice(0, cut > 0 ? cut : max - 1).replace(/[\s,;:—-]+$/, '') + '…', shortened: true };
};
