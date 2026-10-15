// The register of quoted passages (data/quotes.json) and what CI can say about it.
//
// WHAT THIS CHECKS, AND WHAT IT DOES NOT. Every check here is offline and is about CONSISTENCY: the sentence of a data_policy, each
// phrase a note puts between « » and each claim that a page says nothing about plans is backed by an entry of the register, with its
// source page, the day it was read and how the page text was made. It does NOT prove that the page says that today, or ever did:
// that needs a reading with the network (npm run verify-quotes). Nothing here may be described as "verified by CI".
import { hasHiddenChars } from './hidden-chars.mjs';
import { ABSENCE_TERMS, METHOD } from './page-text.mjs';

export const KINDS = ['sentence', 'note_passage', 'absence_check'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SHA_RE = /^[0-9a-f]{64}$/;
const SPAN_RE = /«([^»]*)»/g;

/** The phrases a note puts between « » (the provider's own words). */
export function noteSpans(note) { return [...String(note || '').matchAll(SPAN_RE)].map((m) => m[1]); }

/** True when a note says something about the WHOLE page ("the page names no plan", "has no mention of ..."). A claim limited to the
 * sentence or to its answer ("names no plan in this sentence", "the answer does not name a plan") is not one: no machine can test it. */
export function claimsPageAbsence(note) {
  return /\b(?:page|policy|terms|document)\s+(?:names\s+no|(?:has|have)\s+no\s+mention)\b(?![^.;]*\bin\s+(?:this|that|the)\s+sentence)/i.test(String(note || ''));
}

export function totalHits(hits) { return ABSENCE_TERMS.reduce((n, t) => n + (hits && Number.isInteger(hits[t]) ? hits[t] : 0), 0); }

/** @returns {string[]} one line per problem; empty = the register is consistent with the data */
export function quoteErrors(data, registry) {
  const errors = [];
  const fail = (m) => errors.push(m);
  if (!registry || registry.version !== 1 || !Array.isArray(registry.entries)) return ['quotes.json: needs version 1 and an entries list'];
  const withPolicy = new Map((data.providers || []).filter((p) => p.data_policy).map((p) => [p.slug, p.data_policy]));
  const seen = new Set();
  const by = { sentence: new Map(), note_passage: new Map(), absence_check: new Map() };
  for (const e of registry.entries) {
    const where = `quotes.json ${e && e.id}`;
    if (!e || typeof e.id !== 'string' || !e.id) { fail('quotes.json: an entry has no id'); continue; }
    if (seen.has(e.id)) fail(`${where}: duplicate id`); seen.add(e.id);
    if (!withPolicy.has(e.slug)) { fail(`${where}: provider "${e.slug}" has no data_policy`); continue; }
    if (!KINDS.includes(e.kind)) { fail(`${where}: unknown kind ${JSON.stringify(e.kind)}`); continue; }
    if (!/^https:\/\/[^\s]+$/.test(e.source_url || '')) fail(`${where}: source_url must be an https address`);
    if (!DATE_RE.test(e.read_on || '') || e.read_on > data.generated) fail(`${where}: read_on must be a date not after the dataset's generated date`);
    if (e.method !== METHOD) fail(`${where}: method must be the one in scripts/lib/page-text.mjs`);
    if (!/^[a-z]{2,3}(-[A-Za-z0-9]+)*$/.test(e.lang || '')) fail(`${where}: lang must be the language of the passage and of the page it is read in (for example en)`);
    if (e.page_sha256 !== null && !SHA_RE.test(e.page_sha256 || '')) fail(`${where}: page_sha256 must be null (page not read) or 64 hex characters`);
    if (e.kind === 'absence_check') {
      if (JSON.stringify(e.terms) !== JSON.stringify(ABSENCE_TERMS)) fail(`${where}: terms must be exactly ${ABSENCE_TERMS.join(', ')}`);
      if (e.hits !== null && !(e.hits && ABSENCE_TERMS.every((t) => Number.isInteger(e.hits[t]) && e.hits[t] >= 0))) fail(`${where}: hits must be null or a count for each term`);
      if ((e.hits === null) !== (e.page_sha256 === null)) fail(`${where}: hits and page_sha256 are both null (page not read) or both set`);
      if ('text' in e) fail(`${where}: an absence check has no text`);
      if (by.absence_check.has(e.slug)) fail(`${where}: second absence check for ${e.slug}`); by.absence_check.set(e.slug, e);
      continue;
    }
    if (typeof e.text !== 'string' || !e.text.trim() || e.text.length > 400) fail(`${where}: text must be 1 to 400 characters`);
    else if (hasHiddenChars(e.text)) fail(`${where}: text has control, bidirectional or zero-width characters`);
    else if (/\s{2}|^\s|\s$/.test(e.text)) fail(`${where}: text must have its white space collapsed, as the page text is`);
    if (e.kind === 'sentence') { if (by.sentence.has(e.slug)) fail(`${where}: second sentence for ${e.slug}`); by.sentence.set(e.slug, e); }
    else { if (!by.note_passage.has(e.slug)) by.note_passage.set(e.slug, []); by.note_passage.get(e.slug).push(e); }
  }
  for (const [slug, dp] of withPolicy) {
    const s = by.sentence.get(slug);
    if (dp.quote != null) {
      if (!s) fail(`${slug}: the quote of its data_policy has no sentence entry in quotes.json`);
      else { if (s.text !== dp.quote) fail(`${slug}: the sentence entry is not byte for byte the quote of its data_policy`); if (s.source_url !== dp.source) fail(`${slug}: the sentence entry has another source than its data_policy`); }
    } else if (s) fail(`${slug}: a sentence entry but no quote in its data_policy`);
    const spans = noteSpans(dp.note); const passages = by.note_passage.get(slug) || [];
    for (const sp of spans) if (!passages.some((p) => p.text === sp)) fail(`${slug}: the note puts «${sp.slice(0, 50)}» between guillemets and quotes.json has no such passage for it`);
    for (const p of passages) if (!spans.includes(p.text)) fail(`${slug}: quotes.json has a passage that its note does not carry (${p.id})`);
    if (new Set(spans).size !== spans.length) fail(`${slug}: the same passage twice in the note`);
    const a = by.absence_check.get(slug);
    if (claimsPageAbsence(dp.note)) {
      if (!a) fail(`${slug}: the note says something about the whole page and quotes.json has no absence check for it`);
      else if (a.hits === null) fail(`${slug}: the absence check of the note was never read`);
      else if (totalHits(a.hits) > 0) fail(`${slug}: the note says the page has none of ${ABSENCE_TERMS.join(', ')}, and the page was read with ${JSON.stringify(a.hits)}`);
      if (a && a.source_url !== dp.source) fail(`${slug}: the absence check has another source than its data_policy`);
    } else if (a) fail(`${slug}: an absence check that no claim of the note uses`);
  }
  return errors;
}
