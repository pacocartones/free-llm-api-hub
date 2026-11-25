// not-free.mjs — "Notably NOT free": the providers people expect to be free that are not, or stopped being free.
//
// One source, data/not-free.json, two outputs: the README section between <!-- AUTOGEN:not-free:start/end --> and the
// /not-free/ page. Both are rendered here from the same entries, so they cannot drift. The quotes are not new evidence:
// each is copied verbatim from docs/sources.md (with its source URL and date) or referenced by id from data/quotes.json,
// and scripts/not-free.test.mjs checks that.
//
// Pure functions of their arguments (the data, the providers and the scores): the page is drift-gated and deterministic.

import { htmlEsc, SLUG_RE } from './rows.mjs';
import { inlineHtml } from './markdown.mjs';
import { breadcrumbList } from './page-jsonld.mjs';
import { websiteRef, datasetRef } from './site-entity.mjs';

export const NOT_FREE_PATH = '/not-free/';
const MODALITIES = new Set(['text', 'vision', 'image', 'audio', 'embeddings', 'rerank', 'ocr']);
const CHECKED_RE = /^\d{4}-\d{2}-\d{2}(\/\d{2})?$/;
export const ALTERNATIVES_MAX = 3;

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

/** The quotes of an entry with where they come from: its own (docs/sources.md) and those referenced in data/quotes.json. */
export function entryQuotes(e, quotes = []) {
  const own = (e.quotes || []).map((text) => ({ text, sources: e.sources, read: e.checked }));
  const byId = new Map(quotes.map((q) => [q.id, q]));
  const referenced = (e.quote_ids || []).map((id) => byId.get(id)).filter(Boolean)
    .map((q) => ({ text: q.text, sources: [(e.sources || []).find((s) => s.url === q.source_url) || { label: 'Source', url: q.source_url }], read: q.read_on }));
  return [...own, ...referenced];
}

/**
 * The closest free alternatives in the dataset: verified providers with an ongoing free tier (not a trial) that share a
 * modality with the entry, best score first (then name), never the entry's own provider.
 */
export function closestAlternatives(e, providers, scoreOf = () => null, max = ALTERNATIVES_MAX) {
  const mods = new Set(e.modalities);
  return providers
    .filter((p) => p.verified === true && p.category === 'ongoing' && p.slug !== e.slug && (p.modalities || []).some((m) => mods.has(m)))
    .map((p) => ({ p, s: scoreOf(p.slug) }))
    .sort((a, b) => (b.s ?? -1) - (a.s ?? -1) || (a.p.name < b.p.name ? -1 : a.p.name > b.p.name ? 1 : 0))
    .slice(0, max)
    .map((x) => x.p);
}

const sourceLinksMd = (sources) => sources.map((s) => `[${s.label}](${s.url})`).join(' · ');

/** The README section (between the AUTOGEN:not-free markers). */
export function notFreeReadmeMd(doc, { site }) {
  const out = [
    `Worth saying plainly: these are the APIs people most often expect to be free. Each line says what the provider's own page says and the day it was read (UTC). The [Not free page](${site}${NOT_FREE_PATH}) adds the provider's own words and the closest free alternatives in the dataset; the quotes are also in [docs/sources.md](docs/sources.md#checked-with-what-each-page-says).`,
  ];
  for (const g of doc.groups) {
    out.push('', `**${g.title}.** ${g.intro}`, '');
    for (const e of doc.entries.filter((x) => x.group === g.id)) {
      const tail = [e.checked ? `checked ${e.checked}` : 'date not recorded'];
      if (e.sources.length) tail.push(sourceLinksMd(e.sources));
      out.push(`- **${e.name}** — ${e.short} (${tail.join(' · ')})`);
    }
  }
  out.push('', doc.alternatives_note);
  return out.join('\n');
}

const mdInline = (s, site) => inlineHtml(s, { repo: '', site });
const sourcesHtml = (sources) => sources.map((s) => `<a href="${htmlEsc(s.url)}" target="_blank" rel="noopener">${htmlEsc(s.label)}</a>`).join(' · ');
const checkedHtml = (c) => (c ? (/^\d{4}-\d{2}-\d{2}$/.test(c) ? `<time datetime="${c}">${c}</time>` : htmlEsc(c)) : '<span class="gpu-unstated">not recorded</span>');
const altLinks = (alts, prefix) => alts.map((p) => `<a href="${prefix}p/${htmlEsc(p.slug)}">${htmlEsc(p.name)}</a>`).join(', ');

// Quotes read from the same pages on the same day share one block and one source line.
function quotesHtml(quotes) {
  const groups = [];
  for (const q of quotes) {
    const key = JSON.stringify([q.sources.map((s) => s.url), q.read]);
    const g = groups.find((x) => x.key === key);
    if (g) g.texts.push(q.text); else groups.push({ key, texts: [q.text], sources: q.sources, read: q.read });
  }
  return groups.map((g) => {
    const src = sourcesHtml(g.sources);
    return `<blockquote class="gpu-quote">${g.texts.map((t) => `<p>“${htmlEsc(t)}”</p>`).join('')}<footer class="muted">${src}${src && g.read ? ' · ' : ''}${g.read ? `read ${htmlEsc(g.read)}` : ''}</footer></blockquote>`;
  }).join('');
}

// The answer as plain text (JSON-LD) and as HTML (the page), from the same parts.
function faqAnswerText(e, alts) {
  const when = e.checked ? ` Checked ${e.checked} against the provider's own page.` : '';
  const alt = alts.length ? ` Closest free alternatives in the dataset: ${alts.map((p) => p.name).join(', ')}.` : '';
  return `${e.summary}${when}${alt}`;
}
function faqAnswerHtml(e, alts, prefix) {
  const when = e.checked ? ` Checked ${htmlEsc(e.checked)} against the provider's own page.` : '';
  const alt = alts.length ? ` Closest free alternatives in the dataset: ${altLinks(alts, prefix)}.` : '';
  return `${htmlEsc(e.summary)}${when}${alt}`;
}

/** Everything the page needs, computed once: entries with their quotes and alternatives, and the FAQ. */
export function notFreeModel(doc, { providers, quotes = [], scoreOf }) {
  const bySlug = new Map(providers.map((p) => [p.slug, p]));
  const entries = doc.entries.map((e) => ({ e, quotes: entryQuotes(e, quotes), alts: closestAlternatives(e, providers, scoreOf), listed: e.slug ? bySlug.get(e.slug) : null }));
  return { doc, entries, faq: entries.filter((x) => x.e.faq) };
}

export function notFreeTitle() {
  return 'Which LLM APIs are not free? OpenAI, GitHub Models, Mistral · Free LLM API Hub';
}
export function notFreeDescription(model) {
  return `Is the OpenAI API free? GitHub Models free tier? Mistral free API? ${model.entries.length} APIs people expect to be free, with each provider's own words, the date and free alternatives.`;
}

/** The <main> of /not-free/ (the hero goes first, as on every generated page). */
export function notFreeMainHtml(model, { pageHero, site, prefix = '../' }) {
  const { doc, entries, faq } = model;
  const namesOf = (gid) => entries.filter((x) => x.e.group === gid).map((x) => x.e.name);
  const list = (names) => names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  const answer = doc.groups.map((g) => `${g.title}: ${list(namesOf(g.id))}.`).join(' ');
  const groupHtml = doc.groups.map((g) => {
    const items = entries.filter((x) => x.e.group === g.id).map(({ e, quotes, alts, listed }) => {
      const claims = [
        ['What people expect', htmlEsc(e.expectation)],
        ['What the provider’s page says', `${htmlEsc(e.summary)}${quotesHtml(quotes)}${!quotes.length && e.sources.length ? `<p class="muted">${sourcesHtml(e.sources)}</p>` : ''}${!quotes.length && !e.sources.length ? '<p class="gpu-unstated">No quote or source link is recorded in this repository yet.</p>' : ''}`],
        ['Checked (UTC)', checkedHtml(e.checked)],
        ['Closest free alternatives', alts.length ? altLinks(alts, prefix) : '<span class="gpu-unstated">none in the dataset for this modality</span>'],
        ...(listed ? [['In the dataset', `<a href="${prefix}p/${htmlEsc(listed.slug)}">${htmlEsc(listed.name)}: current entry</a>`]] : []),
      ].map(([k, v]) => `<div class="gpu-claim"><dt>${k}</dt><dd>${v}</dd></div>`).join('');
      return `<section class="gpu-entry" id="${e.id}"><h3>${htmlEsc(e.name)}</h3><dl class="gpu-claims">${claims}</dl></section>`;
    }).join('');
    return `<h2 id="${g.id}">${htmlEsc(g.title)}</h2><p>${mdInline(g.intro, site)}</p>${items}`;
  }).join('');
  const jump = `<nav class="colls" aria-label="Jump to a provider">${entries.map(({ e }) => `<a href="#${e.id}">${htmlEsc(e.name)}</a>`).join('')}</nav>`;
  const faqHtml = faq.length
    ? `<h2 id="faq">FAQ</h2>` + faq.map(({ e, alts }) => `<div class="faq-item"><h3>${htmlEsc(e.faq)}</h3><p>${faqAnswerHtml(e, alts, prefix)}</p></div>`).join('')
    : '';
  return pageHero({
    crumbs: `<a href="${prefix}">Home</a> / Not free`,
    h1: 'Which LLM APIs are not free',
    lede: `The APIs people most often expect to be free, and are not, or stopped being free. Each says what the provider’s own page says, the day it was read, and the closest free alternatives in the dataset.`,
  }) +
    `<main id="main"><div class="wrap prose">` +
    `<p class="answer"><strong>${htmlEsc(answer)}</strong></p>` +
    jump +
    `<div class="prov-summary"><h2>Free instead</h2><p>${mdInline(doc.alternatives_note, site)} Every free tier in the <a href="${prefix}#explorer">explorer</a> is dated and sourced.</p></div>` +
    groupHtml +
    faqHtml +
    `<h2>How this list is kept</h2><p>Each entry comes from a read of the provider’s own billing, pricing or rate-limit page, with the date of that read. The quotes are the same ones recorded in the repository’s <a href="https://github.com/pacocartones/free-llm-api-hub/blob/main/docs/sources.md#checked-with-what-each-page-says" target="_blank" rel="noopener">source register</a>; see the <a href="${prefix}methodology/">methodology</a>. Seen a provider change its terms? <a href="${prefix}submit/">Tell us</a>.</p>` +
    `<p class="prov-back"><a href="${prefix}guides-and-collections/">← Guides &amp; collections</a></p>` +
    `</div></main>`;
}

/** JSON-LD: the page (about the dataset), its trail and the FAQ. No Product or Offer: nothing here is a price. */
export function notFreeJsonLd(model, { site, dateModified }) {
  const url = `${site}${NOT_FREE_PATH}`;
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebPage', name: 'Which LLM APIs are not free', url, description: notFreeDescription(model), ...(dateModified ? { dateModified } : {}), isPartOf: websiteRef(site), about: datasetRef(site) },
      breadcrumbList(site, [['Not free', url]]),
      ...(model.faq.length ? [{
        '@type': 'FAQPage',
        mainEntity: model.faq.map(({ e, alts }) => ({ '@type': 'Question', name: e.faq, acceptedAnswer: { '@type': 'Answer', text: faqAnswerText(e, alts) } })),
      }] : []),
    ],
  });
}

