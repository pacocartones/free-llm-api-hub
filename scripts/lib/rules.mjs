// Single source of truth for the two rules shared between the server-side build
// (scripts/build.mjs, which renders the homepage table) and the client explorer
// (site/explorer.js, which repaints it). Keeping one copy is the whole point:
// if these drift, the server ships one table order and the browser repaints
// another the instant it loads, and the table visibly jumps.
//
// build.mjs consumes these directly AND serialises them into site/shared-rules.js
// (a generated classic script exposing window.FLLM_RULES) for the browser.
// Never hand-edit site/shared-rules.js.

// "Recommended" order: float the most accessible, ship-ready providers to the top.
export function recScore(p) {
  let s = 0;
  if (p.card_required === false) s += 3;
  if (p.phone_required === false) s += 2;
  if (p.commercial_ok === true) s += 2; else if (p.commercial_ok === false) s -= 2;
  if (p.openai_compatible === true) s += 1;
  if (p.category === 'ongoing') s += 1;
  if (p.free_type === 'perpetual') s += 1;
  return s;
}

// [field, value, icon-id, label] — the access-flag pills in the Type column.
export const FLAG_PAIRS = [
  ['card_required', false, 'ic-nocard', 'no card'], ['card_required', true, 'ic-card', 'card'],
  ['phone_required', false, 'ic-nophone', 'no phone'], ['phone_required', true, 'ic-phone', 'phone'],
  ['commercial_ok', true, 'ic-building', 'commercial'], ['commercial_ok', false, 'ic-flask', 'eval only'],
  ['openai_compatible', true, 'ic-code', 'OpenAI-compat'],
];
