// free-gpu.mjs — the page of the "Free GPU compute" section (data/gpu-compute.json).
//
// The section is kept apart from the provider ranking on purpose (see gpu-compute.mjs): nothing here is
// counted, scored or collected with the providers. This renderer only reads the section file. A value
// the provider's own page did not state reads "Not stated" and is never filled in; the quoted sentences
// are shown with the page they come from and the day they were read.

import { htmlEsc, SLUG_RE } from './rows.mjs';
import { claimsTableHtml } from './claims-table.mjs';

const safeHttp = (u) => (/^https?:\/\//i.test(String(u || '')) ? String(u) : '');

const LABELS = Object.freeze({
  gpu_access: 'Free GPU access',
  quota: 'Free quota',
  credit_amount: 'Credit amount',
  expires: 'Expiry',
  card_required: 'Card required',
});

const quoteHtml = (q) => {
  const src = safeHttp(q.source);
  const link = src ? `<a href="${htmlEsc(src)}" target="_blank" rel="noopener">${htmlEsc(new URL(src).hostname)}</a>` : '';
  return `<blockquote class="gpu-quote"><p>“${htmlEsc(q.text)}”</p><footer class="muted">${link}${link ? ' · ' : ''}read ${htmlEsc(q.read)}</footer></blockquote>`;
};

function claimHtml(field, claim) {
  const quotes = claim.quotes.map(quoteHtml).join('');
  let state;
  if (claim.state === 'stated') state = '<span class="gpu-stated">Stated by the provider</span>';
  else if (claim.quotes.length > 1) state = '<span class="gpu-unstated">Not stated: the sentences below do not settle it</span>';
  else if (claim.quotes.length === 1) state = '<span class="gpu-unstated">Not stated as a figure; what the page says is below</span>';
  else state = '<span class="gpu-unstated">Not stated</span>';
  return `<div class="gpu-claim"><dt>${htmlEsc(LABELS[field] || field)}</dt><dd>${state}${quotes}</dd></div>`;
}

const kindLabel = (k) => (k === 'notebook' ? 'notebook service' : 'serverless API');

export function freeGpuMainHtml(section, { prefix = '../' } = {}) {
  const entries = section.entries.map((e) => {
    const url = safeHttp(e.url);
    const name = url ? `<a href="${htmlEsc(url)}" target="_blank" rel="noopener">${htmlEsc(e.name)}</a>` : htmlEsc(e.name);
    const claims = Object.keys(LABELS).map((f) => claimHtml(f, e.claims[f])).join('');
    return `<section class="gpu-entry" id="${SLUG_RE.test(e.slug) ? e.slug : ''}"><h3>${name} <span class="muted">· ${htmlEsc(kindLabel(e.kind))}</span></h3><dl class="gpu-claims">${claims}</dl></section>`;
  }).join('');
  const notes = (section.notes || []).map((n) =>
    `<section class="gpu-note"><h3>${htmlEsc(n.subject)}</h3><p>${htmlEsc(n.text)}</p>${n.quotes.map(quoteHtml).join('')}</section>`).join('');
  return '<main id="main"><div class="wrap prose">' +
    '<h2>What each service says about free GPU time</h2>' +
    '<p>This is a separate list from the free LLM APIs: these services give you compute, not a hosted model. It is <strong>not part of the ranking</strong> and no count, score or collection of the site includes it. ' +
    'Each value below is written only when the provider\'s own page says it, with the sentence and the day it was read; otherwise it reads <strong>Not stated</strong>, which is not the same as <em>no</em>. ' +
    'A service is listed only when its own page, read as plain text, says what it offers; pages that need a browser to read are not covered yet. A listed service can still have <strong>Not stated</strong> next to "Free GPU access": the page does not say that its free credit pays for GPU time, and the page then does not claim it. Data of ' + htmlEsc(section.generated) + '.</p>' +
    claimsTableHtml({ id: 'gpu', entries: section.entries, labels: LABELS, kindLabel, subject: 'service' }) +
    entries +
    (notes ? '<h2>Worth knowing</h2>' + notes : '') +
    `<p class="muted">Looking for hosted LLM APIs instead? <a href="${prefix}">See the main list</a>. To add or correct a value, open an issue with the provider\'s own page.</p>` +
    '</div></main>';
}
