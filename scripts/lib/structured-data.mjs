// structured-data.mjs — shared pieces of the site's JSON-LD, and the checks Google's Rich Results Test applies to it.
//
// - isoDateTime: every datePublished / dateModified is a full ISO 8601 datetime with a timezone (Google flags a bare
//   date or a datetime without an offset as invalid). The data records days, so a day becomes midnight UTC.
// - datasetFacts: the description and licence every nested Dataset node carries. A Dataset without `description`
//   is invalid for Google, and a page that names the dataset (a provider page, /not-free/, /api/ ...) emits one.
//   The node shares the home Dataset's @id, so the description is the dataset's, not the page's: one sentence from
//   the data (what is free, how many providers, the data date).
// - guideArticle: the Article node of a guide, with the site's author model (Person creator as author, Organization
//   publisher), the guide's OG image and its publication date.
// - jsonLdErrors: the rules above as a list of errors, for the tests that walk every built page.
//
// Pure functions of their arguments, no clock: the build stays byte-stable for a given dataset.

import { entityIds, PUBLISHER_NAME, CREATOR } from './site-entity.mjs';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
// A datetime with seconds and a timezone (Z or ±hh:mm), as Google's validator wants it.
export const ISO_DATETIME_TZ = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/** A recorded day ("2026-11-24") as a datetime with a timezone ("2026-11-24T00:00:00Z"). A datetime passes through. */
export function isoDateTime(d) {
  if (typeof d === 'string' && DAY.test(d)) return `${d}T00:00:00Z`;
  if (typeof d === 'string' && ISO_DATETIME_TZ.test(d) && !Number.isNaN(Date.parse(d))) return d;
  throw new Error(`not a date: ${JSON.stringify(d)}`);
}

/** The licence URL of the dataset, from CITATION.cff's `license` (the home Dataset uses the same). */
export const licenseUrl = (spdx) => (spdx === 'MIT' ? 'https://opensource.org/licenses/MIT' : undefined);

/** The description and licence of every nested Dataset node. `verified` is the verified-provider count. */
export function datasetFacts({ verified, asOf, license }) {
  return {
    description: `The Free LLM API Hub dataset: ${verified} verified LLM API providers with a free tier or trial credit, recording what each one gives for free, its rate limits and whether a card or phone number is needed, each sourced to the provider's own page; data as of ${asOf}.`,
    license,
  };
}

// The date each guide was first published at /guides/<slug>, from the commit that added it. A guide missing here
// (a new one) is dated by the dataset date until it is added; jsonLdErrors still sees valid dates either way.
export const GUIDE_PUBLISHED = {
  'free-llm-api-without-credit-card': '2026-07-30',
  'openai-compatible-free-apis': '2026-07-30',
  'free-llm-api-no-signup': '2026-07-30',
  'free-embeddings-apis': '2026-07-30',
  'free-speech-to-text-apis': '2026-07-30',
  'free-ocr-document-ai-apis': '2026-07-31',
  'free-image-generation-apis': '2026-07-31',
  'free-reranking-apis': '2026-10-20',
  'free-vision-apis': '2026-10-20',
  'openai-api-alternatives': '2026-11-25',
  'choose-free-llm-api-for-production': '2026-11-25',
  'free-llm-api-no-credit-card-no-phone': '2026-11-25',
  'free-llm-api-for-coding': '2026-11-26',
  'free-api-for-rag': '2026-11-26',
  'free-llm-api-for-ai-agents': '2026-11-26',
  'free-chatbot-api': '2026-11-26',
  'free-ai-api-for-students': '2026-11-26',
};

/** datePublished and dateModified of a guide: its data moves with the dataset, never before it was published. */
export function guideDates(slug, asOf) {
  const published = GUIDE_PUBLISHED[slug] ?? asOf;
  const modified = asOf > published ? asOf : published;
  return { datePublished: isoDateTime(published), dateModified: isoDateTime(modified) };
}

/** The Article node of a guide. `extra` holds the page's own links (isPartOf, about). */
export function guideArticle({ site, slug, headline, description, asOf, extra = {} }) {
  const ids = entityIds(site);
  return {
    '@type': 'Article',
    headline,
    description,
    url: `${site}/guides/${slug}`,
    image: `${site}/og/guides/${slug}.png`,
    ...guideDates(slug, asOf),
    author: { '@type': 'Person', '@id': ids.creator, name: CREATOR.name, url: CREATOR.url },
    publisher: { '@type': 'Organization', '@id': ids.publisher, name: PUBLISHER_NAME },
    ...extra,
  };
}

// ---------- checks ----------

const types = (n) => [].concat(n?.['@type'] ?? []);
// What a page-like node may be part of: the site, or a page of it. A Dataset may only be part of a larger Dataset
// (Google's Dataset guide), so the home Dataset names no isPartOf.
const PAGE_PARENTS = new Set(['WebSite', 'WebPage', 'CollectionPage']);
const DATE_KEYS = ['datePublished', 'dateModified', 'dateCreated', 'uploadDate'];

/** Every object node in a JSON-LD value, depth first. */
function* nodes(v) {
  if (Array.isArray(v)) { for (const x of v) yield* nodes(x); return; }
  if (!v || typeof v !== 'object') return;
  yield v;
  for (const x of Object.values(v)) yield* nodes(x);
}

/** The errors in one parsed JSON-LD block (empty when valid). `where` prefixes each message. */
export function jsonLdErrors(ld, where = '') {
  const errors = [];
  const at = (msg) => errors.push(where ? `${where}: ${msg}` : msg);
  const byId = new Map();
  for (const n of nodes(ld)) if (n['@id'] && n['@type']) byId.set(n['@id'], n);
  const resolve = (ref) => (ref && !ref['@type'] && ref['@id'] ? byId.get(ref['@id']) : ref);

  for (const n of nodes(ld)) {
    const t = types(n);
    for (const k of DATE_KEYS) {
      if (n[k] === undefined) continue;
      if (typeof n[k] !== 'string' || !ISO_DATETIME_TZ.test(n[k]) || Number.isNaN(Date.parse(n[k]))) at(`${t.join('/') || 'node'}.${k} is not an ISO 8601 datetime with a timezone: ${JSON.stringify(n[k])}`);
    }
    if (t.includes('Dataset')) {
      for (const k of ['name', 'description', 'license']) if (typeof n[k] !== 'string' || !n[k].trim()) at(`Dataset ${n['@id'] ?? n.name ?? ''} has no ${k}`);
      if (typeof n.description === 'string' && (n.description.length < 50 || n.description.length > 5000)) at(`Dataset description must be 50–5000 characters`);
    }
    if (t.includes('Article')) {
      for (const k of ['headline', 'author', 'image', 'datePublished', 'dateModified']) if (n[k] === undefined || n[k] === '') at(`Article ${n.url ?? ''} has no ${k}`);
      if (n.datePublished && n.dateModified && Date.parse(n.dateModified) < Date.parse(n.datePublished)) at(`Article ${n.url ?? ''} is modified before it was published`);
    }
    if (n.isPartOf !== undefined) {
      for (const ref of [].concat(n.isPartOf)) {
        const parent = resolve(ref);
        const pt = types(parent);
        if (!parent || !pt.length) { at(`${t.join('/')}.isPartOf ${JSON.stringify(ref)} does not resolve to a typed node`); continue; }
        const ok = t.includes('Dataset') ? pt.includes('Dataset') : pt.some((x) => PAGE_PARENTS.has(x));
        if (!ok) at(`${t.join('/')}.isPartOf points at a ${pt.join('/')}`);
      }
    }
  }
  return errors;
}

/** Every JSON-LD block of an HTML page, parsed. Throws on a block that is not JSON. */
export const pageJsonLd = (html) =>
  [...String(html).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
