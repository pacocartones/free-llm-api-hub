// The entries of data/quotes.json for ONE provider, made by reading its source page: what a contributor runs after writing a data_policy row
// (`npm run quotes:add -- <slug>`), so that nobody types a hash or a date by hand.
import { READ_HEADERS, METHOD, htmlToText, collapse, sha256, absenceHits, declaredLanguage, sameLanguage, ABSENCE_TERMS } from './page-text.mjs';
import { noteSpans, claimsPageAbsence, totalHits } from './quotes.mjs';

const KIND_ORDER = { sentence: 0, note_passage: 1, absence_check: 2 };

/** Reads a page the way verify-quotes does. @returns {Promise<{ok: boolean, text?: string, why?: string}>} */
export async function readText(url, fetchImpl = fetch) {
  let res;
  try { res = await fetchImpl(url, { headers: READ_HEADERS, redirect: 'follow', signal: AbortSignal.timeout(30000) }); }
  catch (e) { return { ok: false, why: `could not read ${url}: ${String((e && e.message) || e).slice(0, 80)}` }; }
  if (!res.ok) return { ok: false, why: `${url} answered HTTP ${res.status}` };
  const html = await res.text(); const text = htmlToText(html);
  if (text.length < 200) return { ok: false, why: `${url} gave only ${text.length} characters of text (a page that needs scripts cannot be read this way)` };
  const lang = declaredLanguage(html, res.headers.get('content-language'));
  if (!sameLanguage('en', lang)) return { ok: false, why: `${url} declares the language ${lang}, not English: the quote would not be compared with the page it is in` };
  return { ok: true, text };
}

/**
 * @param {string} slug
 * @param {object} policy the data_policy of the row
 * @param {(url: string) => Promise<{ok: boolean, text?: string, why?: string}>} read
 * @param {{today: string, passageUrls?: Record<string,string>}} opts passageUrls: text of a passage -> the page it comes from, when it is not the source of the row
 * @returns {Promise<{entries: object[], problems: string[]}>}
 */
export async function entriesFor(slug, policy, read, { today, passageUrls = {} }) {
  const problems = []; const entries = [];
  const pages = new Map();
  const page = async (url) => { if (!pages.has(url)) pages.set(url, await read(url)); return pages.get(url); };
  const make = (kind, n, fields, url, pg) => ({ id: `${slug}.${kind}${n ? `.${n}` : ''}`, slug, kind, ...fields, source_url: url, read_on: today, lang: 'en', method: METHOD, page_sha256: sha256(pg.text) });
  if (typeof policy.quote === 'string' && policy.quote) {
    const pg = await page(policy.source);
    if (!pg.ok) problems.push(pg.why);
    else if (!pg.text.includes(collapse(policy.quote))) problems.push(`the quote of ${slug} is not literally on ${policy.source} (checked with the page text as scripts/lib/page-text.mjs makes it)`);
    else entries.push(make('sentence', 0, { text: policy.quote }, policy.source, pg));
  }
  const spans = noteSpans(policy.note);
  for (let i = 0; i < spans.length; i++) {
    const text = spans[i]; const url = passageUrls[text] || policy.source; const pg = await page(url);
    if (!pg.ok) { problems.push(pg.why); continue; }
    if (!pg.text.includes(collapse(text))) { problems.push(`the passage «${text.slice(0, 50)}» of the note of ${slug} is not on ${url}${passageUrls[text] ? '' : ' (if it comes from another page, say so with --passage-url)'}`); continue; }
    entries.push(make('note_passage', i + 1, { text }, url, pg));
  }
  if (claimsPageAbsence(policy.note)) {
    const pg = await page(policy.source);
    if (!pg.ok) problems.push(pg.why);
    else {
      const hits = absenceHits(pg.text);
      if (totalHits(hits) > 0) problems.push(`the note of ${slug} says something about the whole page, and the page has ${JSON.stringify(hits)} of ${ABSENCE_TERMS.join(', ')}: say what the sentence or the clause names, not the page`);
      else entries.push({ id: `${slug}.absence_check`, slug, kind: 'absence_check', terms: ABSENCE_TERMS, hits, source_url: policy.source, read_on: today, lang: 'en', method: METHOD, page_sha256: sha256(pg.text) });
    }
  }
  return { entries, problems };
}

/** The register with the entries of `slug` replaced by `fresh`, in the order of the dataset (then sentence, passages, absence check). */
export function mergeRegistry(registry, data, slug, fresh) {
  const order = new Map(data.providers.map((p, i) => [p.slug, i]));
  const kept = registry.entries.filter((e) => e.slug !== slug);
  const all = [...kept, ...fresh];
  all.sort((a, b) => (order.get(a.slug) ?? 1e9) - (order.get(b.slug) ?? 1e9) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.id.localeCompare(b.id, 'en', { numeric: true }));
  return { ...registry, entries: all };
}
