// status.mjs — /api/v1/status.json: one small freshness record per provider, keyed by slug, for clients
// (API routers, pools, dashboards) that only need to know how recent and how trustworthy each entry is,
// without downloading and re-deriving the full provider objects.
//
// Every value is computed from the committed data and the git-mined change list, graded at the dataset's own
// as-of day (datasetAsOf), never the clock: the file is byte-stable for a given dataset and history. The SLA
// thresholds are published in the file, so a client can regrade `last_verified` against its own today.

import { SLA_DAYS, DUE_SOON_DAYS, ageInDays, freshnessStatus } from './rules.mjs';

/** Contract version of status.json. Bumped only with a new /api/vN/ path; fields are only added within v1. */
export const STATUS_SCHEMA_VERSION = 1;

/** The four freshness states. `unverified` is an entry nobody has verified yet. */
export const FRESHNESS_STATES = Object.freeze(['fresh', 'due', 'stale', 'unverified']);

/** The oldest `checked` day among a provider's field checks, or null when it has none. */
export function oldestFieldCheck(p) {
  const days = Object.values(p.field_checks || {})
    .map((c) => c && c.checked)
    .filter((d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  return days.length ? days[0] : null;
}

/** 'fresh' / 'due' / 'stale' at `asOf` by the SLA of lib/rules.mjs, or 'unverified'. */
export function freshnessAt(p, asOf) {
  if (p.verified !== true || !p.last_verified) return 'unverified';
  return freshnessStatus(ageInDays(p.last_verified, new Date(asOf + 'T00:00:00Z')));
}

/**
 * Whether the free access is in effect as far as the data knows: true for a verified entry whose last probe did
 * not report the tier gone, false when the probe said `tier-ended`, null when the entry is not verified.
 */
export function freeNow(p) {
  if (p.probe_status === 'tier-ended') return false;
  return p.verified === true ? true : null;
}

/** The newest change date per slug, from a flat list of field changes ({ date, slug, ... }). */
export function lastChangeBySlug(changes) {
  const out = new Map();
  for (const c of changes || []) {
    if (!c || !c.slug || !c.date) continue;
    if (!out.has(c.slug) || c.date > out.get(c.slug)) out.set(c.slug, c.date);
  }
  return out;
}

/**
 * The status.json payload. `base` is the envelope every /api/v1/ file carries; `providers` the public providers;
 * `changes` the field changes (the same list changes.json is grouped from, over the whole history).
 */
export function statusPayload({ base, asOf, providers, changes, schemaUrl }) {
  const lastChange = lastChangeBySlug(changes);
  const bySlug = {};
  for (const p of [...providers].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))) {
    bySlug[p.slug] = {
      last_verified: p.last_verified || null,
      oldest_field_check: oldestFieldCheck(p),
      freshness: freshnessAt(p, asOf),
      free_now: freeNow(p),
      last_change: lastChange.get(p.slug) || null,
    };
  }
  return {
    ...base,
    description: 'Freshness of every provider, keyed by slug: the day it was last verified, the oldest day among its field checks, its state against the freshness SLA at generated_at, whether its free access is in effect, and the day of its newest field change. Small enough to poll; the full records are in providers.json.',
    schema: schemaUrl,
    schema_version: STATUS_SCHEMA_VERSION,
    generated_at: asOf,
    sla: { due_after_days: DUE_SOON_DAYS, stale_after_days: SLA_DAYS },
    count: Object.keys(bySlug).length,
    providers: bySlug,
  };
}
