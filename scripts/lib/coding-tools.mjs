// coding-tools.mjs — the rules of the "Free AI coding tools" section (data/coding-tools.json).
//
// Like the Free GPU section, it is kept apart from the provider ranking on purpose: its entries are not
// providers of the LLM dataset, so nothing here may share a slug with a provider and nothing here is counted,
// scored or collected with them. A value is "stated" only with at least one sentence quoted from the tool's own
// page, its https source and the day it was read; "not_stated" is never filled in and may carry a sentence of
// context. Pure: takes the parsed section and the provider slugs, returns the list of errors.

import { hasHiddenChars } from './hidden-chars.mjs';

export const CLAIM_FIELDS = ['free_access', 'limits', 'card_required', 'commercial_use', 'expires', 'trains_on_code'];
export const KINDS = ['ide-extension', 'editor', 'cli'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const URL_RE = /^https?:\/\/.+/;
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function quoteErrors(where, q) {
  const errs = [];
  if (!q || typeof q.text !== 'string' || !q.text.trim()) errs.push(`${where}: a quotation needs its text`);
  else if (hasHiddenChars(q.text)) errs.push(`${where}: a quotation must not contain control, bidirectional or zero-width characters`);
  if (!q || !URL_RE.test(q.source || '')) errs.push(`${where}: a quotation needs the tool's page as an http(s) source`);
  if (!q || !DATE_RE.test(q.read || '')) errs.push(`${where}: a quotation needs the day it was read (YYYY-MM-DD)`);
  return errs;
}

export function codingToolsErrors(section, providerSlugs) {
  const errs = [];
  if (!section || !Array.isArray(section.entries)) return ['coding-tools: "entries" must be an array'];
  const seen = new Set();
  for (const e of section.entries) {
    const id = `coding-tools/${e && e.slug}`;
    if (!e || !SLUG_RE.test(e.slug || '')) { errs.push(`${id}: slug must be lower-case words joined by hyphens`); continue; }
    if (seen.has(e.slug)) errs.push(`${id}: duplicate slug`);
    seen.add(e.slug);
    if (providerSlugs.has(e.slug)) errs.push(`${id}: shares its slug with a provider; this section must not mix with the provider ranking`);
    if (!e.name) errs.push(`${id}: name is required`);
    else if (hasHiddenChars(e.name)) errs.push(`${id}: name must not contain control, bidirectional or zero-width characters`);
    if (!URL_RE.test(e.url || '')) errs.push(`${id}: url must be the tool's page (http/https)`);
    if (!KINDS.includes(e.kind)) errs.push(`${id}: kind must be one of ${KINDS.join(', ')}`);
    for (const f of CLAIM_FIELDS) {
      const c = e.claims && e.claims[f];
      if (!c || !['stated', 'not_stated'].includes(c.state) || !Array.isArray(c.quotes)) { errs.push(`${id}.${f}: needs state stated/not_stated and a quotes array`); continue; }
      // A stated value must rest on a quoted sentence; "not stated" is never filled in.
      if (c.state === 'stated' && !c.quotes.length) errs.push(`${id}.${f}: stated without a quoted sentence`);
      c.quotes.forEach((q, i) => errs.push(...quoteErrors(`${id}.${f}[${i}]`, q)));
    }
    for (const f of Object.keys(e.claims || {})) if (!CLAIM_FIELDS.includes(f)) errs.push(`${id}: unknown claim "${f}"`);
  }
  for (const n of section.notes || []) {
    if (!n.subject || !n.text) errs.push('coding-tools note: subject and text are required');
    else if (hasHiddenChars(n.subject) || hasHiddenChars(n.text)) errs.push(`coding-tools note "${n.subject}": subject and text must not contain control, bidirectional or zero-width characters`);
    (n.quotes || []).forEach((q, i) => errs.push(...quoteErrors(`coding-tools note "${n.subject}"[${i}]`, q)));
  }
  return errs;
}
