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
import { expiryHtml } from './expiry.mjs';
import { NOT_STATED_HTML } from './not-stated.mjs';
import { REASON_LABEL } from './field-checks.mjs';
import { DATE_MONTHS, humanDate } from './dates.mjs';

export const COMPARE_MIN = 2;
export const COMPARE_MAX = 4;
// Static pages: a small, deterministic set, so the sitemap stays reviewable.
export const COMPARE_PAGE_CAP = 30;
// No single pick may take over the set: each provider appears in at most this
// many static pages, which spreads the pages across more of the ranking.
export const COMPARE_PER_PROVIDER_CAP = 4;

export const comparePath = (a, b) => `${a}-vs-${b}`;

/**
 * A provider's comparison category is its principal modality: the first one
 * listed in its dataset entry (text with text, OCR with OCR, speech with speech).
 * Suggested comparisons (the "Compare with" links) only join providers of one
 * category; the pages for other pairs still exist and stay in the sitemap.
 */
// The main modality of a provider: 'text' for a text LLM (is_text_llm). Any other provider takes its most specific
// modality, in this order: Jina AI lists text and image before embeddings and rerank, and it is compared with Voyage AI,
// not with Groq or an image generator. A text-only non-LLM keeps 'text'.
const MAIN_MODALITY_ORDER = ['embeddings', 'rerank', 'ocr', 'audio', 'vision', 'image'];
export const comparisonCategory = (p) => {
  const m = (p && p.modalities) || [];
  if (p && p.is_text_llm === true && m.includes('text')) return 'text';
  return MAIN_MODALITY_ORDER.find((x) => m.includes(x)) ?? m[0] ?? null;
};
export const sameComparisonCategory = (a, b) => {
  const ca = comparisonCategory(a);
  return ca !== null && ca === comparisonCategory(b);
};

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
 * The comparisons a provider page suggests (Q9): up to `limit` (3) verified providers with the same main modality
 * (comparisonCategory). The closest offers come first: both publish speed figures (published_speed) +3, the same
 * category +1, the same free_type +1; then the higher score (`score(p)`, larger first, unscored last), then the name.
 * Each peer carries the path of its published compare page when there is one (`staticPaths`), else null, and the page
 * links the interactive view instead, so no compare page is added or removed. Pure and deterministic.
 */
export function comparePeers(p, providers, { staticPaths = new Set(), score = () => null, limit = 3 } = {}) {
  const cat = comparisonCategory(p);
  if (cat === null || !SLUG_RE.test(String(p.slug || ''))) return [];
  const speed = (x) => Array.isArray(x.published_speed) && x.published_speed.length > 0;
  const near = (o) => (speed(p) && speed(o) ? 3 : 0) + (o.category === p.category ? 1 : 0) + (o.free_type === p.free_type ? 1 : 0);
  const sc = (o) => { const v = score(o); return typeof v === 'number' && Number.isFinite(v) ? v : -Infinity; };
  return (providers || [])
    .filter((o) => o && o.slug !== p.slug && o.verified === true && SLUG_RE.test(String(o.slug || '')) && comparisonCategory(o) === cat)
    .map((o) => {
      const ab = comparePath(p.slug, o.slug), ba = comparePath(o.slug, p.slug);
      return { other: o, path: staticPaths.has(ab) ? ab : staticPaths.has(ba) ? ba : null, near: near(o) };
    })
    .sort((x, y) => (y.near - x.near) || (sc(y.other) - sc(x.other) || 0) || (x.other.name < y.other.name ? -1 : x.other.name > y.other.name ? 1 : 0))
    .slice(0, limit)
    .map(({ other, path }) => ({ other, path }));
}

/**
 * A tri-state flag (true / false / null) as escaped HTML. null means the provider's pages do not say it (or nobody
 * has recorded it yet) — never "no" — so it reads "not stated". `check` is the flag's field_checks entry, if any: a
 * recorded reason adds the reason and the day it was checked ("not stated in the provider's docs (checked 24 Nov
 * 2026)"). The words are REASON_LABEL (field-checks.mjs), serialised with this function into the browser bundle.
 */
export function triStateHtml(v, yes, no, check) {
  if (v === true) return `<span class="tri tri-yes">${htmlEsc(yes)}</span>`;
  if (v === false) return `<span class="tri tri-no">${htmlEsc(no)}</span>`;
  if (v === 'conditional') return '<span class="tri tri-cond">conditional</span>';
  const status = check && typeof check === 'object' ? String(check.status) : '';
  if (status !== 'not_checked' && Object.prototype.hasOwnProperty.call(REASON_LABEL, status)) {
    const day = humanDate(check.checked) ? ` (checked ${humanDate(check.checked)})` : '';
    return `<span class="tri tri-unk tri-why" title="${htmlEsc(REASON_LABEL[status])}">${htmlEsc(REASON_LABEL[status] + day)}</span>`;
  }
  return NOT_STATED_HTML;
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
 * `opts.prefix` is the path from the page to the site root (provider links); `opts.scores` adds the score rows.
 */
export function compareTableHtml(list, opts = {}) {
  const prefix = (opts && opts.prefix) || '';
  const cell = (s) => htmlEsc(s);
  const safeUrl = (u) => (/^https?:\/\//i.test(String(u || '')) ? String(u) : '');
  const fields = [
    ['Type', (p) => cell((p.category === 'ongoing' ? 'Ongoing free tier' : 'Trial credit') + (p.free_type ? ' · ' + p.free_type : ''))],
    ["What's free", (p) => (p.free_tier ? cell(p.free_tier) : NOT_STATED_HTML)],
    ['Rate limits', (p) => (p.rate_limits ? cell(p.rate_limits) : NOT_STATED_HTML)],
    ['Expires', (p) => expiryHtml(p)],
    ['The catch', (p) => (p.notes ? cell(p.notes) : NOT_STATED_HTML)],
    ['Credit card', (p) => triStateHtml(p.card_required, 'required', 'not required', p.field_checks && p.field_checks.card_required)],
    ['Phone verification', (p) => triStateHtml(p.phone_required, 'required', 'not required', p.field_checks && p.field_checks.phone_required)],
    ['Commercial use', (p) => p.commercial_ok === 'conditional'
      ? triStateHtml(p.commercial_ok, 'allowed', 'not allowed (eval only)') +
        (p.commercial_ok_condition ? `<div class="cmp-sub">${cell(p.commercial_ok_condition)}</div>` : '')
      : triStateHtml(p.commercial_ok, 'allowed', 'not allowed (eval only)', p.field_checks && p.field_checks.commercial_ok)],
    ['OpenAI-compatible', (p) => triStateHtml(p.openai_compatible, 'yes', 'no', p.field_checks && p.field_checks.openai_compatible) +
      (p.openai_base_url ? `<div class="cmp-sub"><code>${cell(p.openai_base_url)}</code></div>` : '')],
    // The provider's own speed figures (published_speed, issue #606). Inlined like the rest because this function is shipped to the
    // browser as source text; the signs and units match speedFigure in published-speed.mjs (a test keeps them equal).
    ['Published speed', (p) => {
      const list = Array.isArray(p.published_speed) ? p.published_speed : [];
      if (!list.length) return NOT_STATED_HTML;
      const sign = { exact: '', approx: '~', at_least: '≥', up_to: '≤' };
      const unit = { output_tokens_per_second: 'tok/s', time_to_first_token_ms: 'ms' };
      return list.map((e) => `<div><code>${cell(e.model)}</code> ${cell((sign[e.qualifier] || '') + Number(e.value).toLocaleString('en-US') + ' ' + (unit[e.metric] || ''))}` +
        (safeUrl(e.source) ? ` <a href="${cell(safeUrl(e.source))}" target="_blank" rel="noopener">source</a>` : '') + '</div>').join('') +
        `<div class="cmp-sub">The provider's own ${list.length > 1 ? 'figures' : 'figure'}, checked ${cell([...new Set(list.map((e) => humanDate(e.checked) || e.checked))].join(', '))}; not our measurement and not a like-for-like benchmark</div>`;
    }],
    ['Modalities', (p) => ((p.modalities || []).length ? cell(p.modalities.join(', ')) : NOT_STATED_HTML)],
    ['Free models (sample)', (p) => ((p.models_free && p.models_free.length)
      ? p.models_free.map((m) => `<code>${cell(m)}</code>`).join(' ')
      : NOT_STATED_HTML) +
      (safeUrl(p.models_url) ? `<div class="cmp-sub"><a href="${cell(safeUrl(p.models_url))}" target="_blank" rel="noopener">official catalogue ↗</a></div>` : '')],
    ['Official docs', (p) => safeUrl(p.docs_url)
      ? `<a href="${cell(safeUrl(p.docs_url))}" target="_blank" rel="noopener">${cell(safeUrl(p.docs_url).replace(/^https?:\/\//i, ''))}</a>`
      : NOT_STATED_HTML],
    ['Last verified', (p) => (p.verified && p.last_verified)
      ? `<span class="v ok">${humanDate(p.last_verified) ? `<time datetime="${cell(p.last_verified)}">${humanDate(p.last_verified)}</time>` : cell(p.last_verified)}</span>`
      : '<span class="v warn">unverified</span>'],
  ];
  // With a scores map ({ slug: { total, confirmed, of, rank } }) the table also shows the score and the model quality
  // tier it is built from. Without one (a bare call) the table is the same as before.
  const scores = opts && opts.scores;
  if (scores) {
    const scoreCell = (p) => {
      const sc = scores[p.slug];
      if (!sc) return '<span class="tri tri-unk">not scored</span>';
      return `<strong>${cell(Number(sc.total).toFixed(1))}</strong> / 100` +
        `<div class="cmp-sub">${cell(sc.confirmed)} of ${cell(sc.of)} inputs confirmed · ` +
        (sc.rank ? `<a href="${prefix}best/">#${cell(sc.rank)} in the top 10</a>` : 'not in the top 10') + '</div>';
    };
    const tierCell = (p) => (Number.isInteger(p.model_tier)
      ? `${cell(p.model_tier)} of 4` + (p.model_tier_source && p.model_tier_source.boundary === true ? '<div class="cmp-sub">near a threshold</div>' : '')
      : '<span class="tri tri-unk">not rated</span>');
    fields.unshift(['Score', scoreCell], ['Model quality tier', tierCell]);
  }
  const head = list.map((p) => {
    const name = SLUG_RE.test(String(p.slug || ''))
      ? `<a href="${prefix}p/${p.slug}">${cell(p.name)}</a>`
      : cell(p.name);
    return `<th scope="col">${name}</th>`;
  }).join('');
  const body = fields.map(([label, fn]) =>
    `<tr><th scope="row">${cell(label)}</th>${list.map((p) => `<td>${fn(p)}</td>`).join('')}</tr>`
  ).join('\n');
  // The same scroll region as every other wide table (.table-scroll is positioned, so the screen-reader-only text inside
  // the table is clipped by the region instead of widening the page on a phone), focusable so a keyboard can scroll it.
  return `<div class="table-scroll compare-scroll" role="region" aria-label="Comparison of ${cell(list.map((p) => p.name).join(', '))}" tabindex="0"><table class="compare-table">` +
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
  const NOT_STATED_HTML = ${JSON.stringify(NOT_STATED_HTML)};
  const REASON_LABEL = ${JSON.stringify(REASON_LABEL)};
  const DATE_MONTHS = ${JSON.stringify(DATE_MONTHS)};
  const humanDate = ${humanDate.toString()};
  const triStateHtml = ${triStateHtml.toString()};
  const expiryHtml = ${expiryHtml.toString()};
  const parseCompareSlugs = ${parseCompareSlugs.toString()};
  const compareTableHtml = ${compareTableHtml.toString()};
  return { COMPARE_MIN, COMPARE_MAX, parseCompareSlugs, compareTableHtml };
})();
`;
}
