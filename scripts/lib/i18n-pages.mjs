// i18n-pages.mjs — the translated pages of the Spanish vertical slice (docs/i18n.md): the home page and the provider
// page template. build.mjs wraps each body in the shared shell (htmlPage with the Spanish translator), writes it under
// site/es/ and links it to its English twin with hreflang.
//
// The rules these bodies follow (and scripts/i18n.test.mjs checks):
//   - Interface text, headings and sentences built from data fields come from the catalogue (t / text).
//   - A quote from a provider's page is evidence: printed verbatim, never translated, inside an element with
//     lang="en" (the language it was read in) so a screen reader and a search engine read it correctly.
//   - Free text fields of the dataset (free_tier, notes, rate_limits, best_for, free_limits.scope,
//     commercial_ok_condition) exist in English only: they are shown as recorded, also marked lang="en".
//   - A missing value reads "no indicado" (common.not_stated), never "no" or "0".
//   - Dates are human and Spanish ("24 nov 2026") with the ISO day kept on <time datetime>; numbers use Spanish digits.
// Every function is pure: data in, HTML out, so the tests can render a page without running the build.

import { escapeAttr, escapeText } from './html.mjs';
import { curlChatQuickstart, pythonChatQuickstart, pythonEmbeddingsQuickstart } from './quickstart.mjs';
import { freshnessStatus } from './rules.mjs';

const LIMIT_KEYS = ['requests_per_second', 'requests_per_minute', 'requests_per_day', 'requests_per_month', 'tokens_per_day', 'tokens_per_month'];
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const safeHttps = (u) => (typeof u === 'string' && /^https:\/\/[^\s"'<>]+$/i.test(u) ? u : '');

/** Dataset prose, shown as recorded (English) and marked as such. */
export const englishData = (text, tag = 'span') => `<${tag} lang="en">${escapeAttr(text)}</${tag}>`;

/** A verbatim quote with its own language: never passed through the catalogue. */
export const verbatimQuote = (q) => `<blockquote class="prov-receipt" lang="en"><p>“${escapeAttr(q)}”</p>`;

/** "Permanente" / "Prueba". */
export const typeLabelL = (p, L) => L.text(p.category === 'ongoing' ? 'common.ongoing' : 'common.trial');

/** The words of a tri-state requirement flag in the page's language. */
export function flagWordsL(field, value, L) {
  if (value === null || value === undefined) return L.text('common.not_stated');
  if (field === 'commercial_ok') {
    if (value === true) return L.text('provider.flag_allowed');
    if (value === false) return L.text('provider.flag_eval_only');
    if (value === 'conditional') return L.text('provider.flag_conditional');
    return L.text('common.not_stated');
  }
  if (value === true) return L.text('provider.flag_required');
  if (value === false) return L.text('provider.flag_not_required');
  return L.text('common.not_stated');
}

/** The tri-state cell with the site's own classes (never colour alone: the words carry the value). */
const triCell = (field, value, L) => {
  const cls = value === null || value === undefined ? 'tri-unk' : (field === 'commercial_ok' ? (value === false ? 'tri-no' : 'tri-yes') : (value === false ? 'tri-yes' : 'tri-no'));
  return `<span class="tri ${cls}">${escapeAttr(flagWordsL(field, value, L))}</span>`;
};

// ---------- home ----------

/** The page title: counts from the data, month in Spanish ("nov 2026"). */
export const homeEsTitle = (counts, month, L) => L.text('home.title', { month, total: L.number(counts.total), verified: L.number(counts.verified) });
export const homeEsDescription = (counts, month, L) => L.text('home.desc', { month, ongoing: L.number(counts.ongoing), trial: L.number(counts.trial), verified: L.number(counts.verified), total: L.number(counts.total) });

/** The counters line, built from the data like the English one (build.mjs homeStatsHtml), dated by asOf. */
export function homeStatsL(providers, asOf, L, slaDays) {
  const genMs = Date.parse(asOf + 'T00:00:00Z');
  const ages = providers.filter((p) => p.verified && ISO.test(p.last_verified || '')).map((p) => Math.floor((genMs - Date.parse(p.last_verified + 'T00:00:00Z')) / 86400000));
  const oldest = ages.length ? Math.max(...ages) : 0;
  const status = freshnessStatus(oldest);
  const recheck = oldest <= 0 ? L.t('home.recheck_today') : L.t('home.recheck_days', { count: oldest });
  return [
    L.t('home.stat_tracked_html', { count: providers.length }),
    L.t('home.stat_ongoing_html', { count: providers.filter((p) => p.category === 'ongoing').length }),
    L.t('home.stat_trial_html', { count: providers.filter((p) => p.category === 'trial').length }),
    `<span class="st-fresh ${status}" data-sla="${slaDays}">${recheck}</span>`,
  ].join('<span class="st-sep" aria-hidden="true"> · </span>');
}

/**
 * The Spanish home body. Not the interactive explorer (site/explorer.js renders English on the client; January, see
 * docs/i18n.md): a server-rendered list of every provider linking to its Spanish page, and a link to the explorer.
 * `ordered` is the providers in the order to list them; `prefixes` = { root, home } as in the shell.
 */
export function homeEsMain({ providers, ordered = providers, asOf, L, slaDays, prefixes = { root: '../', home: '' }, tagline }) {
  const [lead, key] = tagline || [L.text('home.h1_lead'), L.text('home.h1_key')];
  const rows = ordered.map((p) => {
    const verified = p.verified && ISO.test(p.last_verified || '') ? L.time(p.last_verified) : escapeAttr(L.text('common.unverified'));
    return `<tr><td class="name"><a href="${prefixes.home}p/${escapeAttr(p.slug)}">${escapeAttr(p.name)}</a></td>` +
      `<td><span class="type">${escapeAttr(typeLabelL(p, L))}</span></td>` +
      `<td>${p.free_tier ? englishData(p.free_tier) : `<span class="tri tri-unk">${L.t('common.not_stated')}</span>`}</td>` +
      `<td>${verified}</td></tr>`;
  }).join('');
  return `<main id="main">` +
    `<section class="page-hero model-hero"><div class="wrap"><h1>${escapeAttr(lead)}${key ? ` <span class="h1-key">${escapeAttr(key)}</span>` : ''}</h1>` +
    `<p class="lede">${L.t('home.lede')}</p>` +
    `<p class="stats-line" id="stats">${homeStatsL(providers, asOf, L, slaDays)}</p></div></section>` +
    `<div class="wrap prose" id="explorer"><h2>${L.t('home.list_h2')}</h2>` +
    `<p class="muted">${L.t('home.list_intro', { total: L.number(providers.length) })} <a href="${prefixes.root}#explorer" hreflang="en">${L.t('home.open_explorer')}</a> ${L.t('common.english_only')}.</p>` +
    `<p class="muted">${L.t('common.data_in_english')}</p>` +
    `<table class="es-list"><caption class="sr-only">${L.t('home.list_h2')}</caption><thead><tr><th scope="col">${L.t('home.col_provider')}</th><th scope="col">${L.t('home.col_type')}</th><th scope="col">${L.t('home.col_free')}</th><th scope="col">${L.t('home.col_verified')}</th></tr></thead>` +
    `<tbody>${rows}</tbody></table></div></main>`;
}

// ---------- provider page ----------

/** "Sí: X tiene un nivel gratuito permanente. Tarjeta de crédito: no obligatoria. …", every fact from the record. */
export function answerFirstL(p, L) {
  const lead = L.t(p.category === 'ongoing' ? 'provider.answer_ongoing' : 'provider.answer_trial', { name: p.name });
  const reqs = L.t('provider.answer_reqs', {
    card: flagWordsL('card_required', p.card_required, L),
    phone: flagWordsL('phone_required', p.phone_required, L),
    commercial: flagWordsL('commercial_ok', p.commercial_ok, L),
  });
  return `<p class="answer-first" id="is-it-free">${lead} ${reqs}</p>`;
}

/** The structured limits with Spanish units and digits, their source and the day they were read. */
export function limitsL(p, L) {
  const fl = p.free_limits && safeHttps(p.free_limits.source) && ISO.test(String(p.free_limits.checked || '')) ? p.free_limits : null;
  const rows = fl ? LIMIT_KEYS.filter((k) => Number.isInteger(fl[k])).map((k) => `<tr><th scope="row">${L.t(`limit.${k}`)}</th><td>${escapeAttr(L.number(fl[k]))}</td></tr>`).join('') : '';
  const table = rows
    ? `<table class="limits-table"><caption class="sr-only">${L.t('provider.limits_caption')}</caption><tbody>${rows}</tbody></table>` +
      `<p class="muted limits-src">${fl.scope ? `${englishData(fl.scope)} ` : ''}${L.tHtml('provider.limits_source_html', { url: fl.source, date: L.time(fl.checked) }, ['date'])}</p>`
    : `<p class="muted">${L.t('provider.limits_none')}</p>`;
  const prose = p.rate_limits ? `<div class="prov-card"><h3>${L.t('provider.in_their_words')}</h3>${englishData(p.rate_limits, 'p')}</div>` : '';
  const catchCard = p.notes ? `<div class="prov-card"><h3>${L.t('provider.the_catch')}</h3>${englishData(p.notes, 'p')}</div>` : '';
  return `<h2 id="limits">${L.t('provider.limits')}</h2>${table}<div class="prov-grid">${prose}${catchCard}</div>`;
}

/** Card, phone and commercial use, each in words; a commercial condition stays as recorded (English). */
export function requirementsL(p, L) {
  const row = (label, field) => `<div class="req"><dt>${L.t(label)}</dt><dd>${triCell(field, p[field], L)}` +
    (field === 'commercial_ok' && p.commercial_ok === 'conditional' && p.commercial_ok_condition ? `<div class="req-condition">${englishData(p.commercial_ok_condition)}</div>` : '') + `</dd></div>`;
  return `<h2 id="requirements">${L.t('provider.requirements')}</h2><dl class="prov-reqs">` +
    row('provider.req_card', 'card_required') + row('provider.req_phone', 'phone_required') + row('provider.req_commercial', 'commercial_ok') + `</dl>`;
}

/** Plan, renewal, base URL and the day the provider was added. */
export function glanceL(p, L) {
  const ft = p.free_type && L.has(`provider.free_type.${p.free_type}`) ? L.t(`provider.free_type.${p.free_type}`) : p.free_type ? escapeAttr(p.free_type) : L.t('common.not_stated');
  const rows = [
    [L.t('provider.glance_plan'), escapeAttr(typeLabelL(p, L))],
    [L.t('provider.glance_renews'), ft],
    [L.t('provider.glance_base'), p.openai_base_url ? `<code>${escapeAttr(p.openai_base_url)}</code>` : L.t('common.not_stated')],
    ...(ISO.test(p.added || '') ? [[L.t('provider.glance_added'), L.time(p.added)]] : []),
  ];
  return `<div class="prov-meta">${rows.map(([k, v]) => `<div class="meta-row"><span class="meta-k">${k}</span><span class="meta-v">${v}</span></div>`).join('')}</div>`;
}

/** The quickstart: headings translated, code byte-for-byte the English page's (code is never translated). */
export function quickstartL(p, L, model) {
  const mods = p.modalities || [];
  if (!p.openai_base_url) return `<h2 id="quickstart">${L.t('provider.get_started')}</h2><p class="muted">${L.t('provider.no_base_url')}</p>`;
  if (mods.includes('embeddings') && !mods.includes('text')) {
    return `<h2 id="quickstart">${L.t('provider.quickstart_embeddings')}</h2><pre><code>${escapeText(pythonEmbeddingsQuickstart(p.openai_base_url, model))}</code></pre>`;
  }
  return `<h2 id="quickstart">${L.t('provider.quickstart_chat')}</h2><pre><code>${escapeText(pythonChatQuickstart(p.openai_base_url, model))}</code></pre>` +
    `<p class="muted">${L.t('provider.or_curl')}</p><pre><code>${escapeText(curlChatQuickstart(p.openai_base_url, model))}</code></pre>`;
}

/**
 * The Spanish provider page body. ctx: { L, prefixes: { root, home }, receipt: { q, u, readOn } | null, model, enHref }.
 * The sections not translated yet (models, speed, data policy, FAQ, compare, history, badges) are one link away, on
 * the English page (docs/i18n.md, January plan).
 */
export function providerEsMain(p, { L, prefixes, receipt = null, model = '<a-free-model>', enHref }) {
  const verified = p.verified && ISO.test(p.last_verified || '')
    ? `<span class="v ok">${L.tHtml('common.verified_on', { date: L.time(p.last_verified) }, ['date'])}</span>`
    : `<span class="v warn">${L.t('common.unverified')}</span>`;
  let receiptHtml = '';
  if (receipt && receipt.q) {
    let host = '';
    try { host = new URL(receipt.u).host + new URL(receipt.u).pathname.replace(/\/$/, ''); } catch { /* no URL: no cite link */ }
    const src = host && safeHttps(receipt.u) ? `<a href="${escapeAttr(receipt.u)}" rel="noopener">${escapeAttr(host)}</a>` : '';
    receiptHtml = verbatimQuote(receipt.q) +
      `<cite lang="${L.htmlLang}">${src ? L.tHtml('provider.receipt_from', { source: src }, ['source']) : ''}${ISO.test(receipt.readOn || '') ? `${src ? ' · ' : ''}${L.tHtml('common.read_on', { date: L.time(receipt.readOn) }, ['date'])}` : ''}</cite></blockquote>`;
  }
  const docs = safeHttps(p.docs_url) ? `<a class="btn primary" href="${escapeAttr(p.docs_url)}" target="_blank" rel="noopener">${L.t('provider.docs')}</a>` : '';
  const keys = safeHttps(p.keys_url) ? `<a class="btn primary" href="${escapeAttr(p.keys_url)}" target="_blank" rel="noopener">${L.t('provider.get_key')}</a>` : '';
  return `<section class="page-hero prov-hero"><div class="wrap"><nav class="crumbs" aria-label="${L.t('nav.breadcrumb')}">` +
    `<a href="${prefixes.home}">${L.t('provider.crumb_home')}</a> / <a href="${prefixes.home}#explorer">${L.t('provider.crumb_providers')}</a> / ${escapeAttr(p.name)}</nav>` +
    `<h1>${escapeAttr(p.name)}</h1>${answerFirstL(p, L)}` +
    `<div class="prov-badges"><span class="type">${escapeAttr(typeLabelL(p, L))}</span> ${verified}</div>` +
    receiptHtml +
    (p.best_for ? `<p class="lede" lang="en">${escapeAttr(p.best_for)}</p>` : '') +
    `<div class="prov-actions">${docs}</div></div></section>` +
    `<main id="main"><div class="wrap prose prov-prose">` +
    (p.free_tier ? `<div class="prov-summary"><h2 id="whats-free">${L.t('provider.whats_free')}</h2>${englishData(p.free_tier, 'p')}</div>` : '') +
    (keys ? `<div class="prov-actions prov-key">${keys}</div>` : '') +
    quickstartL(p, L, model) +
    limitsL(p, L) +
    requirementsL(p, L) +
    glanceL(p, L) +
    `<h2 id="more">${L.t('provider.more_h2')}</h2><p class="muted">${L.t('provider.more_intro')}</p>` +
    `<p><a href="${escapeAttr(enHref)}" hreflang="en">${L.t('provider.more_link')}</a></p>` +
    `</div></main>`;
}
