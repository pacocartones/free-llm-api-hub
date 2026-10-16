// agreements.mjs — data/sponsorships.json: every paid relationship of the project, and every relationship without
// money that a reader would want to know about. It is a file apart on purpose.
//
// Rules the code enforces (each has a test):
//  - Nothing paid is in the dataset. A provider record cannot carry the retired `partner` / `partner_note` (the schema allows no extra property), and this
//    file is read by the agreements page and the provider-page disclosure only: not by the score, the API files
//    (/api/v1/), llms.txt, the structured data of a page or the ranking.
//  - The table is computed from the rows. With no row in force it says so in those words; nothing is written by hand.
//  - A relationship without money is a "disclosure": its own label, next to the provider page, never on the podium
//    and never in a table of providers.
//  - Copy that sells (featured, partner, recommended) does not appear in the text of a block or a row.

import { htmlEsc, SLUG_RE } from './rows.mjs';

export const AGREEMENT_TYPES = { sponsored_block: 'Sponsored block', sponsored_section: 'Sponsored section', paid_link: 'Paid link' };
export const DISCLOSURE_KINDS = { free_credit: 'free credit', early_access: 'early access', test_account: 'a test account', personal: 'personal' };
export const FORBIDDEN_WORDS = /\b(featured|partner|partners|recommended)\b/i;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (s) => typeof s === 'string' && DAY_RE.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const str = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const https = (u) => typeof u === 'string' && /^https:\/\/[^\s]+$/.test(u);

/** Errors of the agreements file; does not throw. `generated` is the dataset's UTC day. */
export function agreementsErrors(file, { slugs = [], generated } = {}) {
  const errors = [];
  if (!file || typeof file !== 'object' || Array.isArray(file)) return ['the file must be an object'];
  for (const k of Object.keys(file)) if (!['version', 'generated', 'agreements', 'disclosures'].includes(k)) errors.push(`unknown key "${k}"`);
  if (file.version !== 1) errors.push('version must be 1');
  if (!isDay(file.generated)) errors.push('generated must be a day, YYYY-MM-DD');
  else if (generated && file.generated > generated) errors.push(`generated ${file.generated} is after the dataset day ${generated}`);
  const ids = new Set();
  const ARR = ['id', 'company', 'type', 'since', 'until', 'receives', 'does_not_receive', 'data_checked_by', 'last_review', 'url', 'text', 'company_wrote_text', 'company_reviewed_text'];
  if (!Array.isArray(file.agreements)) errors.push('agreements must be an array');
  for (const [i, a] of (Array.isArray(file.agreements) ? file.agreements : []).entries()) {
    const w = `agreements[${i}]`;
    if (!a || typeof a !== 'object' || Array.isArray(a)) { errors.push(`${w} must be an object`); continue; }
    for (const k of Object.keys(a)) if (!ARR.includes(k)) errors.push(`${w}: unknown key "${k}"`);
    if (typeof a.id !== 'string' || !SLUG_RE.test(a.id)) errors.push(`${w}: id must be a slug`);
    else if (ids.has(a.id)) errors.push(`${w}: duplicate id ${a.id}`); else ids.add(a.id);
    if (!str(a.company, 80)) errors.push(`${w}: company is required (1 to 80 characters)`);
    if (!(a.type in AGREEMENT_TYPES)) errors.push(`${w}: type must be one of ${Object.keys(AGREEMENT_TYPES).join(', ')}`);
    if (!isDay(a.since)) errors.push(`${w}: since must be a day, YYYY-MM-DD`);
    if (a.until != null && !isDay(a.until)) errors.push(`${w}: until must be a day or null`);
    if (isDay(a.since) && isDay(a.until) && a.until < a.since) errors.push(`${w}: until is before since`);
    for (const k of ['receives', 'does_not_receive', 'data_checked_by']) if (!str(a[k], 300)) errors.push(`${w}: ${k} is required (1 to 300 characters)`);
    if (!isDay(a.last_review)) errors.push(`${w}: last_review must be a day, YYYY-MM-DD`);
    else if (generated && a.last_review > generated) errors.push(`${w}: last_review is after the dataset day`);
    if (!https(a.url)) errors.push(`${w}: url must be https`);
    if (a.type === 'sponsored_block' || a.type === 'sponsored_section') {
      if (!str(a.text, 600)) errors.push(`${w}: a sponsored text is required (1 to 600 characters)`);
      if (typeof a.company_wrote_text !== 'boolean') errors.push(`${w}: company_wrote_text must be true or false`);
    }
    if (a.type === 'sponsored_section' && typeof a.company_reviewed_text !== 'boolean') errors.push(`${w}: company_reviewed_text must be true or false`);
    for (const k of ['company', 'receives', 'does_not_receive', 'text']) if (typeof a[k] === 'string' && FORBIDDEN_WORDS.test(a[k])) errors.push(`${w}: ${k} uses a word the labels do not use (${a[k].match(FORBIDDEN_WORDS)[0]})`);
  }
  if (!Array.isArray(file.disclosures)) errors.push('disclosures must be an array');
  for (const [i, d] of (Array.isArray(file.disclosures) ? file.disclosures : []).entries()) {
    const w = `disclosures[${i}]`;
    if (!d || typeof d !== 'object' || Array.isArray(d)) { errors.push(`${w} must be an object`); continue; }
    for (const k of Object.keys(d)) if (!['slug', 'company', 'kind', 'relation', 'since'].includes(k)) errors.push(`${w}: unknown key "${k}"`);
    if (!slugs.includes(d.slug)) errors.push(`${w}: slug ${JSON.stringify(d.slug)} is not a provider`);
    if (!str(d.company, 80)) errors.push(`${w}: company is required`);
    if (!(d.kind in DISCLOSURE_KINDS)) errors.push(`${w}: kind must be one of ${Object.keys(DISCLOSURE_KINDS).join(', ')}`);
    if (d.kind === 'personal' && !str(d.relation, 300)) errors.push(`${w}: a personal link needs "relation", one plain sentence`);
    if (d.kind !== 'personal' && d.relation != null) errors.push(`${w}: relation is only for kind personal`);
    if (!isDay(d.since)) errors.push(`${w}: since must be a day`);
    if (typeof d.relation === 'string' && FORBIDDEN_WORDS.test(d.relation)) errors.push(`${w}: relation uses a word the labels do not use`);
  }
  return errors;
}

/** The rows in force on `day`: started, and not ended. */
export const inForce = (file, day) => (file?.agreements ?? []).filter((a) => a.since <= day && (a.until == null || a.until >= day));

const date = (s) => (s ? htmlEsc(s) : 'no end date');

/** "Agreements in force": the table, or the one sentence when it is empty. Computed from the rows. */
export function agreementsTableHtml(file, day) {
  const rows = inForce(file, day);
  const head = '<h2 id="agreements">Agreements in force</h2><p>Every paid relationship Free LLM API Hub has today, with its dates and what each side gets. Updated ' + htmlEsc(file.generated) + '.</p>';
  if (!rows.length) return head + '<p class="agreements-empty"><strong>No agreement is in force.</strong> (as of ' + htmlEsc(day) + ')</p>';
  const body = rows.map((a) => '<tr><th scope="row"><a href="' + htmlEsc(a.url) + '" rel="sponsored nofollow noopener">' + htmlEsc(a.company) + '</a></th><td>' + htmlEsc(AGREEMENT_TYPES[a.type]) + '</td><td>' + date(a.since) + '</td><td>' + date(a.until) + '</td><td>' + htmlEsc(a.receives) + '</td><td>' + htmlEsc(a.does_not_receive) + '</td><td>' + htmlEsc(a.data_checked_by) + '</td><td>' + htmlEsc(a.last_review) + '</td></tr>').join('');
  return head + '<div class="table-scroll"><table class="agreements"><thead><tr><th scope="col">Company</th><th scope="col">Type</th><th scope="col">Since</th><th scope="col">Until</th><th scope="col">What it receives</th><th scope="col">What it does not receive</th><th scope="col">Who checked its data</th><th scope="col">Last review of this row</th></tr></thead><tbody>' + body + '</tbody></table></div>';
}

/** One labelled block. The label is text, stuck to the block, and the same text is its aria-label. */
export function sponsoredBlockHtml(a) {
  const label = 'Sponsored. Paid placement. Not part of the ranking and not affected by it.';
  if (a.type === 'sponsored_section') {
    return '<section class="sponsored" aria-label="' + htmlEsc(label) + '"><p class="sponsored-label"><strong>Sponsored</strong> Paid placement. Not part of the ranking and not affected by it.</p>' +
      '<p><strong>Sponsored by ' + htmlEsc(a.company) + '.</strong> Written and verified by Free LLM API Hub. ' + htmlEsc(a.company) + ' did not edit the data. ' + htmlEsc(a.company) + (a.company_reviewed_text ? ' did' : ' did not') + ' review this text.</p>' +
      '<p>' + htmlEsc(a.text) + '</p><p><a href="' + htmlEsc(a.url) + '" target="_blank" rel="sponsored nofollow noopener">Go to ' + htmlEsc(a.company) + '</a> (opens in a new tab)</p></section>';
  }
  return '<aside class="sponsored" aria-label="' + htmlEsc(label) + '"><p class="sponsored-label"><strong>Sponsored</strong> Paid placement. Not part of the ranking and not affected by it.</p>' +
    '<p>' + htmlEsc(a.text) + (a.company_wrote_text ? ' <em>(Text written by ' + htmlEsc(a.company) + '.)</em>' : '') + '</p>' +
    '<p><a href="' + htmlEsc(a.url) + '" target="_blank" rel="sponsored nofollow noopener">Go to ' + htmlEsc(a.company) + '</a> (opens in a new tab)</p>' +
    '<p class="sponsored-foot">' + htmlEsc(a.company) + ' paid for this block. It did not edit any data on this site. <a href="/agreements/#agreements">Agreements and policy</a></p></aside>';
}

/** The line for a relationship without money, or '' when the provider has none. Next to the provider page, nowhere else. */
export function disclosureHtml(file, slug) {
  const out = (file?.disclosures ?? []).filter((d) => d.slug === slug).map((d) => {
    const tail = ' It does not change how ' + htmlEsc(d.company) + ' is scored or described.';
    return d.kind === 'personal'
      ? '<p class="disclosure"><strong>Disclosure:</strong> ' + htmlEsc(d.relation) + tail + '</p>'
      : '<p class="disclosure"><strong>Disclosure:</strong> ' + htmlEsc(d.company) + ' gave us ' + DISCLOSURE_KINDS[d.kind] + ' to try its service. No money was paid.' + tail + '</p>';
  });
  return out.join('');
}

/** The public statement, short, for the policy and the foot of the page. */
export const NOT_IN_DATA_SENTENCE = 'Money does not buy a place in the ranking, a score, an order or a change to the data. Paid content stays outside the dataset, the API files and the ranking.';
export const MACHINE_SENTENCE = 'A paid item does not appear in /api/v1/, in llms.txt or in the structured data of a page. If one ever has to appear in a machine-readable place, its first words are “Sponsored”.';
