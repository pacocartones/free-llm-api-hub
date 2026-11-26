// model-pages.mjs — the per-model pages /models/<key>/ ("Free API for <model>").
//
// Every line comes from a field of data/providers.json. `models_free` is a sample, not part of the verified
// core claim, so a page never says a provider "offers" or "has" a model: it says the model is listed in that
// provider's free-model sample, shows the exact ID the provider lists, and repeats that the list changes.
// A flag nobody has confirmed reads "not confirmed", numbers appear only with their source and reading day,
// and a quality tier appears only when it was measured for this exact ID.
//
// Pure: build.mjs passes the groups from model-keys.mjs and the dataset date; the tests call the same code.

import { escapeHtml, escapeText } from './html.mjs';
import { comparator } from './sort.mjs';
import { expiryHtml } from './expiry.mjs';
import { requirementsHtml, freeLimitsTableHtml } from './provider-sections.mjs';
import { curlChatQuickstart } from './quickstart.mjs';
import { safeUrl, plural } from './text.mjs';

/** The fixed sample caveat. Every model page carries it, word for word (the tests look for it). */
export const MODEL_SAMPLE_CAVEAT = "Model lists are a sample and change often; confirm on the provider's catalogue before you build.";

/**
 * Which model pages search engines may index (the rest are built, linked from /models/, and carry noindex):
 *   'multi-provider' - two or more verified providers list the model. The default until the maintainer
 *                      chooses (spec 1.6 leaves the rule open; this is the narrower, thin-content-safe one).
 *   'quickstart'     - the spec's proposal: two or more verified providers, or one verified provider with its
 *                      own quickstart (openai_compatible and a base URL).
 */
export const MODEL_PAGE_INDEX_RULES = Object.freeze(['multi-provider', 'quickstart']);
export const MODEL_PAGE_INDEX_RULE = 'multi-provider';

const FREE_TYPE_LABEL = {
  'renewing-quota': 'Free quota that renews',
  perpetual: 'Free with no end date',
  'recurring-credit': 'Credit that renews',
  'trial-credit': 'One-time trial credit',
};

const ENV_NAME = /^[A-Z][A-Z0-9_]*$/;

export const hasQuickstart = (p) => p.openai_compatible === true && typeof p.openai_base_url === 'string' && /^https:\/\//i.test(p.openai_base_url);

/** Whether the page may be indexed. An unverified provider never counts. */
export function isIndexable(group, rule = MODEL_PAGE_INDEX_RULE) {
  if (!MODEL_PAGE_INDEX_RULES.includes(rule)) throw new Error(`unknown model page index rule: ${rule}`);
  const verified = group.entries.filter((e) => e.p.verified === true);
  if (verified.length >= 2) return true;
  return rule === 'quickstart' && verified.some((e) => hasQuickstart(e.p));
}

/** Entries in the explorer's "recommended" order (the same comparator the explorer runs). */
export const sortedEntries = (group) => [...group.entries].sort((a, b) => comparator('recommended', 1, a.p, b.p));

export function modelPageTitle(group) {
  return `Free API for ${group.name} — ${plural(group.entries.length, 'provider')} with a free tier · Free LLM API Hub`;
}

/** The meta description: the provider names that fit, so the build-wide 155-character cut never lands mid-name. */
export function modelPageDescription(group, max = 155) {
  const names = sortedEntries(group).map((e) => e.p.name);
  const tail = ' Limits, card/phone requirements and the exact model ID, from a dated, sourced dataset.';
  const head = `${group.name} on ${plural(names.length, 'free LLM API tier')}: `;
  let list = names.join(', ') + '.';
  for (let k = names.length - 1; k >= 1 && (head + list + tail).length > max; k--) list = names.slice(0, k).join(', ') + '…';
  return head + list + tail;
}

/** The quality tier, only when model_tier_source was measured for this exact ID. Never another model's tier. */
function tierHtml(p, id) {
  const src = p.model_tier_source;
  if (!src || src.model !== id || !Number.isInteger(p.model_tier)) return '';
  const link = safeUrl(src.url);
  return `<p class="muted">Quality tier for this ID: <strong>${p.model_tier}/4</strong>` +
    (typeof src.rating === 'number' ? ` (LMArena rating ${escapeHtml(src.rating)}` + (Number.isInteger(src.votes) ? `, ${src.votes.toLocaleString('en-US')} votes` : '') + `)` : '') +
    (src.snapshot ? `, snapshot ${escapeHtml(src.snapshot)}` : '') +
    (link ? `. <a href="${link}" target="_blank" rel="noopener">Source</a>` : '') + `.</p>`;
}

function quickstartHtml(p, id) {
  if (hasQuickstart(p)) {
    const key = ENV_NAME.test(String(p.env_key || '')) ? p.env_key : 'API_KEY';
    return `<h3>Try it</h3><pre><code>${escapeText(curlChatQuickstart(p.openai_base_url, id, { apiKeyVariable: key }))}</code></pre>`;
  }
  const docs = typeof p.docs_url === 'string' && /^https:\/\/\S+$/i.test(p.docs_url) ? escapeHtml(p.docs_url) : '';
  return `<p class="muted">No OpenAI-compatible base URL is recorded for this offer.` +
    (docs ? ` See the <a href="${docs}" target="_blank" rel="noopener">official docs</a> for how to call it.` : '') + `</p>`;
}

function catalogueHtml(p) {
  const url = safeUrl(p.models_url);
  if (url) return `<p class="muted"><a href="${url}" target="_blank" rel="noopener">${escapeHtml(p.name)} model catalogue ↗</a></p>`;
  if (typeof p.openai_base_url === 'string' && p.openai_base_url) return `<p class="muted">Current list: <code>GET ${escapeHtml(p.openai_base_url)}/models</code></p>`;
  return '';
}

function entryHtml({ id, p }, prefix) {
  const verified = p.verified === true
    ? (p.last_verified ? `Verified <time datetime="${escapeHtml(p.last_verified)}">${escapeHtml(p.last_verified)}</time>` : 'Verified')
    : `<span class="tri tri-unk">unverified</span>`;
  const plan = p.category === 'ongoing' ? 'Ongoing free tier' : 'Trial credit';
  const facts = [
    ['Model ID', `<code>${escapeHtml(id)}</code>`],
    ['Plan', `${plan} · ${escapeHtml(FREE_TYPE_LABEL[p.free_type] || p.free_type || 'not recorded')}`],
    ['Expires', expiryHtml(p)],
    ['Status', verified],
  ];
  return `<section class="model-provider" aria-labelledby="mp-${escapeHtml(p.slug)}">` +
    `<h2 id="mp-${escapeHtml(p.slug)}"><a href="${prefix}p/${escapeHtml(p.slug)}">${escapeHtml(p.name)}</a></h2>` +
    `<div class="prov-meta">${facts.map(([k, v]) => `<div class="meta-row"><span class="meta-k">${k}</span><span class="meta-v">${v}</span></div>`).join('')}</div>` +
    `<div class="prov-grid">` +
    (p.free_tier ? `<div class="prov-card"><h3>What's free</h3><p>${escapeHtml(p.free_tier)}</p></div>` : '') +
    (p.rate_limits ? `<div class="prov-card"><h3>In the provider's words</h3><p>${escapeHtml(p.rate_limits)}</p></div>` : '') +
    (p.notes ? `<div class="prov-card"><h3>The catch</h3><p>${escapeHtml(p.notes)}</p></div>` : '') +
    `</div>` +
    freeLimitsTableHtml(p, { model: id }) +
    requirementsHtml(p) +
    tierHtml(p, id) +
    quickstartHtml(p, id) +
    catalogueHtml(p) +
    `</section>`;
}

/** The <main> of a model page (hero included). `asOf` is the dataset date; `prefix` reaches the site root. */
export function modelPageMainHtml(group, { asOf, prefix = '../../' } = {}) {
  const entries = sortedEntries(group);
  const n = entries.length;
  const lede = `Listed in the free-model sample of <strong>${plural(n, 'provider')}</strong> in the dataset of <time datetime="${escapeHtml(asOf)}">${escapeHtml(asOf)}</time>. Each provider below lists it under the exact ID shown, which is the one to pass as <code>model</code>.`;
  return `<section class="page-hero model-hero"><div class="wrap"><nav class="crumbs" aria-label="Breadcrumb"><a href="${prefix}">Home</a> / <a href="${prefix}models/">Free model index</a> / ${escapeHtml(group.name)}</nav>` +
    `<h1>Free API for ${escapeHtml(group.name)}</h1><p class="lede">${lede}</p></div></section>` +
    `<main id="main"><div class="wrap prose prov-prose">` +
    `<p class="answer"><strong>${escapeHtml(MODEL_SAMPLE_CAVEAT)}</strong> Model samples are not part of the dataset's verified core claim.</p>` +
    entries.map((e) => entryHtml(e, prefix)).join('') +
    `<p class="prov-back"><a href="${prefix}models/">← Free model index</a></p>` +
    `</div></main>`;
}

/** Structured data: the page, its breadcrumb and the providers as an ItemList. No Product/Offer: a $0 price is not what the dataset verifies. */
export function modelPageJsonLd(group, { site }) {
  const url = `${site}/models/${group.key}/`;
  const entries = sortedEntries(group);
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebPage', name: `Free API for ${group.name}`, url, isPartOf: { '@type': 'WebPage', name: 'Free model index', url: `${site}/models/` } },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Free LLM API Hub', item: `${site}/` },
          { '@type': 'ListItem', position: 2, name: 'Free model index', item: `${site}/models/` },
          { '@type': 'ListItem', position: 3, name: group.name, item: url },
        ],
      },
      {
        '@type': 'ItemList',
        name: `Providers listing ${group.name} in their free-model sample`,
        numberOfItems: entries.length,
        itemListElement: entries.map((e, i) => ({ '@type': 'ListItem', position: i + 1, name: e.p.name, url: `${site}/p/${e.p.slug}` })),
      },
    ],
  });
}
