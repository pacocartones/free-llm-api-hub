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

// «The catch» column: a closed vocabulary of short tags derived from fields the record already has (the three requirements, the
// expiry and a published daily cap). The free text of the record (`notes`) stays on the provider page, reachable by the link of the
// cell and by the title of the cell. The list below is the whole vocabulary; a test fails if a tag outside it appears.
export const CATCH_LABELS = ['Card required', 'Phone required', 'Evaluation only', 'Conditional', 'Expires', 'Daily cap', 'Not stated'];

/** @returns {{label: string, title: string}[]} */
export function catchTags(p) {
  const tags = [];
  if (p.card_required === true) tags.push({ label: 'Card required', title: 'A credit card is required to sign up' });
  if (p.phone_required === true) tags.push({ label: 'Phone required', title: 'Phone verification is required' });
  if (p.commercial_ok === false) tags.push({ label: 'Evaluation only', title: 'Commercial use is not allowed' });
  if (p.commercial_ok === 'conditional') tags.push({
    label: 'Conditional',
    title: `Commercial use is conditional${p.commercial_ok_condition ? ': ' + p.commercial_ok_condition : ''}`,
  });
  if (p.expires) tags.push({ label: 'Expires', title: 'Expires: ' + p.expires });
  const fl = p.free_limits || {};
  const caps = [];
  if (Number.isInteger(fl.requests_per_day)) caps.push(fl.requests_per_day.toLocaleString('en-US') + ' requests per day');
  if (Number.isInteger(fl.tokens_per_day)) caps.push(fl.tokens_per_day.toLocaleString('en-US') + ' tokens per day');
  if (caps.length) tags.push({ label: 'Daily cap', title: 'Published daily cap: ' + caps.join(' and ') });
  if (p.card_required == null || p.phone_required == null || p.commercial_ok == null) tags.push({ label: 'Not stated', title: 'At least one requirement is not stated' });
  return tags;
}

/** The whole «The catch» cell. */
export function catchCellHtml(p) {
  const chips = catchTags(p).map((t) => `<span class="catch-tag" title="${htmlEsc(t.title)}">${htmlEsc(t.label)}</span>`).join('');
  const more = SLUG_RE.test(String(p.slug || '')) ? `<a class="catch-more" href="p/${p.slug}#limits">Details<span class="sr-only"> of ${htmlEsc(p.name)}</span></a>` : '';
  return `<td class="notes" role="cell" data-label="The catch"${p.notes ? ` title="${htmlEsc(p.notes)}"` : ''}>${chips}${more}</td>`;
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

  let name = SLUG_RE.test(String(p.slug || ''))
    ? `<a class="name-link" href="p/${p.slug}">${htmlEsc(p.name)}<span class="name-go" aria-hidden="true"> ↗</span></a>`
    : htmlEsc(p.name);
  if (isNew) name += ` <span class="badge b-new" title="Recently added to the hub">NEW</span>`;
  if (p.best_for) name += `<div class="best" title="${htmlEsc(p.best_for)}">${htmlEsc(p.best_for)}</div>`;

  const typeCell =
    `<span class="badge ${p.category === 'ongoing' ? 'b-ongoing' : 'b-trial'}">${p.category === 'ongoing' ? 'Ongoing' : 'Trial'}</span>` +
    // The four production flags (lib/flags.mjs) in their fixed order, each with its shape; then the other
    // icons of FLAG_PAIRS that are not one of those four (today: OpenAI-compatible).
    `<div class="fmini">${flagsHtml(p, { mini: true })}${FLAG_PAIRS.filter(([k, v]) => p[k] === v && !FLAG_DEFS.some((d) => d.field === k))
      .map(([, , ic, t]) => `<span class="fmini-i" role="img" title="${t}" aria-label="${t}">${ICON(ic)}</span>`)
      .join('')}</div>`;

  // Verified: the compact receipt, the pill (lib/stamp.mjs), dated, linked to the page the entry was checked on, the quote in its title.
  const v = p.verified && p.last_verified
    ? `<span class="ver-cell">${stampHtml(p, { now: nowMs, shape: 'pill' })}</span>`
    : `<span class="badge b-warn">${ICON('ic-warn')} unverified</span>`;

  // Explicit row/cell roles: on a phone the stylesheet turns the table into cards (display: block), which makes some
  // screen readers (VoiceOver on iOS, some Chromium versions) drop the implicit table semantics. See styles.css.
  // The provider's aura (lib/aura.mjs) leads the name: decorative here (its meaning is in the title and on the provider page).
  return `<tr role="row">` +
    `<td class="name" role="cell" data-label="API"><span class="name-row">${auraHtml(p, { now: nowMs, cls: 'aura-sm' })}<span class="name-main">${name}</span></span></td>` +
    `<td role="cell" data-label="Type">${typeCell}</td>` +
    `<td role="cell" data-label="What's free"><div class="clamp2" title="${htmlEsc(p.free_tier)}">${htmlEsc(p.free_tier)}</div></td>` +
    catchCellHtml(p) +
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

// FLAG_PAIRS + freshnessStatus are referenced by name inside explorerRowHtml so
// the serialised copy (shared-rows.js) can pick them up from window.FLLM_RULES;
// importing them here keeps the same names in scope for the server render.
import { FLAG_PAIRS, freshnessStatus } from './rules.mjs';
import { FLAG_DEFS, FLAG_MARKS, FLAG_UNKNOWN_WHY, flagValue, flagState, flagText, flagHtml, flagsHtml } from './flags.mjs';
import { AURA_ORDER, AURA_OLD_DAYS, AURA_NAMES, AURA_GEOMETRY, auraRng, auraSpec, auraPaths, auraHtml } from './aura.mjs';
import { STAMP_MONTHS, STAMP_WORDS, stampDate, stampState, stampHtml } from './stamp.mjs';

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
  const { FLAG_PAIRS, freshnessStatus } = window.FLLM_RULES;
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
  const STAMP_MONTHS = ${JSON.stringify(STAMP_MONTHS)};
  const STAMP_WORDS = ${JSON.stringify(STAMP_WORDS)};
  const stampDate = ${stampDate.toString()};
  const stampState = ${stampState.toString()};
  const stampHtml = ${stampHtml.toString()};
  const rowHtml = ${explorerRowHtml.toString()};
  const catchTags = ${catchTags.toString()};
  const catchCellHtml = ${catchCellHtml.toString()};
  const rowKeyTarget = ${rowKeyTarget.toString()};
  return { rowHtml, rowKeyTarget, flagHtml, flagsHtml, auraHtml, stampHtml };
})();
`;
}
