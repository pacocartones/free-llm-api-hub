// changes.mjs — the field-level weekly change feed, derived from the git-mined
// per-provider history (lib/history.mjs). Pure functions only, shared by
// build.mjs (site/api/v1/changes.json, site/changes.xml, site/changes/) and the
// fixture tests in build.test.mjs. Everything here is deterministic for a given
// history: the 12-week window is anchored on the newest change, never on the
// current date. The outputs are still git-log derived (commit dates move across
// a squash merge), so build.mjs keeps them out of derived-fingerprints.json.

import { HISTORY_FIELDS } from './history.mjs';

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

// One row per changed field: { date, slug, name, field, label, from, to },
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
        out.push({ date: e.date, slug, name: nameBySlug[slug] || slug, field: c.field, label: HISTORY_FIELDS[c.field] || c.field, from: c.from ?? null, to: c.to ?? null });
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

// RSS 2.0, one <item> per ISO week. Deterministic: pubDate is the date of the
// newest change in that week, the guid is the week key.
export const changesRss = (groups, { site }) => {
  const items = groups.map((g) =>
    `    <item><title>${xmlEsc(weekTitle(g))}</title>` +
    `<link>${xmlEsc(`${site}/changes/#${g.week}`)}</link>` +
    `<guid isPermaLink="false">${xmlEsc(`free-llm-api-hub-changes-${g.week}`)}</guid>` +
    `<pubDate>${new Date(g.lastDate + 'T00:00:00Z').toUTCString()}</pubDate>` +
    `<description>${xmlEsc(weekSummary(g))}</description></item>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel>\n` +
    `    <title>Free LLM API Hub — what changed, week by week</title>\n    <link>${xmlEsc(`${site}/changes/`)}</link>\n` +
    `    <description>Field-level changes to free LLM API tiers (free tier, rate limits, the catch, flags), grouped by ISO week.</description>\n` +
    (items ? `${items}\n` : '') + `</channel></rss>\n`;
};

// "Report a change" link for a provider page: GitHub issue forms prefill an
// input from a query parameter named after the field id (`provider` in
// .github/ISSUE_TEMPLATE/inaccuracy.yml) and the issue title from `title`.
// Returns a raw URL; HTML-escape it when writing it into an attribute.
export const reportChangeUrl = (p, repo) =>
  `${repo}/issues/new?template=inaccuracy.yml&provider=${encodeURIComponent(p.slug)}&title=${encodeURIComponent(`[outdated] ${p.name}`)}`;
