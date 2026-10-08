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
export const monthlyReport = ({ month, asOf, snapshot, historyBySlug = {}, addedBySlug = {} }) => {
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
    freshness, fieldChanges, providersChanged, added,
  };
};

// Every month with a committed revision, oldest first, with its as-of date:
// the month end, except the newest month, measured at its last revision so a
// month still in progress never reports ages from a future date.
export const reportMonths = (monthEnd) => {
  const months = Object.keys(monthEnd).sort();
  return months.map((month, i) => ({
    month,
    asOf: i === months.length - 1 ? monthEnd[month].date : monthEndDate(month),
    snapshot: monthEnd[month].providers,
  }));
};
