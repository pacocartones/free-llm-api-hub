// data-policy-page.mjs — /data-policy/, "who trains on your data": one row per verified provider, with what the
// provider itself says (yes / no / not confirmed), the page it says it on and the day that page was read.
//
// The page states only what the data holds. A provider with no data_policy, or one that does not say whether it
// trains, reads "not confirmed" in words: that is never the same as "no". The provider's own sentence is shown
// when the data carries one (data_policy.quote) and the row says so plainly when it does not. The counts at the top
// are computed from the rows; nothing is written by hand, nothing is interpreted and nothing is ranked.

import { htmlEsc, SLUG_RE } from './rows.mjs';

const safeHttp = (u) => (/^https?:\/\//i.test(String(u || '')) ? String(u) : '');

/** 'yes' | 'no' | 'unknown' from the data only. Anything but a literal true or false is "not confirmed". */
export function trainState(p) {
  const v = p && p.data_policy ? p.data_policy.trains_on_prompts : null;
  return v === true ? 'yes' : v === false ? 'no' : 'unknown';
}

/** Rows for every verified provider, in dataset order. */
export function dataPolicyRows(providers) {
  return providers.filter((p) => p.verified === true).map((p) => {
    const dp = p.data_policy && typeof p.data_policy === 'object' ? p.data_policy : null;
    return {
      provider: p,
      state: trainState(p),
      retention: dp && dp.retention ? String(dp.retention) : null,
      quote: dp && typeof dp.quote === 'string' && dp.quote.length ? dp.quote : null,
      note: dp && typeof dp.note === 'string' && dp.note.length ? dp.note : null,
      source: dp ? safeHttp(dp.source) : '',
      checked: dp && dp.checked ? String(dp.checked) : null,
    };
  });
}

/** { total, yes, no, unknown, withQuote } computed from the rows. */
export function dataPolicyCounts(rows) {
  const c = { total: rows.length, yes: 0, no: 0, unknown: 0, withQuote: 0 };
  for (const r of rows) { c[r.state] += 1; if (r.quote) c.withQuote += 1; }
  return c;
}

const STATE_LABEL = { yes: 'says it may', no: 'says it does not', unknown: 'not confirmed' };

/** The issue that opens the existing inaccuracy form for one provider, to add or correct its sentence. */
export const dataPolicyIssueUrl = (p, repo) =>
  `${repo}/issues/new?template=inaccuracy.yml&provider=${encodeURIComponent(p.slug)}&title=${encodeURIComponent(`[data policy] ${p.name}`)}`;

const FAQ = (c) => [
  ['Which providers train on my data?',
    `Each provider says it in its own policy. This page shows its words when we have them, the page they come from and the day we read it. Of ${c.total} verified providers, ${c.no} say they do not train on your prompts on this free access, ${c.yes} say they may, and ${c.unknown} are not confirmed.`],
  ['What does \u201cnot confirmed\u201d mean?',
    'Nobody has recorded a sentence from the provider\'s own pages that says it. It never means \u201cno\u201d.'],
  ['Does the paid plan have the same policy?',
    'Not necessarily. We record what the page says about this free access. Paid plans can differ: check the provider\'s page.'],
  ['How do you choose the sentences?',
    'We copy one or two sentences as written from the provider\'s own page and show the page and the day we read it. We do not paraphrase or interpret.'],
  ['How can I correct or add a row?',
    'Open an issue from the link in the row, with the page and the sentence. We check it against the page before changing anything.'],
  ['Is this legal advice?',
    'No. It is informative. Policies change; always confirm on the provider\'s own page.'],
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
    return `<tr><th scope="row">${name}</th><td><span class="tri tri-${r.state === 'yes' ? 'yes' : r.state === 'no' ? 'no' : 'unk'}">${STATE_LABEL[r.state]}</span></td>` +
      `<td>${ret}</td><td>${quote}${note}</td><td>${src}</td>` +
      `<td><a href="${htmlEsc(dataPolicyIssueUrl(p, repo))}" target="_blank" rel="noopener">add or correct</a></td></tr>`;
  }).join('');
  return '<main id="main"><div class="wrap prose">' +
    '<h2>What each provider says about your prompts</h2>' +
    `<p>Of ${c.total} verified providers, ${c.no} say they do not train on your prompts on this free access, ${c.yes} say they may, and ${c.unknown} are not confirmed. ` +
    `${c.withQuote} of the ${c.total} rows carry the provider's own sentence. Data of ${htmlEsc(String(generated))}.</p>` +
    '<p class="muted">Informative, not legal advice. Policies change and a free plan can have conditions the paid plan does not: read the provider\'s page, and the day we read it, before you rely on a row. ' +
    '&ldquo;Not confirmed&rdquo; means nobody has recorded a sentence that says it; it never means &ldquo;no&rdquo;. We quote and do not interpret.</p>' +
    '<p class="dp-legend"><strong>Says it does not</strong>: the provider\'s page says it does not train on your prompts on this access. <strong>Says it may</strong>: the page says it may. ' +
    '<strong>Not confirmed</strong>: nobody has recorded a sentence that says it. That never means &ldquo;no&rdquo;.</p>' +
    '<div class="table-wrap"><table class="dp-table"><caption class="sr-only">What each verified provider says about training on prompts, with its source</caption>' +
    '<thead><tr><th scope="col">Provider</th><th scope="col">Trains on your prompts</th><th scope="col">Retention</th><th scope="col">The provider\'s own words</th><th scope="col">Source</th><th scope="col">Help</th></tr></thead>' +
    `<tbody>${body}</tbody></table></div>` +
    dataPolicyFaqHtml(c) +
    `<p class="muted">To add a sentence or fix one, <a href="${htmlEsc(repo)}/blob/main/CONTRIBUTING.md" target="_blank" rel="noopener">read how we take a value</a> and open an issue from the row.</p>` +
    '</div></main>';
}
