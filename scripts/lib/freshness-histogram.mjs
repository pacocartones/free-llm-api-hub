// Freshness histogram: how many verified entries reach `due` (day 61) and
// `stale` (day 91) in each coming week.
//
// The dates come from the data alone (last_verified + 61 or + 91 days), so the
// table is the same whatever the clock; only the first week of the window is
// chosen by the caller. The worklist anchors it on the day it runs; the
// /coverage/ page anchors it on the dataset date so the build stays
// deterministic. Day counts follow freshnessStatus in rules.mjs: an entry
// whose age is 61 days is `due`, 91 days is `stale`.

import { DUE_SOON_DAYS, SLA_DAYS } from './rules.mjs';
import { isoDay } from './dates.mjs';

/** More entries than this reaching `due` in one week is a cluster worth spreading. */
export const CLUSTER_LIMIT = 8;
export const HISTOGRAM_WEEKS = 16;

const DAY = 86400000;
const parse = (iso) => {
  const d = new Date(String(iso) + 'T00:00:00Z');
  return Number.isNaN(+d) ? null : d;
};
const iso = isoDay;

/** The Monday (UTC) of the ISO week that holds `date`. */
export function weekStart(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  return new Date(+d - ((d.getUTCDay() + 6) % 7) * DAY);
}

/**
 * @param {object[]} providers dataset entries; only verified ones with a valid last_verified count
 * @param {Date} from any day of the first week in the window
 * @param {{ weeks?: number, limit?: number }} [opts]
 * @returns {{ rows: { week: string, due: number, stale: number, clustered: boolean }[],
 *   dueBefore: number, staleBefore: number, clustered: number }}
 *   dueBefore / staleBefore count entries that are already due / stale when the window opens.
 */
export function freshnessHistogram(providers, from, { weeks = HISTOGRAM_WEEKS, limit = CLUSTER_LIMIT } = {}) {
  if (!(from instanceof Date) || !Number.isFinite(+from)) throw new Error('Invalid histogram start');
  const start = weekStart(from);
  const rows = Array.from({ length: weeks }, (_, i) => ({ week: iso(new Date(+start + i * 7 * DAY)), due: 0, stale: 0, clustered: false }));
  let dueBefore = 0;
  let staleBefore = 0;
  const bucket = (d) => Math.floor((+d - +start) / (7 * DAY));
  for (const p of providers) {
    if (!p || p.verified !== true) continue;
    const verified = parse(p.last_verified);
    if (!verified) continue;
    const due = new Date(+verified + (DUE_SOON_DAYS + 1) * DAY);
    const stale = new Date(+verified + (SLA_DAYS + 1) * DAY);
    const bd = bucket(due);
    const bs = bucket(stale);
    if (bd < 0) dueBefore++;
    else if (bd < weeks) rows[bd].due++;
    if (bs < 0) staleBefore++;
    else if (bs < weeks) rows[bs].stale++;
  }
  for (const r of rows) r.clustered = r.due > limit;
  return { rows, dueBefore, staleBefore, clustered: rows.filter((r) => r.clustered).length };
}

/** The histogram as a Markdown table for the weekly worklist issue. */
export function histogramMarkdown(h, { limit = CLUSTER_LIMIT } = {}) {
  const out = [
    '| Week of (Mon, UTC) | Become due (day 61) | Become overdue (day 91) |',
    '|---|---:|---:|',
    ...h.rows.map((r) => `| ${r.week} | ${r.due}${r.clustered ? ' ⛰️' : ''} | ${r.stale} |`),
  ];
  const notes = [];
  if (h.dueBefore || h.staleBefore) notes.push(`Already due when the window opens: ${h.dueBefore} (of which ${h.staleBefore} overdue).`);
  notes.push(h.clustered
    ? `⛰️ marks a week where more than ${limit} entries become due. The weekly batch pulls those entries forward, oldest first, until no week is over ${limit}.`
    : `No week has more than ${limit} entries becoming due.`);
  return [...out, '', `_${notes.join(' ')}_`].join('\n');
}
