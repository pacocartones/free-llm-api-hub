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

function entriesHtml(section) {
  return section.entries.map((e) => {
    const url = safeHttp(e.url);
    const name = url ? `<a href="${htmlEsc(url)}" target="_blank" rel="noopener">${htmlEsc(e.name)}</a>` : htmlEsc(e.name);
    const claims = Object.keys(LABELS).map((f) => claimHtml(e.slug, f, e.claims[f])).join('');
    return `<section class="gpu-entry" id="${SLUG_RE.test(e.slug) ? e.slug : ''}"><h3>${name} <span class="muted">· ${htmlEsc(KIND_LABEL[e.kind] || e.kind)}</span></h3><dl class="gpu-claims">${claims}</dl></section>`;
  }).join('');
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
    entriesHtml(ownKey) + notesHtml(ownKey);
}

export function codingToolsMainHtml(section, { prefix = '../', repo = '', ownKey = null } = {}) {
  const c = codingToolsCounts(section);
  const entries = entriesHtml(section);
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
