// data-policy-page.mjs — /data-policy/, "who trains on your data": one row per verified provider, with what the
// provider itself says (yes / no / not confirmed), the page it says it on and the day that page was read.
//
// The page states only what the data holds. A provider with no data_policy, or one that does not say whether it
// trains, reads "not confirmed" in words: that is never the same as "no". The provider's own sentence is shown
// when the data carries one (data_policy.quote) and the row says so plainly when it does not. The counts at the top
// are computed from the rows; nothing is written by hand, nothing is interpreted and nothing is ranked.

import { htmlEsc, SLUG_RE } from './rows.mjs';

const safeHttp = (u) => (/^https?:\/\//i.test(String(u || '')) ? String(u) : '');

/**
 * 'yes' | 'no' | 'recorded' | 'unknown'. A row reads yes or no only when the data holds a literal true or false AND the
 * provider's own sentence (data_policy.quote). A true or false without a sentence is "recorded": the page shows it as
 * not confirmed, because a value alone is not the provider's word. Anything else is "unknown".
 */
export function trainState(p) {
  const dp = p && p.data_policy && typeof p.data_policy === 'object' ? p.data_policy : null;
  if (!dp) return 'unknown';
  const v = dp.trains_on_prompts;
  if (v !== true && v !== false) return 'unknown';
  const hasQuote = typeof dp.quote === 'string' && dp.quote.trim().length > 0;
  return hasQuote ? (v ? 'yes' : 'no') : 'recorded';
}

/** Rows for every verified provider, in dataset order. */
export function dataPolicyRows(providers) {
  return providers.filter((p) => p.verified === true).map((p) => {
    const dp = p.data_policy && typeof p.data_policy === 'object' ? p.data_policy : null;
    return {
      provider: p,
      state: trainState(p),
      retention: dp && dp.retention ? String(dp.retention) : null,
      quote: dp && typeof dp.quote === 'string' && dp.quote.trim().length ? dp.quote : null,
      note: dp && typeof dp.note === 'string' && dp.note.length ? dp.note : null,
      source: dp ? safeHttp(dp.source) : '',
      checked: dp && dp.checked ? String(dp.checked) : null,
    };
  });
}

/** { total, yes, no, recorded, unknown, notConfirmed, withQuote, withTrainingQuote, withRetentionQuote } computed from the rows. */
export function dataPolicyCounts(rows) {
  const c = { total: rows.length, yes: 0, no: 0, recorded: 0, unknown: 0, withQuote: 0, withTrainingQuote: 0, withRetentionQuote: 0 };
  for (const r of rows) {
    c[r.state] += 1;
    if (!r.quote) continue;
    c.withQuote += 1;
    // A sentence only counts as a training sentence when it backs a yes or a no; any other sentence is about retention.
    if (r.state === 'yes' || r.state === 'no') c.withTrainingQuote += 1; else c.withRetentionQuote += 1;
  }
  c.notConfirmed = c.recorded + c.unknown;
  return c;
}

const STATE_LABEL = {
  yes: 'Sentence: may train',
  no: 'Sentence: does not train',
  recorded: 'Not confirmed: a value is recorded, no sentence yet',
  unknown: 'Not confirmed',
};

/** The issue that opens the existing inaccuracy form for one provider, to add or correct its sentence. */
export const dataPolicyIssueUrl = (p, repo) =>
  `${repo}/issues/new?template=inaccuracy.yml&provider=${encodeURIComponent(p.slug)}&title=${encodeURIComponent(`[data policy] ${p.name}`)}`;

const FAQ = (c) => [
  ['Which providers train on my data?',
    `Each provider says it in its own policy. This page shows a provider's own sentence where one is recorded, with its page and the day it was read. Of ${c.total} verified providers, ${c.no} have a recorded sentence that says they do not train on prompts, ${c.yes} have one that says they may, and ${c.notConfirmed} are not confirmed.`],
  ['What does \u201cnot confirmed\u201d mean?',
    'No sentence from the provider\'s own pages is recorded for the row. It never means \u201cno\u201d.'],
  ['Does a row cover every plan?',
    'A row covers the plan its sentence is read for, and the note says which when the page does. Other plans are not covered by that row.'],
  ['Where do the sentences come from?',
    'A recorded sentence is copied as written from the provider\'s own page, with the page and the day it was read.'],
  ['How can I correct or add a row?',
    'Use the link in the row to open an issue with the page and the sentence.'],
];

/** The visible questions of the page. Text only: no FAQPage markup until enough rows carry a sentence. */
export function dataPolicyFaqHtml(counts) {
  return '<section id="faq"><h2>Questions</h2>' +
    FAQ(counts).map(([q, a]) => `<h3>${htmlEsc(q)}</h3><p>${htmlEsc(a)}</p>`).join('') + '</section>';
}

/** The main content of /data-policy/. `prefix` is the path from the page to the site root. */
export function dataPolicyMainHtml(rows, { repo, generated, prefix = '../' }) {
  const c = dataPolicyCounts(rows);
  const body = rows.map((r) => {
    const p = r.provider;
    const name = SLUG_RE.test(String(p.slug || '')) ? `<a href="${prefix}p/${p.slug}">${htmlEsc(p.name)}</a>` : htmlEsc(p.name);
    const foot = r.source
      ? `<p class="muted dp-foot">${htmlEsc(p.name)}, page: <a href="${htmlEsc(r.source)}" target="_blank" rel="noopener">${htmlEsc(r.source)}</a>${r.checked ? `, read on ${htmlEsc(r.checked)}` : ''}.</p>`
      : '';
    const quote = r.quote
      ? `<blockquote class="dp-quote">&ldquo;${htmlEsc(r.quote)}&rdquo;</blockquote>${foot}`
      : '<span class="muted">No sentence recorded yet. Do you know the page? Send it with the sentence.</span>';
    const note = r.note ? `<p class="muted">${htmlEsc(r.note)}</p>` : '';
    const src = r.source
      ? `<a href="${htmlEsc(r.source)}" target="_blank" rel="noopener">the provider's page</a>${r.checked ? ` · read ${htmlEsc(r.checked)}` : ''}`
      : '<span class="muted">no source recorded</span>';
    const ret = r.retention ? htmlEsc(r.retention) : '<span class="tri tri-unk">not confirmed</span>';
    const cls = r.state === 'yes' ? 'yes' : r.state === 'no' ? 'no' : 'unk';
    return `<tr><th scope="row">${name}</th><td><span class="tri tri-${cls}">${STATE_LABEL[r.state]}</span></td>` +
      `<td>${ret}</td><td>${quote}${note}</td>` +
      `<td>${src}<p class="muted dp-foot"><a href="${htmlEsc(dataPolicyIssueUrl(p, repo))}" target="_blank" rel="noopener">add or correct</a></p></td></tr>`;
  }).join('');
  return '<main id="main"><div class="wrap prose">' +
    '<h2>The provider\'s own sentence about your prompts</h2>' +
    `<p>For each of ${c.total} verified providers, this page shows the sentence from the provider's own page about training on prompts where one is recorded. ` +
    `${c.withTrainingQuote} rows have one about training${c.withRetentionQuote ? ` (${c.withRetentionQuote} more carry a sentence about retention only)` : ''}; ${c.notConfirmed} are not confirmed (${c.recorded} of them have a value in the dataset but no sentence yet). ` +
    `Each row shows the day its page was read. Data of ${htmlEsc(String(generated))}.</p>` +
    '<p class="dp-legend"><strong>Sentence: does not train</strong>: a recorded sentence from the provider\'s page says it does not train on prompts. <strong>Sentence: may train</strong>: a recorded sentence says it may. ' +
    '<strong>Not confirmed</strong>: no sentence is recorded. That never means &ldquo;no&rdquo;.</p>' +
    '<div class="table-scroll" role="region" aria-label="Table: the sentence of each verified provider about training on prompts" tabindex="0"><table class="dp-table"><caption class="sr-only">The sentence of each verified provider about training on prompts, with its source</caption>' +
    '<thead><tr><th scope="col">Provider</th><th scope="col">Trains on your prompts</th><th scope="col">Retention, as the dataset words it</th><th scope="col">The provider\'s own words</th><th scope="col">Source and help</th></tr></thead>' +
    `<tbody>${body}</tbody></table></div>` +
    dataPolicyFaqHtml(c) +
    `<p class="muted">To add a sentence or fix one, <a href="${htmlEsc(repo)}/blob/main/CONTRIBUTING.md" target="_blank" rel="noopener">read how we take a value</a> and open an issue from the row.</p>` +
    '</div></main>';
}
