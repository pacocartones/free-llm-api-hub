// model-families.mjs — the pages /free-api/<family>/ ("Where can I use <family> for free via API?").
//
// One page per open model family (Qwen, Gemma, DeepSeek, Llama, GPT-OSS, GLM): the verified providers whose
// free-model sample (`models_free`) lists a model of that family, with the limits, the card/phone/commercial flags and
// the verification date of each, all read from data/providers.json. Like the per-model pages (model-pages.mjs), a
// page never says a provider "offers" a model: `models_free` is a sample, not part of the verified core claim, so the
// page says the model is listed in that sample, shows the exact IDs, and carries the same caveat word for word. A
// null field reads "Not stated", never "no".
//
// Which families: the six with the most verified providers in `models_free` when the pages were added (2026-11-26:
// Qwen 14, Gemma 12, DeepSeek 10, Llama 8, GPT-OSS 8, GLM 8; Mistral was seventh with 7). The list is fixed so the
// URLs stay stable when the samples rotate; a family whose count drops below two verified providers keeps its page,
// with noindex, and leaves the sitemap and llms.txt (the same rule as the model pages).
//
// Pure: build.mjs passes the providers, the dataset date and the model-page links; the tests call the same code.

import { escapeHtml } from './html.mjs';
import { humanDate, timeHtml } from './dates.mjs';
import { NOT_STATED, capFirst } from './not-stated.mjs';
import { comparator } from './sort.mjs';
import { bareModelId } from './model-keys.mjs';
import { fieldCheck, REASON_WHY } from './field-checks.mjs';
import { MODEL_SAMPLE_CAVEAT } from './model-pages.mjs';
import { freeLimitBits, andList } from './long-guides.mjs';
import { plural } from './text.mjs';

export const FAMILY_PATH = 'free-api/';

/**
 * The families, in display order. `token` matches the family name in a bare model ID (organisation prefix removed,
 * see bareModelId) at the start of the ID or after a non-letter, so `qwen` matches `Qwen3-4B` and
 * `deepseek-r1-distill-qwen-32b` but never a word that merely contains the letters.
 */
export const MODEL_FAMILIES = Object.freeze([
  { slug: 'qwen', name: 'Qwen', token: /(?:^|[^a-z])(?:qwen|qwq)/i },
  { slug: 'gemma', name: 'Gemma', token: /(?:^|[^a-z])gemma/i },
  { slug: 'deepseek', name: 'DeepSeek', token: /(?:^|[^a-z])deepseek/i },
  { slug: 'llama', name: 'Llama', token: /(?:^|[^a-z])llama/i },
  { slug: 'gpt-oss', name: 'GPT-OSS', token: /(?:^|[^a-z])gpt-oss/i },
  { slug: 'glm', name: 'GLM', token: /(?:^|[^a-z])glm/i },
].map(Object.freeze));

/**
 * The family of one model ID, or null. An ID that names two families belongs to the one it names first: DeepSeek's
 * `deepseek-r1-distill-qwen-32b` is a DeepSeek model, AI Singapore's `Qwen-SEA-LION-v4.5-27B-IT` a Qwen one.
 */
export function familyOf(id, families = MODEL_FAMILIES) {
  const bare = bareModelId(id);
  let best = null;
  let at = Infinity;
  for (const f of families) {
    const m = f.token.exec(bare);
    if (m && m.index < at) { best = f; at = m.index; }
  }
  return best;
}

/**
 * The page data of one family: `{ ...family, entries: [{ p, ids }] }`, the verified providers whose sample lists at
 * least one ID of the family (in the order the provider lists them), in the explorer's "recommended" order.
 * An unverified provider is left out: these pages promise verified data.
 */
export function familyGroup(family, providers, families = MODEL_FAMILIES) {
  const entries = [];
  for (const p of providers || []) {
    if (p?.verified !== true || !Array.isArray(p.models_free)) continue;
    const ids = p.models_free.filter((id) => typeof id === 'string' && id.trim() && familyOf(id, families) === family);
    if (ids.length) entries.push({ p, ids: [...new Set(ids)] });
  }
  entries.sort((a, b) => comparator('recommended', 1, a.p, b.p));
  return { ...family, entries };
}

export const familyGroups = (providers, families = MODEL_FAMILIES) => families.map((f) => familyGroup(f, providers, families));

/** Indexed (sitemap, llms.txt, no noindex) only with two or more verified providers, as the model pages. */
export const isFamilyIndexable = (group) => group.entries.length >= 2;

export const familyUrl = (site, group) => `${site}/${FAMILY_PATH}${group.slug}/`;

export const familyH1 = (group) => `Where can I use ${group.name} for free via API?`;

export function familyPageTitle(group) {
  return `Free ${group.name} API: ${plural(group.entries.length, 'provider')} with free access · Free LLM API Hub`;
}

/** The meta description: as many provider names as fit, so the build-wide 155-character cut never lands mid-name. */
export function familyPageDescription(group, max = 155) {
  const names = group.entries.map((e) => e.p.name);
  if (!names.length) return `No verified provider lists a ${group.name} model in its free-model sample right now. See the free model index for what is listed.`;
  const head = `Use ${group.name} free via API on ${plural(names.length, 'provider')}: `;
  const tail = ' Limits, card, phone and commercial use, dated.';
  let list = names.join(', ') + '.';
  for (let k = names.length - 1; k >= 1 && (head + list + tail).length > max; k--) list = names.slice(0, k).join(', ') + '…';
  return head + list + tail;
}

/** The short summary line llms.txt and the hub use. */
export function familyBlurb(group) {
  const n = group.entries.length;
  const ongoing = group.entries.filter((e) => e.p.category === 'ongoing').length;
  return `${plural(n, 'provider')}${n === 1 ? ', verified,' : ', all verified,'} ${n === 1 ? 'lists' : 'list'} a ${group.name} model in ${n === 1 ? 'its' : 'their'} free-model sample (${ongoing} ongoing free ${ongoing === 1 ? 'tier' : 'tiers'}, ${n - ongoing} trial ${n - ongoing === 1 ? 'credit' : 'credits'})`;
}

/** The direct answer, plain text ("N providers …, all verified": the build's count guard reads "N verified providers"
 * as a dataset-wide figure): the count, the ongoing/trial split and the first three in the recommended order. */
export function familyAnswer(group, asOf) {
  const n = group.entries.length;
  if (!n) return `As of ${humanDate(asOf) || asOf}, no verified provider in the dataset lists a ${group.name} model in its free-model sample.`;
  const ongoing = group.entries.filter((e) => e.p.category === 'ongoing').length;
  const top = group.entries.slice(0, 3).map((e) => e.p.name);
  const split = ongoing === n ? (n === 1 ? 'an ongoing free tier' : 'all ongoing free tiers')
    : ongoing === 0 ? (n === 1 ? 'a one-time trial credit' : 'all one-time trial credits')
      : `${ongoing} with an ongoing free tier and ${n - ongoing} with one-time trial credit`;
  return `As of ${humanDate(asOf) || asOf}, ${plural(n, 'provider')} in the dataset${n === 1 ? ', verified,' : ', all verified,'} ${n === 1 ? 'lists' : 'list'} a ${group.name} model in ${n === 1 ? 'its' : 'their'} free-model sample: ${split}. ` +
    (n === 1 ? `The option is ${top[0]}.` : `The top options, in the hub's recommended order, are ${andList(top)}.`);
}

// ---------- table cells (every data string escaped) ----------
const time = (d) => (d ? timeHtml(d, escapeHtml) : capFirst(NOT_STATED));
const notes = (t) => `<br><span class="notes">${t}</span>`;
// The reason a flag is null, when it says more than "not stated".
const reasonNote = (p, field) => {
  const c = fieldCheck(p, field);
  return c && (c.status === 'needs_account' || c.status === 'sources_disagree') ? notes(escapeHtml(REASON_WHY[c.status])) : '';
};
const requiredCell = (p, field) => (p[field] === true ? 'Required' : p[field] === false ? 'Not required' : capFirst(NOT_STATED) + reasonNote(p, field));
function commercialCell(p) {
  if (p.commercial_ok === true) return 'Allowed';
  if (p.commercial_ok === false) return '<strong>Not allowed</strong>';
  if (p.commercial_ok === 'conditional') return 'Conditional' + (p.commercial_ok_condition ? notes(escapeHtml(p.commercial_ok_condition)) : '');
  return capFirst(NOT_STATED) + reasonNote(p, 'commercial_ok');
}
function limitsCell(p) {
  const bits = freeLimitBits(p);
  const words = typeof p.rate_limits === 'string' && p.rate_limits.trim() ? escapeHtml(p.rate_limits) : '';
  if (bits.length) return bits.map(escapeHtml).join('<br>') + (words ? notes(words) : '');
  return words || capFirst(NOT_STATED);
}
const planLine = (p) => (p.category === 'ongoing' ? 'Ongoing free tier' : 'One-time trial credit');
// A long ID gets break points after its slashes, so it never widens a phone screen.
const idCode = (id) => `<code>${escapeHtml(id).replace(/\//g, '/<wbr>')}</code>`;

function tableHtml(group, { prefix, modelHref }) {
  const head = ['Provider', 'Model IDs in the free sample', 'Free limits', 'Card', 'Phone', 'Commercial use', 'Last verified'];
  const rows = group.entries.map(({ p, ids }) => [
    `<a href="${prefix}p/${escapeHtml(p.slug)}">${escapeHtml(p.name)}</a><br><small>${planLine(p)}</small>`,
    ids.map((id) => { const href = modelHref(id); return href ? `<a href="${escapeHtml(href)}">${idCode(id)}</a>` : idCode(id); }).join('<br>'),
    limitsCell(p),
    requiredCell(p, 'card_required'),
    requiredCell(p, 'phone_required'),
    commercialCell(p),
    time(p.last_verified),
  ]);
  return `<div class="table-scroll" role="region" aria-label="Providers listing ${escapeHtml(group.name)} for free" tabindex="0"><table><thead><tr>` +
    head.map((h) => `<th>${h}</th>`).join('') + `</tr></thead><tbody>\n` +
    rows.map((r) => `<tr>${r.map((v, i) => `<td${i === 0 ? ' class="name"' : ''}>${v}</td>`).join('')}</tr>`).join('\n') +
    `\n</tbody></table></div>`;
}

// The short, computed answers to the follow-up questions: which ones need no card, allow commercial use, speak the
// OpenAI API. Each list is only the providers whose field says so; nothing is inferred from a null.
function shortlistHtml(group, prefix) {
  const link = (p) => `<a href="${prefix}p/${escapeHtml(p.slug)}">${escapeHtml(p.name)}</a>`;
  const ps = group.entries.map((e) => e.p);
  const line = (label, list) => `<li><strong>${label}:</strong> ${list.length ? andList(list.map(link)) : 'none in the data'}</li>`;
  return `<h2 id="shortlist">Shortlist</h2><ul>` +
    line('No card and no phone', ps.filter((p) => p.card_required === false && p.phone_required === false)) +
    line('Commercial use allowed', ps.filter((p) => p.commercial_ok === true)) +
    line('Ongoing free tier (not a one-time credit)', ps.filter((p) => p.category === 'ongoing')) +
    line('OpenAI-compatible endpoint', ps.filter((p) => p.openai_compatible === true)) +
    `</ul>`;
}

/**
 * The <main> of a family page, hero included. `asOf` is the dataset date; `prefix` reaches the site root;
 * `modelHref(id)` is the per-model page of an ID ('' when it has none); `others` are the other family groups.
 */
export function familyPageMainHtml(group, { asOf, prefix = '../../', modelHref = () => '', others = [] } = {}) {
  const related = others.filter((o) => o.slug !== group.slug)
    .map((o) => `<a href="${prefix}${FAMILY_PATH}${o.slug}/">${escapeHtml(o.name)}</a>`).join('');
  return `<section class="page-hero model-hero"><div class="wrap"><nav class="crumbs" aria-label="Breadcrumb"><a href="${prefix}">Home</a> / <a href="${prefix}models/">Free model index</a> / ${escapeHtml(group.name)}</nav>` +
    `<h1>${escapeHtml(familyH1(group))}</h1><p class="lede">Data as of ${timeHtml(asOf, escapeHtml)}. Only verified providers; every limit is the provider’s own, with the day it was checked.</p></div></section>` +
    `<main id="main"><div class="wrap prose">` +
    `<p class="answer"><strong>${escapeHtml(familyAnswer(group, asOf))}</strong></p>` +
    `<p class="muted">${escapeHtml(MODEL_SAMPLE_CAVEAT)} Model samples are not part of the dataset's verified core claim; the limits, flags and dates are.</p>` +
    (group.entries.length
      ? `<h2 id="providers">Providers listing ${escapeHtml(group.name)} for free</h2>` + tableHtml(group, { prefix, modelHref }) + shortlistHtml(group, prefix)
      : `<p>See the <a href="${prefix}models/">free model index</a> for the models that are listed.</p>`) +
    `<p>Need a specific setup? <a href="${prefix}find/">Find my free API</a> filters every provider by card, phone and commercial use, and <a href="${prefix}compare/">Compare</a> puts two to four side by side.</p>` +
    (related ? `<h2>Other model families</h2><nav class="colls">${related}</nav>` : '') +
    `<p class="prov-back"><a href="${prefix}models/">← Free model index</a></p>` +
    `</div></main>`;
}

/** The navigation block the /models/ index carries: one link per family page. */
export function familyNavHtml(groups, prefix = '../') {
  return `<nav class="colls" aria-label="Free API by model family">` +
    groups.map((g) => `<a href="${prefix}${FAMILY_PATH}${g.slug}/">${escapeHtml(g.name)}</a>`).join('') + `</nav>`;
}
