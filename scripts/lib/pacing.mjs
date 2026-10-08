// Weekly re-verification pacing for the freshness SLA.
//
// Every verified entry must be re-checked before it is SLA days old. The
// worklist proposes one batch a week, oldest verification first. This module
// decides how big that batch is, so that if every weekly batch is done:
//   - no entry ever crosses the SLA, and
//   - a cohort verified on one day (2026-11-12 had 44 such entries;
//     2027-01-06 would have had 64) is spread over the weeks before its
//     deadline instead of landing in a single week.
// Entries younger than MIN_AGE_DAYS are not proposed (re-checking a page
// verified last week wastes work), unless keeping the SLA requires it.
//
// The size is found by simulation: starting from the steady state (every
// entry spread over the SLA window), try each size up to the cap and keep the
// smallest one for which two SLA cycles of weekly batches leave no entry
// overdue. If even the cap is not enough, the result says so.

export const WEEKLY_CAP = 11;
export const MIN_AGE_DAYS = 28;

function keepsSla(ages, slaDays, size, minAge) {
  const a = [...ages];
  const weeks = Math.ceil((2 * slaDays) / 7);
  for (let w = 0; w < weeks; w++) {
    // This week's batch: forced entries (would be overdue before next week),
    // then the oldest of those old enough to be worth re-checking.
    const order = a.map((age, i) => ({ age, i })).sort((x, y) => y.age - x.age);
    const forced = order.filter((e) => e.age + 7 > slaDays);
    if (forced.length > size) return false;
    const rest = order.filter((e) => e.age + 7 <= slaDays && e.age >= minAge);
    for (const e of [...forced, ...rest].slice(0, size)) a[e.i] = 0;
    for (let i = 0; i < a.length; i++) a[i] += 7;
    if (a.some((age) => age > slaDays)) return false;
  }
  return true;
}

/**
 * @param {number[]} ages days since last_verified, one per verified entry
 * @param {number} slaDays freshness SLA in days
 * @param {{ cap?: number, minAge?: number }} [opts]
 * @returns {{ steady: number, size: number, capped: boolean }}
 */
export function weeklyPacing(ages, slaDays, { cap = WEEKLY_CAP, minAge = MIN_AGE_DAYS } = {}) {
  if (!ages.length) return { steady: 0, size: 0, capped: false };
  const steady = Math.min(cap, Math.ceil(ages.length / (slaDays / 7)));
  for (let size = steady; size <= cap; size++) {
    if (keepsSla(ages, slaDays, size, minAge)) return { steady, size, capped: false };
  }
  return { steady, size: cap, capped: true };
}

/** The entries to propose this week, oldest first, given the pacing size. */
export function weeklyBatch(entries, ageOf, slaDays, size, minAge = MIN_AGE_DAYS) {
  const sorted = [...entries].sort((x, y) => ageOf(y) - ageOf(x));
  const forced = sorted.filter((e) => ageOf(e) + 7 > slaDays);
  const rest = sorted.filter((e) => ageOf(e) + 7 <= slaDays && ageOf(e) >= minAge);
  return [...forced, ...rest].slice(0, size);
}
