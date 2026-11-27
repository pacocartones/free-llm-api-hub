// not-free.mjs — "Notably NOT free": the providers people expect to be free that are not, or stopped being free.
//
// One source, data/not-free.json, two outputs: the README section between <!-- AUTOGEN:not-free:start/end --> and the
// /not-free/ page. Both are rendered here from the same entries, so they cannot drift. The quotes are not new evidence:
// each is copied verbatim from docs/sources.md (with its source URL and date) or referenced by id from data/quotes.json,
// and scripts/use-data-pages.test.mjs checks that.
//
// Pure functions of their arguments (the data, the providers and the scores): the page is drift-gated and deterministic.

import { escapeHtml } from './html.mjs';
import { timeHtml, humanDate } from './dates.mjs';
import { NOT_STATED } from './not-stated.mjs';
import { inlineHtml } from './markdown.mjs';
import { breadcrumbList } from './page-jsonld.mjs';
import { websiteRef, datasetRef } from './site-entity.mjs';
import { isoDateTime } from './structured-data.mjs';
// The guard on data/not-free.json is a data module of its own, so validate.mjs runs it without the renderers below.
export { notFreeErrors } from './not-free-data.mjs';

export const NOT_FREE_PATH = '/not-free/';
export const ALTERNATIVES_MAX = 3;

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
      const tail = [e.checked ? `checked ${humanDate(e.checked) || e.checked}` : 'date not stated'];
      if (e.sources.length) tail.push(sourceLinksMd(e.sources));
      out.push(`- **${e.name}** — ${e.short} (${tail.join(' · ')})`);
    }
  }
  out.push('', doc.alternatives_note);
  return out.join('\n');
}

const mdInline = (s, site) => inlineHtml(s, { repo: '', site });
const sourcesHtml = (sources) => sources.map((s) => `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener">${escapeHtml(s.label)}</a>`).join(' · ');
const checkedHtml = (c) => (c ? timeHtml(c, escapeHtml) : `<span class="gpu-unstated">${NOT_STATED}</span>`);
const altLinks = (alts, prefix) => alts.map((p) => `<a href="${prefix}p/${escapeHtml(p.slug)}">${escapeHtml(p.name)}</a>`).join(', ');

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
    return `<blockquote class="gpu-quote">${g.texts.map((t) => `<p>“${escapeHtml(t)}”</p>`).join('')}<footer class="muted">${src}${src && g.read ? ' · ' : ''}${g.read ? `read ${timeHtml(g.read, escapeHtml)}` : ''}</footer></blockquote>`;
  }).join('');
}

// The answer as plain text (JSON-LD) and as HTML (the page), from the same parts.
function faqAnswerText(e, alts) {
  const when = e.checked ? ` Checked ${e.checked} against the provider's own page.` : '';
  const alt = alts.length ? ` Closest free alternatives in the dataset: ${alts.map((p) => p.name).join(', ')}.` : '';
  return `${e.summary}${when}${alt}`;
}
function faqAnswerHtml(e, alts, prefix) {
  const when = e.checked ? ` Checked ${timeHtml(e.checked, escapeHtml)} against the provider's own page.` : '';
  const alt = alts.length ? ` Closest free alternatives in the dataset: ${altLinks(alts, prefix)}.` : '';
  return `${escapeHtml(e.summary)}${when}${alt}`;
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
        ['What people expect', escapeHtml(e.expectation)],
        ['What the provider’s page says', `${escapeHtml(e.summary)}${quotesHtml(quotes)}${!quotes.length && e.sources.length ? `<p class="muted">${sourcesHtml(e.sources)}</p>` : ''}${!quotes.length && !e.sources.length ? '<p class="gpu-unstated">No quote or source link is recorded in this repository yet.</p>' : ''}`],
        ['Checked (UTC)', checkedHtml(e.checked)],
        ['Closest free alternatives', alts.length ? altLinks(alts, prefix) : '<span class="gpu-unstated">none in the dataset for this modality</span>'],
        ...(listed ? [['In the dataset', `<a href="${prefix}p/${escapeHtml(listed.slug)}">${escapeHtml(listed.name)}: current entry</a>`]] : []),
      ].map(([k, v]) => `<div class="gpu-claim"><dt>${k}</dt><dd>${v}</dd></div>`).join('');
      return `<section class="gpu-entry" id="${e.id}"><h3>${escapeHtml(e.name)}</h3><dl class="gpu-claims">${claims}</dl></section>`;
    }).join('');
    return `<h2 id="${g.id}">${escapeHtml(g.title)}</h2><p>${mdInline(g.intro, site)}</p>${items}`;
  }).join('');
  const jump = `<nav class="colls" aria-label="Jump to a provider">${entries.map(({ e }) => `<a href="#${e.id}">${escapeHtml(e.name)}</a>`).join('')}</nav>`;
  const faqHtml = faq.length
    ? `<h2 id="faq">FAQ</h2>` + faq.map(({ e, alts }) => `<div class="faq-item"><h3>${escapeHtml(e.faq)}</h3><p>${faqAnswerHtml(e, alts, prefix)}</p></div>`).join('')
    : '';
  return pageHero({
    crumbs: `<a href="${prefix}">Home</a> / Not free`,
    h1: 'Which LLM APIs are not free',
    lede: `The APIs people most often expect to be free, and are not, or stopped being free. Each says what the provider’s own page says, the day it was read, and the closest free alternatives in the dataset.`,
  }) +
    `<main id="main"><div class="wrap prose">` +
    `<p class="answer"><strong>${escapeHtml(answer)}</strong></p>` +
    jump +
    `<div class="prov-summary"><h2>Free instead</h2><p>${mdInline(doc.alternatives_note, site)} Every free tier in the <a href="${prefix}#explorer">explorer</a> is dated and sourced.</p></div>` +
    groupHtml +
    faqHtml +
    `<h2>How this list is kept</h2><p>Each entry comes from a read of the provider’s own billing, pricing or rate-limit page, with the date of that read. The quotes are the same ones recorded in the repository’s <a href="https://github.com/pacocartones/free-llm-api-hub/blob/main/docs/sources.md#checked-with-what-each-page-says" target="_blank" rel="noopener">source register</a>; see the <a href="${prefix}methodology/">methodology</a>. Seen a provider change its terms? <a href="${prefix}submit/">Tell us</a>.</p>` +
    `<p class="prov-back"><a href="${prefix}guides-and-collections/">← Guides &amp; collections</a></p>` +
    `</div></main>`;
}

/** JSON-LD: the page (about the dataset), its trail and the FAQ. No Product or Offer: nothing here is a price. */
export function notFreeJsonLd(model, { site, dateModified, dataset }) {
  const url = `${site}${NOT_FREE_PATH}`;
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebPage', name: 'Which LLM APIs are not free', url, description: notFreeDescription(model), ...(dateModified ? { dateModified: isoDateTime(dateModified) } : {}), isPartOf: websiteRef(site), about: datasetRef(site, dataset) },
      breadcrumbList(site, [['Not free', url]]),
      ...(model.faq.length ? [{
        '@type': 'FAQPage',
        mainEntity: model.faq.map(({ e, alts }) => ({ '@type': 'Question', name: e.faq, acceptedAnswer: { '@type': 'Answer', text: faqAnswerText(e, alts) } })),
      }] : []),
    ],
  });
}

