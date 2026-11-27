// changes.mjs — the field-level weekly change feed, derived from the git-mined
// per-provider history (lib/history.mjs). Pure functions only, shared by
// build.mjs (site/api/v1/changes.json, site/changes.xml, site/changes/) and the
// fixture tests in build.test.mjs. Everything here is deterministic for a given
// history: the 12-week window is anchored on the newest change, never on the
// current date. The outputs are still git-log derived (commit dates move across
// a squash merge), so build.mjs keeps them out of derived-fingerprints.json.

import { HISTORY_FIELDS } from './history.mjs';
import { NOT_STATED } from './provider-faq.mjs';

export { NOT_STATED };

const DAY = 86400000;
const ymd = (d) => d.toISOString().slice(0, 10);
const pad2 = (n) => String(n).padStart(2, '0');

// ISO-8601 week of a YYYY-MM-DD date (UTC): weeks start on Monday and week 1 is
// the week holding the year's first Thursday, so 2021-01-03 is 2020-W53.
export const isoWeek = (iso) => {
  const d = new Date(String(iso) + 'T00:00:00Z');
  if (Number.isNaN(+d)) throw new Error(`isoWeek: invalid date "${iso}"`);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  const thursday = new Date(+d + (3 - dow) * DAY);
  const year = thursday.getUTCFullYear();
  const week = 1 + Math.floor((+thursday - Date.UTC(year, 0, 1)) / DAY / 7);
  const start = new Date(+d - dow * DAY);
  return { key: `${year}-W${pad2(week)}`, year, week, start: ymd(start), end: ymd(new Date(+start + 6 * DAY)) };
};

// One row per changed field: { date, slug, name, field, label, from, to, commit },
// where commit is the 40-character hash of the providers.json commit, or null.
// newest first, then by provider name, then by the HISTORY_FIELDS order.
// nameBySlug resolves display names; a provider that has since left the
// dataset falls back to its slug.
export const flattenFieldChanges = (historyBySlug, nameBySlug = {}) => {
  const fieldOrder = Object.keys(HISTORY_FIELDS);
  const out = [];
  for (const slug of Object.keys(historyBySlug)) {
    for (const e of historyBySlug[slug] || []) {
      if (e.kind !== 'changed') continue;
      const changes = e.changes || (e.fields || []).map((field) => ({ field, from: null, to: null }));
      for (const c of changes) {
        out.push({ date: e.date, slug, name: nameBySlug[slug] || slug, field: c.field, label: HISTORY_FIELDS[c.field] || c.field, from: c.from ?? null, to: c.to ?? null, commit: c.commit ?? e.commit ?? null });
      }
    }
  }
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  return out.sort((a, b) =>
    cmp(b.date, a.date) || cmp(a.name, b.name) || cmp(a.slug, b.slug) || fieldOrder.indexOf(a.field) - fieldOrder.indexOf(b.field));
};

// Groups flattened changes by ISO week, newest week first, keeping the weeks
// that fall inside the `weeks`-week window ending at the newest change's week.
// Weeks with no change are omitted (there is nothing to say about them).
export const groupChangesByWeek = (changes, { weeks = 12 } = {}) => {
  if (!changes.length) return [];
  const byWeek = new Map();
  for (const c of changes) {
    const w = isoWeek(c.date);
    if (!byWeek.has(w.key)) byWeek.set(w.key, { week: w.key, start: w.start, end: w.end, changes: [] });
    byWeek.get(w.key).changes.push(c);
  }
  const newestStart = [...byWeek.values()].reduce((m, g) => (g.start > m ? g.start : m), '');
  const cutoff = ymd(new Date(Date.parse(newestStart + 'T00:00:00Z') - (weeks - 1) * 7 * DAY));
  return [...byWeek.values()]
    .filter((g) => g.start >= cutoff)
    .sort((a, b) => (a.start < b.start ? 1 : a.start > b.start ? -1 : 0))
    .map((g) => {
      const providers = [...new Set(g.changes.map((c) => c.name))];
      const lastDate = g.changes.reduce((m, c) => (c.date > m ? c.date : m), '');
      return { ...g, count: g.changes.length, providers, lastDate };
    });
};

// Human rendering of a tracked value (strings, tri-state flags, arrays).
export const formatValue = (v) => {
  if (v === null || v === undefined) return 'unknown';
  if (v === true) return 'yes';
  if (v === false) return 'no';
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
};

// The fields whose change a provider page spells out as "before → after": the limits text and the short values (the
// free type and the tri-state flags). free_tier, the catch and the commercial-use condition are paragraphs; for them
// the page keeps the label and links the history.
export const BEFORE_AFTER_FIELDS = ['rate_limits', 'free_type', 'card_required', 'phone_required', 'commercial_ok', 'openai_compatible'];

/** [{ label, from, to }] for the before → after lines of one history event, in the event's field order. */
export const beforeAfter = (e) => (e && e.kind === 'changed' ? e.changes || [] : [])
  .filter((c) => BEFORE_AFTER_FIELDS.includes(c.field))
  .map((c) => ({ label: HISTORY_FIELDS[c.field] || c.field, from: formatValue(c.from), to: formatValue(c.to) }));

// XML 1.0 text escaping: the five predefined entities, plus removal of the
// control characters XML 1.0 forbids outright (they cannot be escaped).
// eslint-disable-next-line no-control-regex
export const xmlEsc = (s) => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

// One sentence per week: "Groq: rate limits; Mistral: free tier, the catch."
export const weekSummary = (g) => {
  const fieldsByName = new Map();
  for (const c of g.changes) {
    if (!fieldsByName.has(c.name)) fieldsByName.set(c.name, []);
    const list = fieldsByName.get(c.name);
    if (!list.includes(c.label)) list.push(c.label);
  }
  return [...fieldsByName].map(([name, labels]) => `${name}: ${labels.join(', ')}`).join('; ') + '.';
};

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
export const weekTitle = (g) =>
  `${g.week} (${g.start} to ${g.end}): ${plural(g.count, 'field change', 'field changes')} across ${plural(g.providers.length, 'provider', 'providers')}`;

// The <guid> of a week's item in changes.xml, also published in changes.json.
export const weekGuid = (g) => `free-llm-api-hub-changes-${g.week}`;

// The page that lists a week's changes: the monthly report of the week's newest change. /changes/ is by month and has
// no per-week anchor, so a feed entry points at the report that holds its rows.
export const weekHref = (g, { site }) => `${site}/state/${String(g.lastDate).slice(0, 7)}/`;

// RSS 2.0, one <item> per ISO week. Deterministic: pubDate is the date of the
// newest change in that week, the guid is the week key.
export const changesRss = (groups, { site }) => {
  const items = groups.map((g) =>
    `    <item><title>${xmlEsc(weekTitle(g))}</title>` +
    `<link>${xmlEsc(weekHref(g, { site }))}</link>` +
    `<guid isPermaLink="false">${xmlEsc(weekGuid(g))}</guid>` +
    `<pubDate>${new Date(g.lastDate + 'T00:00:00Z').toUTCString()}</pubDate>` +
    `<description>${xmlEsc(weekSummary(g))}</description></item>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>\n` +
    `    <title>Free LLM API Hub — what changed, week by week</title>\n    <link>${xmlEsc(`${site}/changes/`)}</link>\n` +
    // The feed's own URL: feed validators ask an RSS 2.0 feed to carry it.
    `    <atom:link href="${xmlEsc(`${site}/changes.xml`)}" rel="self" type="application/rss+xml"/>\n` +
    `    <description>Field-level changes to free LLM API tiers (free tier, rate limits, the catch, flags), grouped by ISO week.</description>\n` +
    (items ? `${items}\n` : '') + `</channel></rss>\n`;
};

// Atom (RFC 4287), one <entry> per ISO week, from the same grouped weeks as api/v1/changes.json. Deterministic:
// every date comes from the data (an entry's <updated> is its week's newest change; the feed's is the newest entry,
// or `updated` when there is none), and the ids are tag URIs (RFC 4151) built from the week key, so an entry keeps
// its id across rebuilds and a reader never sees a week twice.
export const ATOM_PATH = '/changes.atom';
export const atomId = (site, week) => `tag:${new URL(site).hostname},2026:changes${week ? ':' + week : ''}`;
const rfc3339 = (ymdDate) => `${ymdDate}T00:00:00Z`;
export const changesAtom = (groups, { site, updated = '1970-01-01' }) => {
  const newest = groups.reduce((m, g) => (g.lastDate > m ? g.lastDate : m), '');
  const entries = groups.map((g) =>
    `  <entry>\n` +
    `    <id>${xmlEsc(atomId(site, g.week))}</id>\n` +
    `    <title>${xmlEsc(weekTitle(g))}</title>\n` +
    `    <updated>${rfc3339(g.lastDate)}</updated>\n` +
    `    <link rel="alternate" type="text/html" href="${xmlEsc(weekHref(g, { site }))}"/>\n` +
    `    <summary type="text">${xmlEsc(weekSummary(g))}</summary>\n` +
    `  </entry>\n`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom">\n` +
    `  <id>${xmlEsc(atomId(site))}</id>\n` +
    `  <title>Free LLM API Hub — what changed, week by week</title>\n` +
    `  <subtitle>Field-level changes to free LLM API tiers (free tier, rate limits, the catch, flags), one entry per ISO week.</subtitle>\n` +
    `  <updated>${rfc3339(newest || updated)}</updated>\n` +
    `  <author><name>Free LLM API Hub</name><uri>${xmlEsc(`${site}/`)}</uri></author>\n` +
    `  <link rel="self" type="application/atom+xml" href="${xmlEsc(site + ATOM_PATH)}"/>\n` +
    `  <link rel="alternate" type="text/html" href="${xmlEsc(`${site}/changes/`)}"/>\n` +
    entries + `</feed>\n`;
};

// The answer-first summary of the latest week with a change, from the data: the providers whose tracked fields changed,
// the ongoing free tiers that ended (free_type went from an ongoing shape to trial-credit) and the providers added.
// `changes` are flattened (projected) field changes; `added` is [{ date, slug, name }]. The week is the ISO week of the
// newest of those dates, never the clock; it reads "This week" only when it is the week of `asOf` (the dataset's date).
const ONGOING_TYPES = new Set(['perpetual', 'renewing-quota', 'recurring-credit']);
export const latestWeek = (changes, added = [], { asOf } = {}) => {
  const newest = [...changes, ...added].reduce((m, c) => (c.date > m ? c.date : m), '');
  if (!newest) return null;
  const w = isoWeek(newest);
  const inWeek = (c) => c.date >= w.start && c.date <= w.end;
  const weekChanges = changes.filter(inWeek);
  const weekAdded = added.filter(inWeek);
  const changed = new Set(weekChanges.map((c) => c.slug));
  const ended = new Set(weekChanges.filter((c) => c.field === 'free_type' && ONGOING_TYPES.has(c.from) && c.to === 'trial-credit').map((c) => c.slug));
  return { week: w.key, start: w.start, end: w.end, current: Boolean(asOf) && isoWeek(asOf).key === w.key,
    changed: changed.size, ended: ended.size, added: weekAdded.length, changes: weekChanges, addedList: weekAdded };
};

/** "This week (2026-W48, 2026-11-23 to 2026-11-29): 3 providers changed, 1 free tier ended, 2 new." */
export const latestWeekSentence = (lw) => lw
  ? `${lw.current ? 'This week' : 'Latest week with changes'} (${lw.week}, ${lw.start} to ${lw.end}): ` +
    `${plural(lw.changed, 'provider changed', 'providers changed')}, ${plural(lw.ended, 'free tier ended', 'free tiers ended')}, ${lw.added} new.`
  : `Latest week: ${NOT_STATED} (no change history is available in this build).`;

/** A tracked value for the summary: like formatValue, but a null reads "not stated" (the shared wording). */
export const summaryValue = (v) => (v === null || v === undefined || v === '' ? NOT_STATED : formatValue(v));

// "Report a change" link for a provider page: GitHub issue forms prefill an
// input from a query parameter named after the field id (`provider` in
// .github/ISSUE_TEMPLATE/inaccuracy.yml) and the issue title from `title`.
// Returns a raw URL; HTML-escape it when writing it into an attribute.
export const reportChangeUrl = (p, repo) =>
  `${repo}/issues/new?template=inaccuracy.yml&provider=${encodeURIComponent(p.slug)}&title=${encodeURIComponent(`[outdated] ${p.name}`)}`;

// The body of /api/v1/changes.json (everything after the shared API envelope).
// `weeks` comes from groupChangesByWeek over the v1-projected changes. Fields
// published before dataset 2.16.0 keep their names, order and meaning (week,
// start, end, count, changes; date, slug, name, field, from, to); the rest is
// additive. `title` and `summary` are the same strings as the <title> and
// <description> of that week's item in changes.xml (weekTitle, weekSummary), and
// `guid` is that item's <guid>, so a client can match the JSON to the feed.
export const CHANGES_WINDOW_WEEKS = 12;
export const changesApiBody = (weeks, { site, windowWeeks = CHANGES_WINDOW_WEEKS } = {}) => ({
  schema: `${site}/api/v1/changes.schema.json`,
  page: `${site}/changes/`,
  feed: `${site}/changes.xml`,
  fields: Object.entries(HISTORY_FIELDS).map(([field, label]) => ({ field, label })),
  window_weeks: windowWeeks,
  count: weeks.reduce((n, g) => n + g.changes.length, 0),
  weeks: weeks.map((g) => ({
    week: g.week, start: g.start, end: g.end, count: g.count,
    changes: g.changes.map(({ date, slug, name, field, from, to, label, commit }) => ({
      date, slug, name, field, from, to,
      label: label || HISTORY_FIELDS[field] || field,
      commit: commit ?? null,
    })),
    title: weekTitle(g),
    summary: weekSummary(g),
    guid: weekGuid(g),
    providers: [...new Set(g.changes.map((c) => c.slug))],
  })),
});
