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

import { DUE_SOON_DAYS } from './rules.mjs';
import { CLUSTER_LIMIT } from './freshness-histogram.mjs';

export const WEEKLY_CAP = 11;
export const MIN_AGE_DAYS = 28;

function keepsSla(ages, slaDays, size, minAge, pull) {
  const a = [...ages];
  const weeks = Math.ceil((2 * slaDays) / 7);
  for (let w = 0; w < weeks; w++) {
    // This week's batch: forced entries (would be overdue before next week),
    // then the oldest of those old enough to be worth re-checking.
    const order = a.map((age, i) => ({ age, i })).sort((x, y) => y.age - x.age);
    const forced = order.filter((e) => e.age + 7 > slaDays);
    if (forced.length > size) return false;
    const min = pull ? Math.min(minAge, clusterPullAge(a)) : minAge;
    const rest = order.filter((e) => e.age + 7 <= slaDays && e.age >= min);
    for (const e of [...forced, ...rest].slice(0, size)) a[e.i] = 0;
    for (let i = 0; i < a.length; i++) a[i] += 7;
    if (a.some((age) => age > slaDays)) return false;
  }
  return true;
}

/**
 * @param {number[]} ages days since last_verified, one per verified entry
 * @param {number} slaDays freshness SLA in days
 * @param {{ cap?: number, minAge?: number, pull?: boolean }} [opts] pull: simulate the
 *   cluster pull-forward of weeklyPlan (entries due in a clustered week may go early)
 * @returns {{ steady: number, size: number, capped: boolean }}
 */
export function weeklyPacing(ages, slaDays, { cap = WEEKLY_CAP, minAge = MIN_AGE_DAYS, pull = false } = {}) {
  if (!ages.length) return { steady: 0, size: 0, capped: false };
  const steady = Math.min(cap, Math.ceil(ages.length / (slaDays / 7)));
  for (let size = steady; size <= cap; size++) {
    if (keepsSla(ages, slaDays, size, minAge, pull)) return { steady, size, capped: false };
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

// ---------- Approved pace and cluster pull-forward ----------
//
// The SLA-only size above lets a same-day cohort sit untouched until it is
// MIN_AGE_DAYS old and then trickle out just inside the 90-day SLA, which still
// turns the badge yellow (it follows the oldest entry, `due` from day 61). The
// approved plan (December 2026) is a steady pace of PACE_FLOOR re-verifications a
// week, reviewed as one batch, so the size never drops below it. And while
// some coming week has more than CLUSTER_LIMIT entries reaching day 61, entries
// due no later than that week may be pulled forward before MIN_AGE_DAYS (but
// never younger than MIN_PULL_AGE), oldest first. Taking the oldest each week
// at a constant pace is what turns a one-day cohort into one week of
// verifications per batch, so no future week inherits a cliff.


export const PACE_FLOOR = 6;
export const MIN_PULL_AGE = 7;

/**
 * The youngest age that may be pulled forward because of a cluster, or
 * Infinity when no coming week is over the limit. Weeks are 7-day windows from
 * today (the worklist runs on Mondays, so they match ISO weeks there).
 */
export function clusterPullAge(ages, { limit = CLUSTER_LIMIT, minPullAge = MIN_PULL_AGE } = {}) {
  const dueAt = DUE_SOON_DAYS + 1;
  const counts = new Map();
  for (const age of ages) {
    if (!Number.isFinite(age) || age >= dueAt || age < 0) continue;
    const k = Math.floor((dueAt - age) / 7);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  let last = -1;
  for (const [k, n] of counts) if (n > limit && k > last) last = k;
  if (last < 0) return Infinity;
  // Due within the last clustered window: dueAt - age < 7 * (last + 1).
  return Math.max(minPullAge, dueAt - 7 * (last + 1) + 1);
}

/**
 * This week's plan: size, minimum age and the batch, oldest first, ties by
 * `keyOf` so the result does not depend on input order.
 * @returns {{ steady: number, size: number, capped: boolean, minAge: number, pulling: boolean, batch: object[] }}
 */
export function weeklyPlan(entries, ageOf, slaDays, { cap = WEEKLY_CAP, floor = PACE_FLOOR, keyOf = (e) => String(e?.slug ?? '') } = {}) {
  const ordered = [...entries].sort((x, y) => ageOf(y) - ageOf(x) || (keyOf(x) < keyOf(y) ? -1 : keyOf(x) > keyOf(y) ? 1 : 0));
  const ages = ordered.map(ageOf);
  const pacing = weeklyPacing(ages, slaDays, { cap, pull: true });
  const size = Math.min(cap, Math.max(pacing.size, ages.length ? floor : 0));
  const pullAge = clusterPullAge(ages);
  const minAge = Math.min(MIN_AGE_DAYS, pullAge);
  const batch = weeklyBatch(ordered, ageOf, slaDays, size, minAge);
  return { steady: pacing.steady, size, capped: pacing.capped, minAge, pulling: pullAge < MIN_AGE_DAYS, batch };
}
