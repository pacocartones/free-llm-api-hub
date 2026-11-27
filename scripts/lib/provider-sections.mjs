// provider-sections.mjs — the sections of a provider page (/p/<slug>), kept apart from build.mjs so they can be
// tested on their own. Every section reads only fields that are in data/providers.json and says so honestly
// when a field is missing: a tri-state flag reads "not stated" in words (never just a colour), numbers
// appear only with the provider page they come from and the day they were read, and a section with nothing
// to show is left out (or reduced to one line) instead of repeating filler on every page.

import { escapeHtml } from './html.mjs';
import { ICON } from './rows.mjs';
import { timeHtml } from './dates.mjs';
import { NOT_STATED, NOT_STATED_HTML } from './not-stated.mjs';
import { triStateHtml } from './compare.mjs';
import { expiryHtml } from './expiry.mjs';
import { fieldCheck } from './field-checks.mjs';
import { publishedSpeed, speedFigure, SPEED_METRICS } from './published-speed.mjs';
import { FLAG_DEFS, flagHtml } from './flags.mjs';

// The shared flag component (lib/flags.mjs) around the page's own words: the shape, then the words, with the
// whole sentence as the accessible text.
const flagById = (id) => FLAG_DEFS.find((d) => d.id === id);

const FREE_TYPE_LABEL = {
  'renewing-quota': 'Free quota that renews',
  perpetual: 'Free with no end date',
  'recurring-credit': 'Credit that renews',
  'trial-credit': 'One-time trial credit',
};

const LIMIT_UNITS = [
  ['requests_per_second', 'requests per second'],
  ['requests_per_minute', 'requests per minute'],
  ['requests_per_day', 'requests per day'],
  ['requests_per_month', 'requests per month'],
  ['tokens_per_day', 'tokens per day'],
  ['tokens_per_month', 'tokens per month'],
];

const safeUrl = (u) => (/^https?:\/\//i.test(String(u || '')) ? escapeHtml(u) : '');

/**
 * The stable anchors of the facts of a provider page (/p/<slug>#card …), so an answer engine or a reader can cite one
 * fact and not only the page. The other facts already have theirs: #is-it-free (the answer under the H1), #whats-free,
 * #limits, #quickstart, #models, #data-policy and #faq. Only the provider page sets them (`anchors: true`): a page that
 * lists several providers, such as a model page, would repeat the ids. The /p/<slug>.md twin lists them all.
 */
export const FACT_ANCHORS = Object.freeze({
  card_required: 'card',
  phone_required: 'phone',
  commercial_ok: 'commercial',
  openai_compatible: 'openai',
});

/** What a visitor must give to start: three flags, each yes / no / "not stated" written out. */
export function requirementsHtml(p, { anchors = false } = {}) {
  const row = (icon, label, field, yes, no, extra = '') => {
    const check = fieldCheck(p, field);
    const def = FLAG_DEFS.find((d) => d.field === field);
    const id = anchors && FACT_ANCHORS[field] ? ` id="${FACT_ANCHORS[field]}"` : '';
    return `<div class="req"${id}><dt>${ICON(icon)}${label}</dt><dd>${flagHtml(def, p, { check, visible: triStateHtml(p[field], yes, no, check) })}${extra}${checkSourceHtml(check)}</dd></div>`;
  };
  const commercialCondition = p.commercial_ok === 'conditional' && p.commercial_ok_condition
    ? `<div class="req-condition">${escapeHtml(p.commercial_ok_condition)}</div>`
    : '';
  return `<dl class="prov-reqs" aria-label="What you need to start">` +
    row('ic-card', 'Credit card', 'card_required', 'required', 'not required') +
    row('ic-phone', 'Phone verification', 'phone_required', 'required', 'not required') +
    row('ic-building', 'Commercial use', 'commercial_ok', 'allowed', 'evaluation only', commercialCondition) +
    `</dl>`;
}

/** One line under a flag with a recorded check: the pages read and the day (and for stated, the provider's sentence). */
export function checkSourceHtml(check) {
  if (!check || !/^\d{4}-\d{2}-\d{2}$/.test(String(check.checked || ''))) return '';
  const links = (Array.isArray(check.sources) ? check.sources : []).map(safeUrl).filter(Boolean);
  const pages = links.map((u, i) => `<a href="${u}" target="_blank" rel="noopener">${links.length > 1 ? `page ${i + 1}` : "the provider's page"}</a>`).join(', ');
  const quote = check.status === 'stated' && check.quote ? `&ldquo;${escapeHtml(check.quote)}&rdquo; ` : '';
  const lead = check.status === 'stated' ? 'Per' : 'Read';
  return `<div class="req-source muted">${quote}${pages ? `${lead} ${pages}, ` : ''}checked ${timeHtml(check.checked, escapeHtml)}.${check.note ? ` ${escapeHtml(check.note)}` : ''}</div>`;
}

/**
 * The structured free limits with their source and reading date, or '' when they are missing or
 * unsourced. Numbers appear only with the provider page they come from and the day they were read.
 */
export function freeLimitsTableHtml(p) {
  const fl = p.free_limits && safeUrl(p.free_limits.source) && /^\d{4}-\d{2}-\d{2}$/.test(String(p.free_limits.checked || '')) ? p.free_limits : null;
  if (!fl) return '';
  const rows = LIMIT_UNITS.filter(([k]) => Number.isInteger(fl[k]))
    .map(([k, unit]) => `<tr><th scope="row">${unit}</th><td>${fl[k].toLocaleString('en-US')}</td></tr>`).join('');
  const src = safeUrl(fl.source);
  return `<table class="limits-table"><caption class="sr-only">Free limits as the provider publishes them</caption><tbody>${rows}</tbody></table>` +
    `<p class="muted limits-src">${escapeHtml(fl.scope || '')}${/[.!?]$/.test(fl.scope || '') || !fl.scope ? '' : '.'}` +
    (src ? ` Source: <a href="${src}" target="_blank" rel="noopener">the provider's page</a>, read ${timeHtml(fl.checked, escapeHtml)}.` : '') + `</p>`;
}

/** Free limits: the structured numbers with their source and reading date, then the provider's wording. */
export function limitsHtml(p) {
  const table = freeLimitsTableHtml(p);
  const prose = p.rate_limits ? `<div class="prov-card"><h3>In the provider's words</h3><p>${escapeHtml(p.rate_limits)}</p></div>` : '';
  const catchCard = p.notes ? `<div class="prov-card"><h3>The catch</h3><p>${escapeHtml(p.notes)}</p></div>` : '';
  const none = table ? '' : `<p class="muted">Numeric limits: not stated in structured form for this provider.</p>`;
  return `<h2 id="limits">Free limits</h2>${table}${none}<div class="prov-grid">${prose}${catchCard}</div>`;
}

/** The at-a-glance list: plain words instead of the dataset's internal labels. */
export function glanceHtml(p, typeLabel, { anchors = false } = {}) {
  const mods = (p.modalities || []).join(', ') || NOT_STATED;
  const base = p.openai_base_url ? `<code>${escapeHtml(p.openai_base_url)}</code>` : 'Not OpenAI-compatible: see the official docs';
  const rows = [
    ['Plan', `${escapeHtml(typeLabel)}${p.category === 'ongoing' ? ' free tier' : ' credit'}`],
    ['How it renews', escapeHtml(FREE_TYPE_LABEL[p.free_type] || p.free_type || NOT_STATED)],
    ['Expires', expiryHtml(p)],
    ['Modalities', escapeHtml(mods)],
    ['OpenAI base URL', base],
    ...(p.added ? [['Added to the hub', timeHtml(p.added, escapeHtml)]] : []),
  ];
  const idOf = (k) => (anchors && k === 'OpenAI base URL' ? ` id="${FACT_ANCHORS.openai_compatible}"` : '');
  return `<div class="prov-meta">${rows.map(([k, v]) => `<div class="meta-row"${idOf(k)}><span class="meta-k">${k}</span><span class="meta-v">${v}</span></div>`).join('')}</div>`;
}

/**
 * Free models: the sample with a way to pull the live list, or one short line when none is listed.
 * `modelHref(id)` (optional) returns the link of the model's own page, or '' for an ID that has none.
 */
export function modelsHtml(p, { modelHref = () => '' } = {}) {
  const catalog = safeUrl(p.models_url);
  const catalogLink = catalog
    ? `<a href="${catalog}" target="_blank" rel="noopener">Browse the official model catalogue ↗</a>`
    : '';
  if (!p.models_free || !p.models_free.length) {
    if (!catalogLink) return `<p class="muted models-none">Free models: not listed yet.</p>`;
    return `<h2 id="models">Free models</h2>` +
      `<p class="muted models-none">A free-model sample is not listed yet. ${catalogLink}</p>`;
  }
  return `<h2 id="models">Free models <span class="muted">· sample</span></h2>` +
    `<div class="model-chips">${p.models_free.map((m) => {
      const href = modelHref(m);
      return href ? `<a href="${escapeHtml(href)}"><code>${escapeHtml(m)}</code></a>` : `<code>${escapeHtml(m)}</code>`;
    }).join('')}</div>` +
    `<p class="muted">A sample of models reachable on the free tier — the live catalogue changes.` +
    (p.openai_base_url ? ` Pull the current set with <code>GET ${escapeHtml(p.openai_base_url)}/models</code>.` : '') +
    (catalogLink ? ` ${catalogLink}` : '') + `</p>`;
}

/**
 * Data policy: the slot REPO-064 fills. Nothing is rendered while a provider has no `data_policy`, so no page
 * carries a "not stated" block; once the field exists the same function shows it.
 */
export function dataPolicyHtml(p) {
  const dp = p.data_policy;
  if (!dp || typeof dp !== 'object') return '';
  const src = safeUrl(dp.source);
  return `<h2 id="data-policy">Data policy</h2><dl class="prov-reqs">` +
    `<div class="req"><dt>${ICON('ic-shield')}Trains on your prompts</dt><dd>${flagHtml(flagById('training'), p, { visible: triStateHtml(dp.trains_on_prompts, 'yes', 'no') })}</dd></div>` +
    `<div class="req"><dt>${ICON('ic-clock')}Retention</dt><dd>${dp.retention ? escapeHtml(dp.retention) : NOT_STATED_HTML}</dd></div></dl>` +
    (src ? `<p class="muted">Source: <a href="${src}" target="_blank" rel="noopener">the provider's page</a>.</p>` : '');
}

/**
 * Published speed: each figure the provider publishes for a model of its free sample, with its words, its page and the day it was
 * read. It says plainly that these are the provider's claims (the project measures nothing, issue #606) and whether the page ties
 * them to a plan. Nothing at all when the provider publishes no figure: absence is not "slow".
 */
export function speedHtml(p) {
  const list = publishedSpeed(p);
  if (!list.length) return '';
  const items = list.map((e) => {
    const m = SPEED_METRICS[e.metric];
    const src = safeUrl(e.source);
    const plan = e.plan_named === false ? ' The page ties this figure to no plan, so it is not stated for the free tier.' : '';
    return `<li><strong><code>${escapeHtml(e.model)}</code>: ${escapeHtml(speedFigure(e))}</strong> ${m ? escapeHtml(m.label) : ''}` +
      `<div class="req-source muted">&ldquo;${escapeHtml(e.quote)}&rdquo; ${src ? `Per <a href="${src}" target="_blank" rel="noopener">the provider's page</a>, ` : ''}checked ${timeHtml(e.checked, escapeHtml)}.` +
      `${e.conditions ? ` ${escapeHtml(e.conditions)}.` : ''}${plan}</div></li>`;
  }).join('');
  return `<h2 id="published-speed">Published speed</h2>` +
    `<p class="muted">The provider's own figures, under its own conditions. We do not measure speed, and figures from different providers are not a like-for-like benchmark.</p>` +
    `<ul class="speed-list">${items}</ul>`;
}
