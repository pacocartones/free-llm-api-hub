// state-quarterly.mjs — the numbers of the quarterly "State of Free LLM APIs" report (/state/YYYY-qN/). Pure: every
// figure comes from two snapshots of data/providers.json (the end of the quarter before and the end of this quarter,
// both from the first-parent history in lib/history.mjs, via fillMonths in lib/state.mjs) and the mined change
// history. Nothing editorial: the wording lives in content/state/ (lib/state-editorial.mjs) and can only quote these
// figures. build.mjs renders the page; scripts/state-quarterly.test.mjs pins the math on fixtures and on the real build.

import { STATE_MODALITIES, monthEndDate } from './state.mjs';
import { HISTORY_FIELDS } from './history.mjs';

// ---------- quarters ----------

/** 'YYYY-MM' -> 'YYYY-qN'. */
export const quarterOf = (month) => `${month.slice(0, 4)}-q${Math.floor((Number(month.slice(5, 7)) - 1) / 3) + 1}`;
/** 'YYYY-qN' -> its three months, 'YYYY-MM'. */
export const quarterMonths = (quarter) => {
  const [y, q] = [quarter.slice(0, 4), Number(quarter.slice(6))];
  return [1, 2, 3].map((i) => `${y}-${String((q - 1) * 3 + i).padStart(2, '0')}`);
};
/** 'YYYY-qN' -> 'Q4 2026'. */
export const quarterLabel = (quarter) => `Q${quarter.slice(6)} ${quarter.slice(0, 4)}`;
/** The month before a 'YYYY-MM'. */
export const monthBefore = (month) => {
  const [y, m] = month.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
};
export const quarterEndDate = (quarter) => monthEndDate(quarterMonths(quarter)[2]);
export const quarterStartDate = (quarter) => `${quarterMonths(quarter)[0]}-01`;
const isQuarter = (q) => /^\d{4}-q[1-4]$/.test(q);
export { isQuarter };

// The quarters that can be reported, oldest first, from the months of fillMonths() (every month from the first to the
// last committed revision, a month without a revision carrying the one before). A quarter needs the month before it
// (its starting snapshot): without one, the very first revision would read as every provider being "added", so the
// quarter the history starts in is left out. A quarter is `closed` when its third month is in the history and is not
// in progress (a later revision exists); otherwise it is in progress and its data reach the last revision. "Closed"
// follows the history, never the clock of the machine, so the build does not depend on the day it runs.
export const reportQuarters = (months) => {
  const byMonth = new Map(months.map((m) => [m.month, m]));
  const quarters = [...new Set(months.map((m) => quarterOf(m.month)))];
  const out = [];
  for (const quarter of quarters) {
    const qm = quarterMonths(quarter);
    const start = byMonth.get(monthBefore(qm[0]));
    if (!start) continue;
    const inQuarter = qm.map((m) => byMonth.get(m)).filter(Boolean);
    const end = inQuarter[inQuarter.length - 1];
    const closed = inQuarter.length === 3 && !end.inProgress;
    out.push({
      quarter,
      start: { month: start.month, date: start.snapshotDate, snapshot: start.snapshot },
      end: { month: end.month, date: end.snapshotDate, snapshot: end.snapshot, asOf: end.asOf },
      monthEnds: [start, ...inQuarter].map((m) => ({ month: m.month, date: m.snapshotDate, total: m.snapshot.length, carried: m.carried })),
      closed,
    });
  }
  return out;
};

// ---------- headline figures ----------

// The four flags of the headline, with the value that counts as the friendly answer. A flag that is null (or a
// data_policy that is missing) is "not stated", which is never read as yes or no.
export const HEADLINE_FLAGS = Object.freeze([
  { key: 'card', label: 'Card required', friendly: 'no card', read: (p) => p.card_required, yes: false },
  { key: 'phone', label: 'Phone required', friendly: 'no phone', read: (p) => p.phone_required, yes: false },
  { key: 'commercial', label: 'Commercial use', friendly: 'commercial use allowed', read: (p) => p.commercial_ok, yes: true },
  { key: 'training', label: 'Trains on prompts', friendly: 'says it does not train on prompts', read: (p) => (p.data_policy ? p.data_policy.trains_on_prompts : null), yes: false },
]);

const stated = (v) => v !== null && v !== undefined;

// For one flag over a snapshot: how many give the friendly answer, the other stated answers, and not stated.
// commercial_ok "conditional" counts as stated and not friendly (it is a yes with conditions, never a plain yes).
export const flagSplit = (snapshot, flag) => {
  const out = { friendly: 0, other: 0, notStated: 0 };
  for (const p of snapshot) {
    const v = flag.read(p);
    if (!stated(v)) out.notStated++;
    else if (v === flag.yes) out.friendly++;
    else out.other++;
  }
  return out;
};

export const snapshotFigures = (snapshot) => {
  const total = snapshot.length;
  const flags = Object.fromEntries(HEADLINE_FLAGS.map((f) => [f.key, flagSplit(snapshot, f)]));
  const notStatedCells = HEADLINE_FLAGS.reduce((n, f) => n + flags[f.key].notStated, 0);
  return {
    total,
    ongoing: snapshot.filter((p) => p.category === 'ongoing').length,
    trial: snapshot.filter((p) => p.category === 'trial').length,
    verified: snapshot.filter((p) => p.verified === true).length,
    flags,
    // One share across the four headline flags: the provider-flag pairs that read "not stated".
    notStatedCells,
    flagCells: total * HEADLINE_FLAGS.length,
    notStatedShare: total ? notStatedCells / (total * HEADLINE_FLAGS.length) : 0,
    byModality: STATE_MODALITIES.map((m) => ({ modality: m, count: snapshot.filter((p) => (p.modalities || []).includes(m)).length })),
  };
};

// ---------- changes in the quarter ----------

// How a field change reads for someone using the free tier. Only the flags and the kind of free access can be
// judged by rule; a change to the free-tier text, the limits or the catch is listed as "changed wording or limits"
// and never guessed to be a cut or an improvement.
const FREE_TYPE_RANK = { 'trial-credit': 0, 'recurring-credit': 1, 'renewing-quota': 1, perpetual: 1 };
const COMMERCIAL_RANK = { false: 0, conditional: 1, true: 2 };
export const CHANGE_KINDS = Object.freeze([
  { key: 'cut', label: 'Cuts' },
  { key: 'improvement', label: 'Improvements' },
  { key: 'to_unknown', label: 'Moved to not stated' },
  { key: 'clarified', label: 'Newly stated' },
  { key: 'other', label: 'Wording or limits changed', short: 'Wording or limits' },
]);

export const classifyChange = ({ field, from, to }) => {
  if (['card_required', 'phone_required', 'commercial_ok'].includes(field)) {
    if (!stated(to) && stated(from)) return 'to_unknown';
    if (stated(to) && !stated(from)) return 'clarified';
    if (field === 'commercial_ok') {
      const a = COMMERCIAL_RANK[String(from)], b = COMMERCIAL_RANK[String(to)];
      if (a === undefined || b === undefined || a === b) return 'other';
      return b < a ? 'cut' : 'improvement';
    }
    if (from === false && to === true) return 'cut';
    if (from === true && to === false) return 'improvement';
    return 'other';
  }
  if (field === 'free_type') {
    const a = FREE_TYPE_RANK[from], b = FREE_TYPE_RANK[to];
    if (a === undefined || b === undefined || a === b) return 'other';
    return b < a ? 'cut' : 'improvement';
  }
  return 'other';
};

const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

// quarter: one item of reportQuarters(). historyBySlug: the mined history (each 'changed' event with its `changes`).
// notFree: the entries of data/not-free.json, to give a removed provider its documented reason when there is one.
export const quarterlyReport = ({ quarter, start, end, monthEnds, closed }, { historyBySlug = {}, notFree = [] } = {}) => {
  const months = quarterMonths(quarter);
  const before = snapshotFigures(start.snapshot);
  const after = snapshotFigures(end.snapshot);
  const startSlugs = new Set(start.snapshot.map((p) => p.slug));
  const endSlugs = new Set(end.snapshot.map((p) => p.slug));
  const nameOf = new Map([...start.snapshot, ...end.snapshot].map((p) => [p.slug, p.name]));

  const added = end.snapshot.filter((p) => !startSlugs.has(p.slug)).map((p) => ({ slug: p.slug, name: p.name, category: p.category })).sort(byName);
  const removed = start.snapshot.filter((p) => !endSlugs.has(p.slug)).map((p) => {
    const nf = notFree.find((e) => e.slug === p.slug || e.id === p.slug || e.name === p.name);
    return { slug: p.slug, name: p.name, reason: nf ? nf.short || nf.summary || null : null, notFreeId: nf ? nf.id : null };
  }).sort(byName);

  // Field changes dated in the quarter, up to the end snapshot, one row per provider, day and field.
  const changes = [];
  for (const slug of Object.keys(historyBySlug).sort()) {
    for (const e of historyBySlug[slug] || []) {
      if (e.kind !== 'changed' || !months.includes(e.date.slice(0, 7)) || e.date > end.date) continue;
      for (const c of e.changes || (e.fields || []).map((field) => ({ field, from: null, to: null }))) {
        changes.push({ date: e.date, slug, name: nameOf.get(slug) || slug, field: c.field, label: HISTORY_FIELDS[c.field] || c.field, from: c.from ?? null, to: c.to ?? null, kind: classifyChange(c) });
      }
    }
  }
  changes.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : byName(a, b)));
  const changesByKind = Object.fromEntries(CHANGE_KINDS.map((k) => [k.key, changes.filter((c) => c.kind === k.key)]));
  const changesByField = Object.keys(HISTORY_FIELDS).map((field) => ({ field, label: HISTORY_FIELDS[field], count: changes.filter((c) => c.field === field).length }));
  const changesByMonth = months.map((m) => ({ month: m, count: changes.filter((c) => c.date.startsWith(m + '-')).length }));
  const providersChanged = new Set(changes.map((c) => c.slug)).size;

  // What we don't know: for each headline flag, the providers of the end snapshot where it is not stated, and for the
  // three flags with field_checks, why (the recorded reason, or not checked).
  const unknowns = HEADLINE_FLAGS.map((f) => {
    const field = { card: 'card_required', phone: 'phone_required', commercial: 'commercial_ok', training: null }[f.key];
    const list = end.snapshot.filter((p) => !stated(f.read(p)));
    const reasons = {};
    for (const p of list) {
      const status = field && p.field_checks && p.field_checks[field] ? p.field_checks[field].status : 'not_checked';
      reasons[status] = (reasons[status] || 0) + 1;
    }
    return { key: f.key, label: f.label, count: list.length, reasons, providers: list.map((p) => ({ slug: p.slug, name: p.name })).sort(byName) };
  });

  return {
    quarter, label: quarterLabel(quarter), months, closed,
    start: { month: start.month, date: start.date }, end: { month: end.month, date: end.date, asOf: end.asOf },
    before, after, added, removed, changes, changesByKind, changesByField, changesByMonth, providersChanged,
    monthEnds, unknowns,
  };
};

// ---------- figures for the editorial file ----------

const pctOf = (n, d) => (d ? `${Math.round((n / d) * 1000) / 10}%` : '0%');
const list = (items) => (items.length ? items.map((i) => i.name).join(', ') : 'none');

// The `{{key}}` values the editorial file may quote. Every value is a string; a key the file names that is not here
// fails the build (lib/state-editorial.mjs).
export const quarterFigures = (r) => {
  const a = r.after, b = r.before;
  const f = {
    quarter_label: r.label,
    quarter_start: quarterStartDate(r.quarter),
    quarter_end: quarterEndDate(r.quarter),
    data_as_of: r.end.date,
    start_snapshot_date: r.start.date,
    status: r.closed ? 'closed' : 'in progress',
    providers: String(a.total), providers_before: String(b.total), providers_delta: signed(a.total - b.total),
    ongoing: String(a.ongoing), trial: String(a.trial),
    verified: String(a.verified), verified_share: pctOf(a.verified, a.total),
    not_stated_share: pctOf(a.notStatedCells, a.flagCells), not_stated_share_before: pctOf(b.notStatedCells, b.flagCells),
    added_count: String(r.added.length), added_names: list(r.added),
    removed_count: String(r.removed.length), removed_names: list(r.removed),
    field_changes: String(r.changes.length), providers_changed: String(r.providersChanged),
    modality_count: String(a.byModality.filter((m) => m.count > 0).length),
  };
  for (const flag of HEADLINE_FLAGS) {
    const s = a.flags[flag.key], s0 = b.flags[flag.key];
    f[`${flag.key}_friendly`] = String(s.friendly);
    f[`${flag.key}_friendly_share`] = pctOf(s.friendly, a.total);
    f[`${flag.key}_not_stated`] = String(s.notStated);
    f[`${flag.key}_friendly_before`] = String(s0.friendly);
  }
  for (const k of CHANGE_KINDS) {
    f[`${k.key}_count`] = String(r.changesByKind[k.key].length);
    f[`${k.key}_names`] = list([...new Map(r.changesByKind[k.key].map((c) => [c.slug, c])).values()]);
  }
  for (const m of a.byModality) f[`modality_${m.modality}`] = String(m.count);
  return f;
};

function signed(n) { return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0'; }
