// flags.mjs — the one `flag` component for the four production flags, in a fixed order:
// Card · Phone · Commercial · Training on prompts.
//
// Each value is drawn with a SHAPE as well as a colour, so the state never rests on colour alone (WCAG 1.4.1):
//   ✓  the favourable answer (no card, no phone, commercial use allowed, does not train on prompts)
//   ✕  the unfavourable answer
//   ~  commercial use is conditional
//   ?  unknown: null or absent. Drawn with a dashed border. Unknown is the dataset's core idea:
//      null means nobody has confirmed the field, never "no".
// Each flag also carries its whole meaning as text for screen readers and as a tooltip, for example
// "Card required: unknown — not stated in the provider's docs".
//
// Like rows.mjs, this module is shipped to the browser as source text (rows.clientBundle serialises these
// functions into site/shared-rows.js), so the explorer's server render and its client repaint run the same
// code. Keep the functions self-contained: they may only use htmlEsc, ICON and the constants below.

import { htmlEsc, ICON } from './rows.mjs';

/**
 * The four flags, in display order. `field` is a dotted path into the provider record; `good` is the value
 * that counts as favourable. `short` is the visible label, phrased so that ✓ reads as "this holds".
 */
export const FLAG_DEFS = [
  { id: 'card', field: 'card_required', name: 'Card required', short: 'No card', icon: 'ic-card', good: false },
  { id: 'phone', field: 'phone_required', name: 'Phone required', short: 'No phone', icon: 'ic-phone', good: false },
  { id: 'commercial', field: 'commercial_ok', name: 'Commercial use allowed', short: 'Commercial', icon: 'ic-building', good: true },
  { id: 'training', field: 'data_policy.trains_on_prompts', name: 'Trains on prompts', short: 'No training', icon: 'ic-shield', good: false },
];

/**
 * The two terms flags (dataset 2.16.0), shown on provider pages only, after the production flags. `good` is false:
 * ✓ when an official page allows it, ✕ when it is forbidden, ~ when the ban is conditional, ? when the terms are silent.
 * They are not part of FLAG_DEFS, so the explorer keeps its four flags.
 */
export const TERMS_FLAG_DEFS = [
  { id: 'multi-account', field: 'multi_account_forbidden', name: 'Several accounts per person forbidden', short: 'One account', icon: 'ic-grid', good: false },
  { id: 'limit-circumvention', field: 'limit_circumvention_forbidden', name: 'Getting around limits forbidden', short: 'Limits', icon: 'ic-gauge', good: false },
];

/** The shape of each state; the CSS colours it (.pflag-ok, .pflag-bad, .pflag-cond, .pflag-unk). */
export const FLAG_MARKS = { ok: '✓', bad: '✕', cond: '~', unk: '?' };

/** The words for an unknown value, by field_checks status (REASON_LABEL in field-checks.mjs says the same). */
export const FLAG_UNKNOWN_WHY = {
  source_silent: "not stated in the provider's docs",
  needs_account: 'needs an account to check',
  sources_disagree: "the provider's pages disagree",
  '': "not confirmed in the provider's docs yet",
};

/** The raw value of a flag in a record (undefined when absent). */
export function flagValue(def, p) {
  return String(def.field).split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), p);
}

/** 'ok' | 'bad' | 'cond' | 'unk' for a raw value. Anything that is not a confirmed boolean or 'conditional' is unknown. */
export function flagState(def, v) {
  if (v === true || v === false) return v === def.good ? 'ok' : 'bad';
  if (v === 'conditional') return 'cond';
  return 'unk';
}

/**
 * The accessible sentence of a flag: "Card required: no", "Commercial use allowed: conditional",
 * "Card required: unknown — not stated in the provider's docs". `check` is the field_checks entry, if any.
 */
export function flagText(def, v, check) {
  const st = flagState(def, v);
  if (st === 'cond') return def.name + ': conditional';
  if (st !== 'unk') return def.name + ': ' + (v ? 'yes' : 'no');
  const status = check && typeof check === 'object' && Object.prototype.hasOwnProperty.call(FLAG_UNKNOWN_WHY, String(check.status)) ? String(check.status) : '';
  return def.name + ': unknown — ' + FLAG_UNKNOWN_WHY[status];
}

/**
 * One flag as HTML. The mark and the visible part are aria-hidden; the sentence is the accessible text.
 *   opts.mini    — the explorer form: the flag's icon then the mark (the sentence stays as tooltip and sr-only text)
 *   opts.visible — HTML for the visible words (the provider page passes its own wording); default: the short label
 *   opts.check   — the field_checks entry, which names the reason of an unknown
 */
export function flagHtml(def, p, opts) {
  const o = opts || {};
  const v = flagValue(def, p);
  const st = flagState(def, v);
  const text = htmlEsc(flagText(def, v, o.check));
  const mark = `<span class="pflag-mark" aria-hidden="true">${FLAG_MARKS[st]}</span>`;
  const vis = o.mini ? ICON(def.icon) : `<span class="pflag-vis" aria-hidden="true">${o.visible != null ? o.visible : htmlEsc(def.short)}</span>`;
  return `<span class="pflag pflag-${st}${o.mini ? ' pflag-mini' : ''}" data-flag="${def.id}" title="${text}">` +
    (o.mini ? vis + mark : mark + vis) + `<span class="sr-only">${text}</span></span>`;
}

/** The four flags, in their fixed order. */
export function flagsHtml(p, opts) {
  return `<span class="pflags">${FLAG_DEFS.map((d) => flagHtml(d, p, opts)).join('')}</span>`;
}
