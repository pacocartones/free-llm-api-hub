// state.mjs — the monthly "State of free LLM APIs" report numbers. Pure: every
// figure is computed from a month-end snapshot of data/providers.json (the last
// revision committed that month, from lib/history.mjs), the git-mined change
// history and the providers' `added` dates. No editorial input. build.mjs
// renders site/state/YYYY-MM/; the fixture tests in build.test.mjs pin the math.

import { ageInDays } from './rules.mjs';

export const STATE_MODALITIES = ['text', 'vision', 'image', 'audio', 'embeddings', 'rerank', 'ocr'];

// Last calendar day of a YYYY-MM month, as YYYY-MM-DD.
export const monthEndDate = (month) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

// month: 'YYYY-MM'. asOf: the date ages are measured at (the month end, or the
// last revision date for the newest month in the history). snapshot: the
// providers array as of that month's last revision. historyBySlug: the mined
// history. addedBySlug: `added` dates from the current dataset (provenance is
// set once and may have been backfilled after the snapshot), falling back to
// the snapshot's own field.
export const monthlyReport = ({ month, asOf, snapshot, historyBySlug = {}, addedBySlug = {}, carried = false, inProgress = false }) => {
  const at = new Date(asOf + 'T00:00:00Z');
  const total = snapshot.length;
  const byCategory = {
    ongoing: snapshot.filter((p) => p.category === 'ongoing').length,
    trial: snapshot.filter((p) => p.category === 'trial').length,
  };
  const byModality = STATE_MODALITIES.map((m) => ({ modality: m, count: snapshot.filter((p) => (p.modalities || []).includes(m)).length }));
  const verified = snapshot.filter((p) => p.verified).length;
  // Same convention as freshnessBadge in rules.mjs: the age of each verified
  // entry's last_verified date, lower median.
  const ages = snapshot
    .filter((p) => p.verified && p.last_verified)
    .map((p) => ageInDays(p.last_verified, at))
    .filter((a) => a !== null)
    .sort((a, b) => a - b);
  const freshness = {
    dated: ages.length,
    oldestDays: ages.length ? ages[ages.length - 1] : null,
    medianDays: ages.length ? ages[Math.floor((ages.length - 1) / 2)] : null,
  };

  const nameOf = new Map(snapshot.map((p) => [p.slug, p.name]));
  let fieldChanges = 0;
  const changed = new Map();
  for (const slug of Object.keys(historyBySlug)) {
    for (const e of historyBySlug[slug] || []) {
      if (e.kind !== 'changed' || !e.date.startsWith(month + '-')) continue;
      const fields = e.fields || [];
      fieldChanges += fields.length;
      const entry = changed.get(slug) || { slug, name: nameOf.get(slug) || slug, fields: [] };
      for (const f of fields) if (!entry.fields.includes(f)) entry.fields.push(f);
      changed.set(slug, entry);
    }
  }
  const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  const providersChanged = [...changed.values()].sort(byName);

  const added = snapshot
    .map((p) => ({ slug: p.slug, name: p.name, added: addedBySlug[p.slug] || p.added || null }))
    .filter((p) => p.added && p.added.startsWith(month + '-'))
    .sort((a, b) => (a.added < b.added ? -1 : a.added > b.added ? 1 : byName(a, b)));

  return {
    month, asOf, total, byCategory, byModality,
    verified, verifiedShare: total ? verified / total : 0,
    freshness, fieldChanges, providersChanged,
    // A carried month has no revision of its own: nothing was added in it, whatever the dates of the snapshot say.
    added: carried ? [] : added,
    carried, inProgress,
  };
};

const nextMonth = (month) => {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};

// Every month from the first to the last one with a committed revision, oldest first, with its as-of date:
// the month end, except the newest month, measured at its last revision so a month still in progress never
// reports ages from a future date. A month without a revision (carried) repeats the snapshot of the month
// before: nothing changed in it, which is the true state. "The newest month" is the month of the last
// revision, never the clock of the machine, so the output of the build does not depend on the day it runs.
export const fillMonths = (monthEnd) => {
  const keys = Object.keys(monthEnd).sort();
  if (!keys.length) return [];
  const last = keys[keys.length - 1];
  const out = [];
  let previous = null;
  for (let month = keys[0]; month <= last; month = nextMonth(month)) {
    const revision = monthEnd[month];
    if (revision) {
      previous = revision;
      const inProgress = month === last && revision.date < monthEndDate(month);
      out.push({ month, asOf: month === last ? revision.date : monthEndDate(month), snapshot: revision.providers, snapshotDate: revision.date, carried: false, inProgress });
    } else {
      out.push({ month, asOf: monthEndDate(month), snapshot: previous.providers, snapshotDate: previous.date, carried: true, inProgress: false });
    }
  }
  return out;
};
export const reportMonths = fillMonths;

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthName = (month) => MONTH_NAMES[Number(month.slice(5, 7)) - 1];
export const monthLabel = (month) => `${monthName(month)} ${month.slice(0, 4)}`;
export const pct = (x) => `${Math.round(x * 1000) / 10}%`;

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// The sentence under the title of a month, from the same figures the page shows and nothing else.
export const monthSummary = (r, previous = null) => {
  const label = monthLabel(r.month);
  if (r.carried) return `No revision of providers.json was committed in ${label}, so nothing changed: the figures repeat the end of the month before.`;
  let delta = '';
  if (previous) {
    const points = Math.round((r.verifiedShare - previous.verifiedShare) * 1000) / 10;
    delta = points === 0 ? ` (no change on ${monthLabel(previous.month)})` : ` (${points > 0 ? '+' : '−'}${Math.abs(points)} ${Math.abs(points) === 1 ? 'point' : 'points'} on ${monthLabel(previous.month)})`;
  }
  const changes = r.fieldChanges === 0
    ? `no field changes`
    : `${plural(r.fieldChanges, 'field change', 'field changes')} across ${plural(r.providersChanged.length, 'provider', 'providers')}`;
  return `In ${label} there ${r.fieldChanges === 0 ? 'were' : r.fieldChanges === 1 ? 'was' : 'were'} ${changes}, ${r.added.length === 0 ? 'none' : r.added.length} added, and ${pct(r.verifiedShare)} of the providers were verified${delta}.`;
};

// The short form for the table of months.
export const monthBrief = (r) => {
  if (r.carried) return 'no changes';
  const parts = [];
  if (r.fieldChanges) parts.push(plural(r.fieldChanges, 'field change', 'field changes'));
  if (r.added.length) parts.push(`${r.added.length} added`);
  const brief = parts.length ? parts.join(', ') : 'no field changes';
  return r.inProgress ? `${brief} · in progress, data to ${r.asOf}` : brief;
};
