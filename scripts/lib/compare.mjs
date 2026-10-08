// compare.mjs — single source of truth for the provider compare view (#175).
//
// Two audiences, one set of functions (same contract as rows.mjs):
//   - scripts/build.mjs renders the static /compare/<a>-vs-<b>/ pages with
//     compareTableHtml, and picks which pairs get a page with selectComparePairs.
//   - site/compare.js renders the interactive /compare/?compare=a,b view with
//     the same compareTableHtml and parseCompareSlugs, loaded as the generated
//     site/shared-compare.js (clientBundle below), so the static pages and the
//     browser view can never show different tables.
//
// Provider fields come from providers.json, which community PRs can edit —
// every field is escaped with the shared htmlEsc before it reaches markup, a
// slug only becomes an href after SLUG_RE, and docs_url only after it is an
// http(s) URL. Nothing here reads the current date: the static pages are
// pinned in derived-fingerprints.json and must be byte-stable per dataset.

import { htmlEsc, SLUG_RE } from './rows.mjs';

export const COMPARE_MIN = 2;
export const COMPARE_MAX = 4;
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

/**
 * A tri-state flag (true / false / null) as escaped HTML. null means nobody
 * has confirmed the field yet — never "no" — so it reads "not confirmed".
 */
export function triStateHtml(v, yes, no) {
  if (v === true) return `<span class="tri tri-yes">${htmlEsc(yes)}</span>`;
  if (v === false) return `<span class="tri tri-no">${htmlEsc(no)}</span>`;
  return '<span class="tri tri-unk">not confirmed</span>';
}

/**
 * The slugs a compare URL asks for: `?compare=a,b,c` (the shareable form) and
 * repeated `?p=a&p=b` (what the no-JS picker form submits). Unknown or
 * malformed slugs are dropped, duplicates collapse, and the list is capped at
 * COMPARE_MAX. `known` is the list of valid slugs.
 */
export function parseCompareSlugs(search, known) {
  const params = new URLSearchParams(String(search || ''));
  const raw = [];
  for (const v of params.getAll('compare')) raw.push(...v.split(','));
  raw.push(...params.getAll('p'));
  const allowed = new Set(known || []);
  const out = [];
  for (const r of raw) {
    const s = r.trim().toLowerCase();
    if (!s || !SLUG_RE.test(s) || !allowed.has(s) || out.includes(s)) continue;
    out.push(s);
    if (out.length >= COMPARE_MAX) break;
  }
  return out;
}

/**
 * The side-by-side table: one column per provider, one row per dataset field.
 * `opts.prefix` is the path from the page to the site root (provider links).
 */
export function compareTableHtml(list, opts = {}) {
  const prefix = (opts && opts.prefix) || '';
  const cell = (s) => htmlEsc(s);
  const safeUrl = (u) => (/^https?:\/\//i.test(String(u || '')) ? String(u) : '');
  const fields = [
    ['Type', (p) => cell((p.category === 'ongoing' ? 'Ongoing free tier' : 'Trial credit') + (p.free_type ? ' · ' + p.free_type : ''))],
    ["What's free", (p) => cell(p.free_tier || '—')],
    ['Rate limits', (p) => cell(p.rate_limits || 'not specified')],
    ['Expires', (p) => cell(p.expires || 'no expiry')],
    ['The catch', (p) => cell(p.notes || '—')],
    ['Credit card', (p) => triStateHtml(p.card_required, 'required', 'not required')],
    ['Phone verification', (p) => triStateHtml(p.phone_required, 'required', 'not required')],
    ['Commercial use', (p) => triStateHtml(p.commercial_ok, 'allowed', 'not allowed (eval only)')],
    ['OpenAI-compatible', (p) => triStateHtml(p.openai_compatible, 'yes', 'no') +
      (p.openai_base_url ? `<div class="cmp-sub"><code>${cell(p.openai_base_url)}</code></div>` : '')],
    ['Modalities', (p) => cell((p.modalities || []).join(', ') || '—')],
    ['Free models (sample)', (p) => (p.models_free && p.models_free.length)
      ? p.models_free.map((m) => `<code>${cell(m)}</code>`).join(' ')
      : '<span class="tri tri-unk">no sample</span>'],
    ['Official docs', (p) => safeUrl(p.docs_url)
      ? `<a href="${cell(safeUrl(p.docs_url))}" target="_blank" rel="noopener">${cell(safeUrl(p.docs_url).replace(/^https?:\/\//i, ''))}</a>`
      : '—'],
    ['Last verified', (p) => (p.verified && p.last_verified)
      ? `<span class="v ok">${cell(p.last_verified)}</span>`
      : '<span class="v warn">unverified</span>'],
  ];
  const head = list.map((p) => {
    const name = SLUG_RE.test(String(p.slug || ''))
      ? `<a href="${prefix}p/${p.slug}">${cell(p.name)}</a>`
      : cell(p.name);
    return `<th scope="col">${name}</th>`;
  }).join('');
  const body = fields.map(([label, fn]) =>
    `<tr><th scope="row">${cell(label)}</th>${list.map((p) => `<td>${fn(p)}</td>`).join('')}</tr>`
  ).join('\n');
  return `<div class="compare-scroll"><table class="compare-table">` +
    `<caption class="sr-only">Side-by-side comparison of ${cell(list.map((p) => p.name).join(', '))}</caption>` +
    `<thead><tr><th scope="col"><span class="sr-only">Field</span></th>${head}</tr></thead>` +
    `<tbody>\n${body}\n</tbody></table></div>`;
}

/**
 * The exact client bundle the browser runs (written to site/shared-compare.js
 * by build.mjs). explorer.test.mjs executes this same string, so the browser
 * view and its XSS regression tests can never drift from the module.
 */
export function clientBundle() {
  return `// AUTO-GENERATED by scripts/build.mjs from scripts/lib/compare.mjs — do not edit.
window.FLLM_COMPARE = (function () {
  const htmlEsc = ${htmlEsc.toString()};
  const SLUG_RE = ${SLUG_RE.toString()};
  const COMPARE_MIN = ${COMPARE_MIN};
  const COMPARE_MAX = ${COMPARE_MAX};
  const triStateHtml = ${triStateHtml.toString()};
  const parseCompareSlugs = ${parseCompareSlugs.toString()};
  const compareTableHtml = ${compareTableHtml.toString()};
  return { COMPARE_MIN, COMPARE_MAX, parseCompareSlugs, compareTableHtml };
})();
`;
}
