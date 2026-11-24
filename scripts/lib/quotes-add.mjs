// The entries of data/quotes.json for ONE provider, made by reading its source page: what a contributor runs after writing a data_policy row
// (`npm run quotes:add -- <slug>`), so that nobody types a hash or a date by hand.
import { methodFor, readHeaders, htmlToText, collapse, sha256, absenceHits, declaredLanguage, sameLanguage, ABSENCE_TERMS } from './page-text.mjs';
import { noteSpans, claimsPageAbsence, totalHits } from './quotes.mjs';
import { fetchPublicUrl } from './public-fetch.mjs';
import { isPdf, pdfToText, responseBytes } from './pdf-text.mjs';
import { PDF_METHOD } from './page-text.mjs';

const KIND_ORDER = { sentence: 0, note_passage: 1, absence_check: 2, field_sentence: 3, speed_quote: 4 };
import { speedQuoteId } from './published-speed.mjs';

/** Reads a page the way verify-quotes does. @returns {Promise<{ok: boolean, text?: string, why?: string}>} */
export async function readText(url, fetchImpl = fetchPublicUrl, lang = 'en') {
  let res; let html; let pdfText;
  try {
    res = await fetchImpl(url, { headers: readHeaders(lang), timeoutMs: 30000 });
    if (res.ok && isPdf(res.headers.get('content-type'), url)) pdfText = await pdfToText(await responseBytes(res));
    else if (res.ok) html = await res.text();
  }
  catch (e) { return { ok: false, why: `could not read ${url}: ${String((e && e.message) || e).slice(0, 80)}` }; }
  if (!res.ok) {
    try { res.body?.cancel()?.catch(() => {}); } catch { /* the page is already being abandoned */ }
    return { ok: false, why: `${url} answered HTTP ${res.status}` };
  }
  if (typeof pdfText === 'string') {
    if (!sameLanguage('en', lang)) return { ok: false, why: `${url} is a PDF; PDF sources are English-only for now` };
    if (pdfText.length < 200) return { ok: false, why: `${url} is a PDF with only ${pdfText.length} characters of text (a scanned PDF cannot be read this way)` };
    return { ok: true, text: pdfText, method: PDF_METHOD };
  }
  const text = htmlToText(html);
  if (text.length < 200) return { ok: false, why: `${url} gave only ${text.length} characters of text (a page that needs scripts cannot be read this way)` };
  const declared = declaredLanguage(html, res.headers.get('content-language'));
  if (!sameLanguage(lang, declared)) return { ok: false, why: `${url} declares the language ${declared}, not ${lang}: the quote would not be compared with the page it is in` };
  return { ok: true, text };
}

/**
 * @param {string} slug
 * @param {object} policy the data_policy of the row
 * @param {(url: string) => Promise<{ok: boolean, text?: string, why?: string}>} read
 * @param {{today: string, passageUrls?: Record<string,string>, lang?: string}} opts passageUrls: text of a passage -> the page it comes from, when it is not the source of the row
 * @returns {Promise<{entries: object[], problems: string[]}>}
 */
export async function entriesFor(slug, policy, read, { today, passageUrls = {}, lang = 'en' }) {
  const problems = []; const entries = [];
  const pages = new Map();
  const page = async (url) => { if (!pages.has(url)) pages.set(url, await read(url)); return pages.get(url); };
  const make = (kind, n, fields, url, pg) => ({ id: `${slug}.${kind}${n ? `.${n}` : ''}`, slug, kind, ...fields, source_url: url, read_on: today, lang, method: pg.method || methodFor(lang), page_sha256: sha256(pg.text) });
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
    if (!sameLanguage('en', lang)) problems.push(`the note of ${slug} says something about the whole page; absence checks are English-only for now, so narrow the note to the sentence or clause it names`);
    else {
      const pg = await page(policy.source);
      if (!pg.ok) problems.push(pg.why);
      else {
        const hits = absenceHits(pg.text);
        if (totalHits(hits) > 0) problems.push(`the note of ${slug} says something about the whole page, and the page has ${JSON.stringify(hits)} of ${ABSENCE_TERMS.join(', ')}: say what the sentence or the clause names, not the page`);
        else entries.push({ id: `${slug}.absence_check`, slug, kind: 'absence_check', terms: ABSENCE_TERMS, hits, source_url: policy.source, read_on: today, lang, method: pg.method || methodFor(lang), page_sha256: sha256(pg.text) });
      }
    }
  }
  return { entries, problems };
}

/**
 * The field_sentence entry of one stated field check: its quote, read on its first source.
 * @returns {Promise<{entries: object[], problems: string[]}>}
 */
export async function fieldEntriesFor(slug, field, check, read, { today, lang = 'en' }) {
  if (!check || typeof check.quote !== 'string' || !check.quote) return { entries: [], problems: [`${slug}: field_checks.${field} has no quote`] };
  const url = Array.isArray(check.sources) ? check.sources[0] : undefined;
  const pg = await read(url);
  if (!pg.ok) return { entries: [], problems: [pg.why] };
  if (!pg.text.includes(collapse(check.quote))) return { entries: [], problems: [`the quote of ${slug} field_checks.${field} is not literally on ${url} (its first source)`] };
  return { entries: [{ id: `${slug}.${field}.sentence`, slug, kind: 'field_sentence', field, text: check.quote, source_url: url, read_on: today, lang, method: pg.method || methodFor(lang), page_sha256: sha256(pg.text) }], problems: [] };
}

/**
 * The speed_quote entries of a provider: the quote of each published_speed entry, read on its source.
 * @returns {Promise<{entries: object[], problems: string[]}>}
 */
export async function speedEntriesFor(slug, list, read, { today, lang = 'en' }) {
  const entries = []; const problems = [];
  const pages = new Map();
  for (const e of Array.isArray(list) ? list : []) {
    if (!e || typeof e.quote !== 'string' || !e.quote) { problems.push(`${slug}: a published_speed entry has no quote`); continue; }
    if (!pages.has(e.source)) pages.set(e.source, await read(e.source));
    const pg = pages.get(e.source);
    if (!pg.ok) { problems.push(pg.why); continue; }
    if (!pg.text.includes(collapse(e.quote))) { problems.push(`the published_speed quote of ${slug} for ${e.model} is not literally on ${e.source}`); continue; }
    entries.push({ id: speedQuoteId(slug, e), slug, kind: 'speed_quote', model: e.model, metric: e.metric, text: e.quote, source_url: e.source, read_on: today, lang, method: pg.method || methodFor(lang), page_sha256: sha256(pg.text) });
  }
  return { entries, problems };
}

/**
 * The register with the entries of `slug` replaced by `fresh`, in the order of the dataset (then sentence, passages, absence check,
 * field sentences, speed quotes). With `field`, only that field's sentence is replaced; with `speed`, the slug's speed quotes are
 * replaced; without either, the data_policy entries of the slug are replaced and its field sentences and speed quotes are kept.
 */
export function mergeRegistry(registry, data, slug, fresh, { field, speed } = {}) {
  const order = new Map(data.providers.map((p, i) => [p.slug, i]));
  const replaced = (e) => e.slug === slug && (speed ? e.kind === 'speed_quote'
    : field ? e.id === `${slug}.${field}.sentence` : e.kind !== 'field_sentence' && e.kind !== 'speed_quote');
  const kept = registry.entries.filter((e) => !replaced(e));
  const all = [...kept, ...fresh];
  all.sort((a, b) => (order.get(a.slug) ?? 1e9) - (order.get(b.slug) ?? 1e9) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.id.localeCompare(b.id, 'en', { numeric: true }));
  return { ...registry, entries: all };
}
