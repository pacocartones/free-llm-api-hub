// free-coding-tools.mjs — the page of the "Free AI coding tools" section (data/coding-tools.json).
//
// Kept apart from the provider ranking on purpose (see coding-tools.mjs): nothing here is counted, scored or
// collected with the providers. This renderer only reads the section file. A value the tool's own page did not
// state reads "Not stated" and is never filled in, and never reads as "no"; a quoted sentence is shown with the
// page it comes from and the day it was read. Nothing is ranked or called best, and nothing is interpreted.

import { htmlEsc, SLUG_RE } from './rows.mjs';
import { claimsTableHtml } from './claims-table.mjs';

const safeHttp = (u) => (/^https?:\/\//i.test(String(u || '')) ? String(u) : '');

const LABELS = Object.freeze({
  free_access: 'Free access',
  limits: 'Limits',
  card_required: 'Card required',
  commercial_use: 'Commercial use',
  expires: 'Expiry',
  trains_on_code: 'What it does with your code',
});

const KIND_LABEL = Object.freeze({ 'ide-extension': 'IDE extension', editor: 'editor', cli: 'command-line tool' });

// The quote and entry blocks share their markup (and styles) with the Free GPU page.
const quoteHtml = (q) => {
  const src = safeHttp(q.source);
  const link = src ? `<a href="${htmlEsc(src)}" target="_blank" rel="noopener">${htmlEsc(new URL(src).hostname)}</a>` : '';
  return `<blockquote class="gpu-quote"><p>&ldquo;${htmlEsc(q.text)}&rdquo;</p><footer class="muted">${link}${link ? ' · ' : ''}read ${htmlEsc(q.read)}</footer></blockquote>`;
};

function claimHtml(slug, field, claim) {
  const quotes = claim.quotes.map(quoteHtml).join('');
  let state;
  if (claim.state === 'stated') state = '<span class="gpu-stated">Stated by the tool\'s page</span>';
  else if (claim.quotes.length) state = '<span class="gpu-unstated">Not stated</span> <span class="muted">Context quoted from the page:</span>';
  else state = '<span class="gpu-unstated">Not stated</span>';
  return `<div class="gpu-claim"${SLUG_RE.test(slug) ? ` id="${slug}-${field}"` : ''}><dt>${htmlEsc(LABELS[field] || field)}</dt><dd>${state}${quotes}</dd></div>`;
}

/** { tools, stated } computed from the entries: how many tools, and how many of their values rest on a sentence. */
export function codingToolsCounts(section) {
  let stated = 0, total = 0;
  for (const e of section.entries) for (const f of Object.keys(LABELS)) { total += 1; if (e.claims[f] && e.claims[f].state === 'stated') stated += 1; }
  return { tools: section.entries.length, stated, total };
}

function entriesHtml(section, prefix = '../') {
  return section.entries.map((e) => {
    const url = safeHttp(e.url);
    const name = url ? `<a href="${htmlEsc(url)}" target="_blank" rel="noopener">${htmlEsc(e.name)}</a>` : htmlEsc(e.name);
    const claims = Object.keys(LABELS).map((f) => claimHtml(e.slug, f, e.claims[f])).join('');
    return `<section class="gpu-entry" id="${SLUG_RE.test(e.slug) ? e.slug : ''}"><h3>${name} <span class="muted">· ${htmlEsc(KIND_LABEL[e.kind] || e.kind)}</span></h3><dl class="gpu-claims">${claims}</dl>${SLUG_RE.test(e.slug) ? `<p class="muted"><a href="${prefix}coding-tools/${e.slug}/">The page of ${htmlEsc(e.name)} →</a></p>` : ''}</section>`;
  }).join('');
}

// ---- one page per tool (/coding-tools/<slug>/) ----
// Built only from the entry: the values the tool's own page states (each with its sentence, its source and the day it was read) and, apart,
// the values it does not state, which read «Not stated» and are never «no». Nothing is added, ranked or interpreted.

/** The title of the page of a tool: at most 60 characters, the name first. */
export function codingToolTitle(name) {
  const full = `${name} free plan · Free LLM API Hub`;
  return full.length <= 60 ? full : `${name} free plan`;
}

/** The description of the page: the first sentence the tool's page states about free access, after its name and kind. */
export function codingToolDescription(entry) {
  // A fixed sentence: a quoted line of a pricing page makes a poor search snippet. The quotes are on the page.
  return `${entry.name} (${KIND_LABEL[entry.kind] || entry.kind}): what its own page says about the free plan, quoted, with the source and the day read.`;
}

/** The distinct source pages of an entry, with the days they were read. */
export function codingToolSources(entry) {
  const seen = new Map();
  for (const f of Object.keys(LABELS)) for (const q of entry.claims[f].quotes) {
    const src = safeHttp(q.source);
    if (!src) continue;
    const days = seen.get(src) || new Set();
    days.add(q.read);
    seen.set(src, days);
  }
  return [...seen].map(([src, days]) => ({ src, days: [...days].sort() }));
}

/** @param {object} entry  @param {{prefix?: string, group?: string, others?: object[]}} opts  prefix to the site root */
export function codingToolMainHtml(entry, { prefix = '../../', group = 'free', others = [] } = {}) {
  const url = safeHttp(entry.url);
  const stated = Object.keys(LABELS).filter((f) => entry.claims[f].state === 'stated');
  const unstated = Object.keys(LABELS).filter((f) => entry.claims[f].state !== 'stated');
  const claims = (fields) => `<dl class="gpu-claims">${fields.map((f) => claimHtml(entry.slug, f, entry.claims[f])).join('')}</dl>`;
  const sources = codingToolSources(entry);
  const where = group === 'own-key'
    ? 'This tool is free itself while the model behind it is paid for with your own key or a free API.'
    : 'This tool says it has a free plan.';
  return '<main id="main"><div class="wrap prose">' +
    `<p>${htmlEsc(KIND_LABEL[entry.kind] || entry.kind)}. ${where}${url ? ` <a href="${htmlEsc(url)}" target="_blank" rel="noopener">The tool's own page ↗</a>.` : ''} ` +
    'It is <strong>not part of the ranking</strong> of free LLM APIs, and each value below is written only where the tool\'s own page says it.</p>' +
    '<h2 id="stated">What its page states</h2>' +
    (stated.length ? claims(stated) : '<p class="muted">Nothing is stated yet.</p>') +
    '<h2 id="not-stated">What its page does not say</h2>' +
    '<p><strong>Not stated</strong> is never the same as <em>no</em>: it means the page does not say it, so we do not write it.</p>' +
    (unstated.length ? claims(unstated) : '<p class="muted">Everything is stated.</p>') +
    '<h2 id="sources">Sources</h2>' +
    (sources.length
      ? `<ul class="plain">${sources.map((x) => `<li><a href="${htmlEsc(x.src)}" target="_blank" rel="noopener">${htmlEsc(x.src)}</a> · read ${x.days.map(htmlEsc).join(', ')}</li>`).join('')}</ul>`
      : '<p class="muted">No source page is quoted.</p>') +
    (others.length
      ? `<h2 id="others">Other free AI coding tools</h2><div class="colls">${others.filter((o) => SLUG_RE.test(o.slug)).map((o) => `<a href="${prefix}coding-tools/${o.slug}/">${htmlEsc(o.name)}</a>`).join('')}</div>`
      : '') +
    '</div></main>';
}

const notesHtml = (section) => (section.notes || []).map((n) =>
  `<section class="gpu-note"><h3>${htmlEsc(n.subject)}</h3><p>${htmlEsc(n.text)}</p>${n.quotes.map(quoteHtml).join('')}</section>`).join('');

/** The second part of the page: tools that are free themselves while inference is paid with your own key or a free API. */
function ownKeyHtml(ownKey, prefix) {
  if (!ownKey || !Array.isArray(ownKey.entries) || !ownKey.entries.length) return '';
  const c = codingToolsCounts(ownKey);
  return '<h2 id="own-key">Tools you connect your own key to</h2>' +
    `<p>${htmlEsc(ownKey.note || 'The tool is free; inference is paid with your own key or a free API.')} ` +
    `See also: <a href="${prefix}collections/openai-compatible.html">OpenAI-compatible free APIs</a>; <a href="${prefix}#explorer">the interactive explorer</a>. ` +
    'The same rule holds: a value is written only where the tool\'s own page says it, and <strong>Not stated</strong> is never <em>no</em>.</p>' +
    `<p class="muted">${c.tools} tools listed; ${c.stated} of ${c.total} values rest on a sentence from the tool's own page.</p>` +
    claimsTableHtml({ id: 'own', entries: ownKey.entries, labels: LABELS, kindLabel: (k) => KIND_LABEL[k] || k, subject: 'tool' }) +
    entriesHtml(ownKey, prefix) + notesHtml(ownKey);
}

export function codingToolsMainHtml(section, { prefix = '../', repo = '', ownKey = null } = {}) {
  const c = codingToolsCounts(section);
  const entries = entriesHtml(section, prefix);
  const notes = notesHtml(section);
  return '<main id="main"><div class="wrap prose">' +
    '<h2>What each tool says about free access</h2>' +
    '<p>This is a separate list from the free LLM APIs: these are tools you code with, not hosted model APIs. It is <strong>not part of the ranking</strong> and no count, score or collection of the site includes it. ' +
    'Each value below is written only when the tool\'s own page says it, with the sentence and the day it was read; otherwise it reads <strong>Not stated</strong>, which is never the same as <em>no</em>. ' +
    'Each row shows the day its page was read.</p>' +
    `<p class="muted">${c.tools} tools listed; ${c.stated} of ${c.total} values rest on a sentence from the tool's own page.</p>` +
    claimsTableHtml({ id: 'tools', entries: section.entries, labels: LABELS, kindLabel: (k) => KIND_LABEL[k] || k, subject: 'tool' }) +
    (entries || '<p class="muted">No tool is recorded yet.</p>') +
    (notes ? '<h2>Worth knowing</h2>' + notes : '') +
    ownKeyHtml(ownKey, prefix) +
    `<p class="muted">Looking for hosted LLM APIs instead? <a href="${prefix}">See the main list</a>. To add or correct a value, ${repo ? `<a href="${htmlEsc(repo)}/issues/new?template=inaccuracy.yml" target="_blank" rel="noopener">open an issue</a>` : 'open an issue'} with the tool\'s own page.</p>` +
    '</div></main>';
}
