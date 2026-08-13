// Single source of truth for the rules that more than one place needs.
//
// Two audiences:
//   - the ranking rules (recScore, FLAG_PAIRS) are shared between the server-side
//     build (scripts/build.mjs, which renders the homepage table) and the client
//     explorer (site/explorer.js, which repaints it). Keeping one copy is the whole
//     point: if these drift, the server ships one table order and the browser
//     repaints another the instant it loads, and the table visibly jumps.
//   - the freshness SLA (SLA_DAYS, DUE_SOON_DAYS and the badge derived from them)
//     is shared between scripts/build.mjs and scripts/staleness.mjs. They used to
//     keep separate copies of the same numbers; a drift there would have the badge
//     call an entry fresh while the worklist called it overdue.
//
// build.mjs consumes these directly AND serialises recScore + FLAG_PAIRS into
// site/shared-rules.js (a generated classic script exposing window.FLLM_RULES)
// for the browser. Never hand-edit site/shared-rules.js.

// "Recommended" order: float the most accessible, ship-ready providers to the top.
//
// Every flag scores symmetrically: a confirmed `false` earns points, a confirmed
// `true` loses the same points, and `null` (not confirmed) scores zero and sits
// between the two. An unknown must never be worth as much as a confirmed "no
// card required", nor as little as a confirmed "card required" — the tri-state is
// the product, so the ranking has to respect all three states.
export function recScore(p) {
  let s = 0;
  if (p.card_required === false) s += 3; else if (p.card_required === true) s -= 3;
  if (p.phone_required === false) s += 2; else if (p.phone_required === true) s -= 2;
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

// ---------- the freshness SLA ----------
export const SLA_DAYS = 90; // an entry older than this has breached the SLA
export const DUE_SOON_DAYS = 60; // ...and is due for re-verification before that

/** Whole days between an ISO `YYYY-MM-DD` verification date and now. `null` if unparseable. */
export const ageInDays = (isoDate, now = new Date()) => {
  const d = new Date(String(isoDate) + 'T00:00:00Z');
  return Number.isNaN(+d) ? null : Math.floor((now - d) / 86400000);
};

/** One age → one bucket: 'fresh' / 'due' / 'stale'. Single source that the badge
 * colour and the worklist both grade on, so they can never disagree on an entry's
 * state. A never-verified entry is treated as 'due' (it needs attention). */
export function freshnessStatus(age) {
  if (age === null || age === undefined) return 'due'; // never verified
  if (age > SLA_DAYS) return 'stale';
  if (age > DUE_SOON_DAYS) return 'due';
  return 'fresh';
}

/** The colour one age maps to. Same three buckets as freshnessStatus. */
export function freshnessColor(age) {
  const status = freshnessStatus(age);
  if (status === 'stale') return 'red';
  if (status === 'due') return 'yellow';
  return 'brightgreen';
}

/**
 * The repo-wide freshness badge, derived from the data.
 *
 * It is graded on the OLDEST verified entry, not on the share of entries inside
 * the SLA. The share was unusable as a signal: with the list re-verified in
 * sweeps, "N/N verified <90d" only left brightgreen after ~4 months of total
 * silence, so it measured whether the project was dead rather than whether the
 * data was fresh. The worst entry moves the day maintenance stops, and it is
 * also the number a reader actually needs — the staleness of the row they are
 * about to trust. Buckets are the worklist's own: >60d due soon, >90d overdue.
 *
 * Coverage still counts: a dataset where under 70% of rows are verified at all
 * cannot show brightgreen, however recent those verifications are.
 */
export function freshnessBadge(providers, now = new Date()) {
  const total = providers.length;
  const ages = providers
    .filter((p) => p.verified && p.last_verified)
    .map((p) => ageInDays(p.last_verified, now))
    .filter((a) => a !== null)
    .sort((a, b) => a - b);

  const verifiedCount = ages.length;
  const oldest = verifiedCount ? ages[verifiedCount - 1] : null;
  const median = verifiedCount ? ages[Math.floor((verifiedCount - 1) / 2)] : null;
  const coverage = total ? verifiedCount / total : 0;

  const ageColor = verifiedCount ? freshnessColor(oldest) : 'red';
  const color = ageColor === 'brightgreen' && coverage < 0.7 ? 'yellow' : ageColor;

  const message = verifiedCount
    ? `${verifiedCount}/${total} verified · oldest ${oldest}d`
    : `0/${total} verified`;

  return { badge: { schemaVersion: 1, label: 'freshness', message, color }, verifiedCount, oldest, median, coverage };
}
