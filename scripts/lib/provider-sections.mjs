// provider-sections.mjs — the sections of a provider page (/p/<slug>), kept apart from build.mjs so they can be
// tested on their own. Every section reads only fields that are in data/providers.json and says so honestly
// when a field is missing: a tri-state flag reads "not confirmed" in words (never just a colour), numbers
// appear only with the provider page they come from and the day they were read, and a section with nothing
// to show is left out (or reduced to one line) instead of repeating filler on every page.

import { htmlEsc } from './rows.mjs';
import { triStateHtml } from './compare.mjs';

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

const safeUrl = (u) => (/^https?:\/\//i.test(String(u || '')) ? htmlEsc(u) : '');

/** What a visitor must give to start: three flags, each yes / no / "not confirmed" written out. */
export function requirementsHtml(p) {
  const row = (label, v, yes, no) => `<div class="req"><dt>${label}</dt><dd>${triStateHtml(v, yes, no)}</dd></div>`;
  return `<dl class="prov-reqs" aria-label="What you need to start">` +
    row('Credit card', p.card_required, 'required', 'not required') +
    row('Phone verification', p.phone_required, 'required', 'not required') +
    row('Commercial use', p.commercial_ok, 'allowed', 'evaluation only') +
    `</dl>`;
}

/** Free limits: the structured numbers with their source and reading date, then the provider's wording. */
export function limitsHtml(p) {
  // Numbers appear only with the provider page they come from and the day they were read.
  const fl = p.free_limits && safeUrl(p.free_limits.source) && /^\d{4}-\d{2}-\d{2}$/.test(String(p.free_limits.checked || '')) ? p.free_limits : null;
  let table = '';
  if (fl) {
    const rows = LIMIT_UNITS.filter(([k]) => Number.isInteger(fl[k]))
      .map(([k, unit]) => `<tr><th scope="row">${unit}</th><td>${fl[k].toLocaleString('en-US')}</td></tr>`).join('');
    const src = safeUrl(fl.source);
    table = `<table class="limits-table"><caption class="sr-only">Free limits as the provider publishes them</caption><tbody>${rows}</tbody></table>` +
      `<p class="muted limits-src">${htmlEsc(fl.scope || '')}${/[.!?]$/.test(fl.scope || '') || !fl.scope ? '' : '.'}` +
      (src ? ` Source: <a href="${src}" target="_blank" rel="noopener">the provider's page</a>, read ${htmlEsc(fl.checked)}.` : '') + `</p>`;
  }
  const prose = p.rate_limits ? `<div class="prov-card"><h3>In the provider's words</h3><p>${htmlEsc(p.rate_limits)}</p></div>` : '';
  const catchCard = p.notes ? `<div class="prov-card"><h3>The catch</h3><p>${htmlEsc(p.notes)}</p></div>` : '';
  const none = fl ? '' : `<p class="muted">Numeric limits are not recorded in structured form for this provider.</p>`;
  return `<h2 id="limits">Free limits</h2>${table}${none}<div class="prov-grid">${prose}${catchCard}</div>`;
}

/** The at-a-glance list: plain words instead of the dataset's internal labels. */
export function glanceHtml(p, typeLabel) {
  // A trial credit with no recorded end date is unknown, not endless: only ongoing free tiers read "no expiry".
  const mods = (p.modalities || []).join(', ') || 'not listed';
  const base = p.openai_base_url ? `<code>${htmlEsc(p.openai_base_url)}</code>` : 'Not OpenAI-compatible: see the official docs';
  const rows = [
    ['Plan', `${htmlEsc(typeLabel)}${p.category === 'ongoing' ? ' free tier' : ' credit'}`],
    ['How it renews', htmlEsc(FREE_TYPE_LABEL[p.free_type] || p.free_type || 'not recorded')],
    ['Expires', p.expires ? htmlEsc(p.expires) : (p.free_type === 'trial-credit' ? '<span class="tri tri-unk">not confirmed</span>' : 'no expiry')],
    ['Modalities', htmlEsc(mods)],
    ['OpenAI base URL', base],
    ...(p.added ? [['Added to the hub', htmlEsc(p.added)]] : []),
  ];
  return `<div class="prov-meta">${rows.map(([k, v]) => `<div class="meta-row"><span class="meta-k">${k}</span><span class="meta-v">${v}</span></div>`).join('')}</div>`;
}

/** Free models: the sample with a way to pull the live list, or one short line when none is listed. */
export function modelsHtml(p) {
  if (!p.models_free || !p.models_free.length) return `<p class="muted models-none">Free models: not listed yet.</p>`;
  return `<h2 id="models">Free models <span class="muted">· sample</span></h2>` +
    `<div class="model-chips">${p.models_free.map((m) => `<code>${htmlEsc(m)}</code>`).join('')}</div>` +
    `<p class="muted">A sample of models reachable on the free tier — the live catalog changes.` +
    (p.openai_base_url ? ` Pull the current set with <code>GET ${htmlEsc(p.openai_base_url)}/models</code>.` : '') + `</p>`;
}

/**
 * Data policy: the slot REPO-064 fills. Nothing is rendered while a provider has no `data_policy`, so no page
 * carries a "not recorded yet" block; once the field exists the same function shows it.
 */
export function dataPolicyHtml(p) {
  const dp = p.data_policy;
  if (!dp || typeof dp !== 'object') return '';
  const src = safeUrl(dp.source);
  return `<h2 id="data-policy">Data policy</h2><dl class="prov-reqs">` +
    `<div class="req"><dt>Trains on your prompts</dt><dd>${triStateHtml(dp.trains_on_prompts, 'yes', 'no')}</dd></div>` +
    `<div class="req"><dt>Retention</dt><dd>${dp.retention ? htmlEsc(dp.retention) : '<span class="tri tri-unk">not confirmed</span>'}</dd></div></dl>` +
    (src ? `<p class="muted">Source: <a href="${src}" target="_blank" rel="noopener">the provider's page</a>.</p>` : '');
}
