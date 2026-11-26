// rows.mjs — single source of truth for the homepage explorer rows.
//
// Two audiences, one function:
//   - scripts/build.mjs server-renders the home table with it (SEO + no-JS).
//   - site/explorer.js repaints the table with it (loaded as the generated
//     site/shared-rows.js, which serialises htmlEsc / ICON / SLUG_RE / rowHtml
//     the same way shared-rules.js serialises recScore).
//
// This is the whole point: if SSR and client ever keep their own row code, the
// server ships one structure and the browser repaints another the instant it
// loads — a visible jump (or a divergence like the date column colliding with
// the subtitle line). Keep row markup here, never in build.mjs or explorer.js.
//
// Provider fields come from providers.json, which community PRs can edit —
// treat every field as untrusted: htmlEsc before it reaches innerHTML, and the
// slug goes into an href only after SLUG_RE confirms it is kebab-case.

export const htmlEsc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

export const ICON = (id) => `<svg class="i" aria-hidden="true"><use href="#${id}"/></svg>`;

// slugs are kebab-case identifiers, enforced by data/schema.json in CI; re-check
// here because the client fetch path bypasses that guarantee.
export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// «Needs / not stated» column: in words, only what a provider requires (or restricts) and which of the four production flags are
// not stated (not-stated.mjs). Nothing else: the free text of the record (`notes`) stays on the provider page, reachable by the
// name link and by the title of the cell. A provider with nothing required and nothing unstated says so ("Nothing required"). The two vocabularies
// below are the whole set of phrases; a test fails if another one appears.
export const NEED_LABELS = ['Card required', 'Phone required', 'Non-commercial only', 'Commercial use conditional', 'Trains on prompts'];
export const UNKNOWN_LABELS = ['card', 'phone', 'commercial use', 'training'];

/** @returns {{needs: string[], unknown: string[]}} */
export function needsOf(p) {
  const needs = [], unknown = [];
  const dp = p && p.data_policy && typeof p.data_policy === 'object' ? p.data_policy : {};
  if (p.card_required === true) needs.push('Card required');
  else if (p.card_required !== false) unknown.push('card');
  if (p.phone_required === true) needs.push('Phone required');
  else if (p.phone_required !== false) unknown.push('phone');
  if (p.commercial_ok === false) needs.push('Non-commercial only');
  else if (p.commercial_ok === 'conditional') needs.push('Commercial use conditional');
  else if (p.commercial_ok !== true) unknown.push('commercial use');
  if (dp.trains_on_prompts === true) needs.push('Trains on prompts');
  else if (dp.trains_on_prompts !== false) unknown.push('training');
  return { needs, unknown };
}

/** The whole «Needs / not stated» cell. */
export function needsCellHtml(p) {
  const { needs, unknown } = needsOf(p);
  const cond = p.commercial_ok === 'conditional' && p.commercial_ok_condition ? 'Commercial use conditional: ' + p.commercial_ok_condition : '';
  const tip = [cond, p.notes].filter(Boolean).join(' — ');
  let inner = '';
  if (needs.length) inner += `<span class="need-req">${htmlEsc(needs.join(', '))}</span>`;
  if (unknown.length) inner += `<span class="need-unk">Not stated: ${htmlEsc(unknown.join(', '))}</span>`;
  if (!inner) inner = '<span class="need-none">Nothing required</span>';
  return `<td class="needs" role="cell" data-label="Needs / not stated"${tip ? ` title="${htmlEsc(tip)}"` : ''}><div class="clamp2">${inner}</div></td>`;
}

/**
 * One explorer `<tr>`, identical server- and client-side.
 *
 * `opts.now` is the reference instant for the freshness colour and the "NEW"
 * badge. The build passes a stable date (`data.generated`) so the server render
 * is deterministic and the drift gate never trips on a calendar boundary; the
 * client passes `Date.now()` so visitors see live freshness.
 */
export function explorerRowHtml(p, opts = {}) {
  const now = (opts && opts.now) || null;
  const nowMs = now
    ? (typeof now === 'string' ? Date.parse(now + 'T00:00:00Z') : now instanceof Date ? now.getTime() : Number(now))
    : Date.now();
  const isNew = p.added && (nowMs - Date.parse(p.added + 'T00:00:00Z')) / 86400000 <= 45;

  const type = p.category === 'ongoing'
    ? '<span class="badge b-ongoing" title="An ongoing free tier: no end date">Ongoing</span>'
    : '<span class="badge b-trial" title="A trial credit: a one-time amount or a limited period">Trial</span>';
  let name = SLUG_RE.test(String(p.slug || ''))
    ? `<a class="name-link" href="p/${p.slug}" title="${htmlEsc(p.name)}">${htmlEsc(p.name)}</a>`
    : htmlEsc(p.name);
  name = `<div class="name-line">${name} ${type}${isNew ? ' <span class="badge b-new" title="Recently added to the hub">NEW</span>' : ''}</div>`;
  if (p.best_for) name += `<div class="best" title="${htmlEsc(p.best_for)}">${htmlEsc(p.best_for)}</div>`;

  // Verified: the compact receipt, the pill (lib/stamp.mjs), dated, linked to the page the entry was checked on, the quote in its title.
  const v = p.verified && p.last_verified
    ? `<span class="ver-cell">${stampHtml(p, { now: nowMs, shape: 'pill' })}</span>`
    : `<span class="badge b-warn">${ICON('ic-warn')} unverified</span>`;

  // Explicit row/cell roles: on a phone the stylesheet turns the table into cards (display: block), which makes some
  // screen readers (VoiceOver on iOS, some Chromium versions) drop the implicit table semantics. See styles.css.
  // The provider's aura (lib/aura.mjs) leads the name: decorative here (its meaning is in the title and on the provider page).
  return `<tr role="row">` +
    `<td class="name" role="cell" data-label="API"><div class="name-row">${auraHtml(p, { now: nowMs, cls: 'aura-sm' })}<div class="name-main">${name}</div></div></td>` +
    `<td class="free" role="cell" data-label="What's free"><div class="clamp2" title="${htmlEsc(p.free_tier)}">${htmlEsc(p.free_tier)}</div></td>` +
    needsCellHtml(p) +
    `<td class="pver" role="cell" data-label="Verified">${v}</td></tr>`;
}

/**
 * Keyboard navigation over the explorer rows (#174): the row index a key moves
 * focus to, or null when the key is not a row-navigation key or would leave the
 * table (so the browser keeps its default, e.g. scrolling the page past the
 * last row — never a keyboard trap). `index` is the focused row (-1 for none),
 * `count` the number of rows. Enter is handled by the caller (it follows the
 * row's provider link), so it is not a movement key here.
 */
export function rowKeyTarget(key, index, count) {
  if (!(count > 0)) return null;
  const i = Number.isInteger(index) && index >= 0 && index < count ? index : -1;
  if (key === 'ArrowDown') return i < 0 ? 0 : (i + 1 < count ? i + 1 : null);
  if (key === 'ArrowUp') return i < 0 ? count - 1 : (i > 0 ? i - 1 : null);
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}

// freshnessStatus is referenced by name inside the stamp helpers so the serialised
// copy (shared-rows.js) can pick it up from window.FLLM_RULES; importing it here
// keeps the same name in scope for the server render.
import { freshnessStatus } from './rules.mjs';
import { FLAG_DEFS, FLAG_MARKS, FLAG_UNKNOWN_WHY, flagValue, flagState, flagText, flagHtml, flagsHtml } from './flags.mjs';
import { AURA_ORDER, AURA_OLD_DAYS, AURA_NAMES, AURA_GEOMETRY, auraRng, auraSpec, auraPaths, auraHtml } from './aura.mjs';
import { STAMP_WORDS, stampState, stampHtml } from './stamp.mjs';
import { DATE_MONTHS, humanDate } from './dates.mjs';

/**
 * The exact client bundle the browser runs (written to site/shared-rows.js by
 * build.mjs). Serialising here — next to the code it ships — means build.mjs and
 * explorer.test.mjs both consume the same string: the build writes it, the test
 * executes it, and neither can drift from the module. This is also why the test
 * suite needs no generated file on disk: it imports this function directly.
 */
export function clientBundle() {
  return `// AUTO-GENERATED by scripts/build.mjs from scripts/lib/rows.mjs — do not edit.
window.FLLM_ROWS = (function () {
  const { freshnessStatus } = window.FLLM_RULES;
  const htmlEsc = ${htmlEsc.toString()};
  const ICON = ${ICON.toString()};
  const SLUG_RE = ${SLUG_RE.toString()};
  const FLAG_DEFS = ${JSON.stringify(FLAG_DEFS)};
  const FLAG_MARKS = ${JSON.stringify(FLAG_MARKS)};
  const FLAG_UNKNOWN_WHY = ${JSON.stringify(FLAG_UNKNOWN_WHY)};
  const flagValue = ${flagValue.toString()};
  const flagState = ${flagState.toString()};
  const flagText = ${flagText.toString()};
  const flagHtml = ${flagHtml.toString()};
  const flagsHtml = ${flagsHtml.toString()};
  const AURA_ORDER = ${JSON.stringify(AURA_ORDER)};
  const AURA_OLD_DAYS = ${AURA_OLD_DAYS};
  const AURA_NAMES = ${JSON.stringify(AURA_NAMES)};
  const AURA_GEOMETRY = ${JSON.stringify(AURA_GEOMETRY)};
  const auraRng = ${auraRng.toString()};
  const auraSpec = ${auraSpec.toString()};
  const auraPaths = ${auraPaths.toString()};
  const auraHtml = ${auraHtml.toString()};
  const DATE_MONTHS = ${JSON.stringify(DATE_MONTHS)};
  const humanDate = ${humanDate.toString()};
  const STAMP_WORDS = ${JSON.stringify(STAMP_WORDS)};
  const stampState = ${stampState.toString()};
  const stampHtml = ${stampHtml.toString()};
  const rowHtml = ${explorerRowHtml.toString()};
  const needsOf = ${needsOf.toString()};
  const needsCellHtml = ${needsCellHtml.toString()};
  const rowKeyTarget = ${rowKeyTarget.toString()};
  return { rowHtml, rowKeyTarget, needsOf, flagHtml, flagsHtml, auraHtml, stampHtml };
})();
`;
}
