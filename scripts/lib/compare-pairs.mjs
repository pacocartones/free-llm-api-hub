// compare-pairs.mjs — which provider pairs get a static /compare/<a>-vs-<b>/ page.
//
// A data module: no markup, no file access. compare.mjs re-exports it for build.mjs; validate.mjs uses it to check that
// data/redirects.json does not shadow a compare page the build makes.

import { SLUG_RE } from './slug.mjs';

// Static pages: a small, deterministic set, so the sitemap stays reviewable.
export const COMPARE_PAGE_CAP = 30;
// No single pick may take over the set: each provider appears in at most this
// many static pages, which spreads the pages across more of the ranking.
export const COMPARE_PER_PROVIDER_CAP = 4;

export const comparePath = (a, b) => `${a}-vs-${b}`;

/** Modalities both providers offer, in the first provider's order. */
export function sharedModalities(a, b) {
  const mb = new Set(b.modalities || []);
  return (a.modalities || []).filter((m) => mb.has(m));
}

/**
 * The static compare pages: pairs of editorial picks (data/best.json order)
 * that share at least one modality. `ranked` is the list of providers in rank
 * order. Pairs are ordered by the sum of their ranks (then the higher-ranked
 * member), so the best-known matchups come first; each provider is capped at
 * `perProvider` pages and the whole set at `cap`. Pure and deterministic: the
 * same ranking and dataset always yield the same pages.
 */
export function selectComparePairs(ranked, opts = {}) {
  const cap = opts.cap ?? COMPARE_PAGE_CAP;
  const perProvider = opts.perProvider ?? COMPARE_PER_PROVIDER_CAP;
  const candidates = [];
  for (let i = 0; i < ranked.length; i += 1) {
    for (let j = i + 1; j < ranked.length; j += 1) {
      const a = ranked[i], b = ranked[j];
      if (!SLUG_RE.test(String(a.slug || '')) || !SLUG_RE.test(String(b.slug || ''))) continue;
      const shared = sharedModalities(a, b);
      if (shared.length) candidates.push({ i, j, a, b, shared });
    }
  }
  candidates.sort((x, y) => (x.i + x.j) - (y.i + y.j) || x.i - y.i);
  const uses = new Map();
  const out = [];
  for (const c of candidates) {
    if (out.length >= cap) break;
    const ua = uses.get(c.a.slug) || 0, ub = uses.get(c.b.slug) || 0;
    if (ua >= perProvider || ub >= perProvider) continue;
    uses.set(c.a.slug, ua + 1);
    uses.set(c.b.slug, ub + 1);
    out.push({ a: c.a, b: c.b, shared: c.shared, path: comparePath(c.a.slug, c.b.slug) });
  }
  return out;
}
