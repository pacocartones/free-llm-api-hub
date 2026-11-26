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

// The local name stays htmlEsc: clientBundle() serialises rowHtml & co. with toString(), and their bodies call it by that name.
import { escapeHtml as htmlEsc } from './html.mjs';

export const ICON = (id) => `<svg class="i" aria-hidden="true"><use href="#${id}"/></svg>`;

// slugs are kebab-case identifiers, enforced by data/schema.json in CI; re-check
// here because the client fetch path bypasses that guarantee.
export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// «Needs / unknown» column: in words, only what a provider requires (or restricts) and which of the four production flags are
// unknown. Nothing else: the free text of the record (`notes`) stays on the provider page, reachable by the name link and by the
// title of the cell. A provider with nothing required and nothing unknown says so ("Nothing required"). The two vocabularies
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

/** The whole «Needs / unknown» cell. */
export function needsCellHtml(p) {
  const { needs, unknown } = needsOf(p);
  const cond = p.commercial_ok === 'conditional' && p.commercial_ok_condition ? 'Commercial use conditional: ' + p.commercial_ok_condition : '';
  const tip = [cond, p.notes].filter(Boolean).join(' — ');
  let inner = '';
  if (needs.length) inner += `<span class="need-req">${htmlEsc(needs.join(', '))}</span>`;
  if (unknown.length) inner += `<span class="need-unk">Unknown: ${htmlEsc(unknown.join(', '))}</span>`;
  if (!inner) inner = '<span class="need-none">Nothing required</span>';
  return `<td class="needs" role="cell" data-label="Needs / unknown"${tip ? ` title="${htmlEsc(tip)}"` : ''}><div class="clamp2">${inner}</div></td>`;
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

  let v;
  if (p.verified) {
    const date = htmlEsc(p.last_verified || '');
    const age = p.last_verified ? Math.floor((nowMs - Date.parse(p.last_verified + 'T00:00:00Z')) / 86400000) : null;
    const st = freshnessStatus(age);
    const cls = st === 'stale' ? 'b-stale' : st === 'due' ? 'b-warn' : 'b-ok';
    const tip = age != null ? ` title="Verified ${age}d ago · ${date}"` : '';
    // The state is said in words (and by the icon shape), not only by colour and a title.
    const word = st === 'stale' ? 'Verified, stale: re-check overdue' : st === 'due' ? 'Verified, due for re-check' : 'Verified, fresh';
    v = `<span class="ver-cell"><span class="badge ${cls}"${tip}>${ICON(st === 'fresh' ? 'ic-check' : 'ic-warn')}<span class="sr-only">${word}</span></span><span class="ver-date">${date}</span></span>`;
  } else {
    v = `<span class="badge b-warn">${ICON('ic-warn')} unverified</span>`;
  }

  // Explicit row/cell roles: on a phone the stylesheet turns the table into cards (display: block), which makes some
  // screen readers (VoiceOver on iOS, some Chromium versions) drop the implicit table semantics. See styles.css.
  return `<tr role="row">` +
    `<td class="name" role="cell" data-label="API">${name}</td>` +
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

// freshnessStatus is referenced by name inside explorerRowHtml so the serialised
// copy (shared-rows.js) can pick it up from window.FLLM_RULES; importing it here
// keeps the same name in scope for the server render.
import { freshnessStatus } from './rules.mjs';

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
  const rowHtml = ${explorerRowHtml.toString()};
  const needsOf = ${needsOf.toString()};
  const needsCellHtml = ${needsCellHtml.toString()};
  const rowKeyTarget = ${rowKeyTarget.toString()};
  return { rowHtml, rowKeyTarget, needsOf };
})();
`;
}
