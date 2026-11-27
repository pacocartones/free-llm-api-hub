// not-free-data.mjs — the guard on data/not-free.json ("Notably NOT free"), apart from its renderers in not-free.mjs.
//
// A data module: no markup, no file access. build.mjs (through not-free.mjs, which re-exports it) and validate.mjs run
// the same function, so `npm run validate` reports what the build would refuse.

import { SLUG_RE } from './slug.mjs';

const MODALITIES = new Set(['text', 'vision', 'image', 'audio', 'embeddings', 'rerank', 'ocr']);
const CHECKED_RE = /^\d{4}-\d{2}-\d{2}(\/\d{2})?$/;

/** Every problem with the file, as messages; an empty array means it is valid. */
export function notFreeErrors(doc, { providers = [], quotes = [] } = {}) {
  const errs = [];
  const groups = Array.isArray(doc?.groups) ? doc.groups : [];
  const entries = Array.isArray(doc?.entries) ? doc.entries : [];
  if (!groups.length) errs.push('groups: at least one group');
  if (!entries.length) errs.push('entries: at least one entry');
  if (typeof doc?.alternatives_note !== 'string' || !doc.alternatives_note.trim()) errs.push('alternatives_note: a sentence');
  const groupIds = new Set();
  for (const g of groups) {
    if (!SLUG_RE.test(g.id || '')) errs.push(`group ${g.id}: id must be kebab-case`);
    if (groupIds.has(g.id)) errs.push(`group ${g.id}: duplicate id`);
    groupIds.add(g.id);
    for (const k of ['title', 'intro']) if (typeof g[k] !== 'string' || !g[k].trim()) errs.push(`group ${g.id}: ${k} is required`);
  }
  const slugs = new Set(providers.map((p) => p.slug));
  const quoteIds = new Set(quotes.map((q) => q.id));
  const ids = new Set();
  for (const e of entries) {
    const at = `entry ${e.id}`;
    if (!SLUG_RE.test(e.id || '')) errs.push(`${at}: id must be kebab-case`);
    if (ids.has(e.id)) errs.push(`${at}: duplicate id`);
    ids.add(e.id);
    if (!groupIds.has(e.group)) errs.push(`${at}: unknown group ${e.group}`);
    for (const k of ['name', 'expectation', 'summary', 'short']) if (typeof e[k] !== 'string' || !e[k].trim()) errs.push(`${at}: ${k} is required`);
    if (!Array.isArray(e.modalities) || !e.modalities.length || e.modalities.some((m) => !MODALITIES.has(m))) errs.push(`${at}: modalities must be known modalities`);
    if (e.slug !== null && !slugs.has(e.slug)) errs.push(`${at}: slug ${e.slug} is not in data/providers.json`);
    if (e.checked !== null && !CHECKED_RE.test(String(e.checked))) errs.push(`${at}: checked must be YYYY-MM-DD (or YYYY-MM-DD/DD) or null`);
    if (!Array.isArray(e.quotes) || e.quotes.some((q) => typeof q !== 'string' || !q.trim())) errs.push(`${at}: quotes must be an array of sentences`);
    for (const id of e.quote_ids || []) if (!quoteIds.has(id)) errs.push(`${at}: quote id ${id} is not in data/quotes.json`);
    if (!Array.isArray(e.sources) || e.sources.some((s) => !s || typeof s.label !== 'string' || !/^https:\/\//.test(s.url || ''))) errs.push(`${at}: sources must be {label, https url}`);
    if (e.quotes?.length && !e.sources?.length) errs.push(`${at}: a quote needs its source`);
    if (e.quotes?.length && !e.checked) errs.push(`${at}: a quote needs the day it was read`);
    if (e.faq !== null && (typeof e.faq !== 'string' || !e.faq.endsWith('?'))) errs.push(`${at}: faq is a question or null`);
  }
  for (const g of groups) if (!entries.some((e) => e.group === g.id)) errs.push(`group ${g.id}: has no entry`);
  return errs;
}
