// longtail-pages.mjs — two programmatic templates for long-tail searches (SEO plan Q1 2027, §3.2 P1/P2 and §3.3):
//
//   /limits/<slug>/        "<Provider> free tier limits": every recorded fact about the free tier, each with the page it
//                          comes from, the day it was read and, where the dataset holds one, the provider's own sentence.
//   /alternatives/<slug>/  "Free <Provider> alternatives": verified providers that overlap with the original on recorded
//                          fields (primary modality, OpenAI compatibility, kind of free offer).
//
// Thin-content safeguards (§3.3): a page is built only when its template's threshold holds; otherwise there is no page,
// no sitemap entry and no link to it. Every sentence is a template filled with dataset fields: no free prose, no number
// that is not in data/providers.json, and a null flag is written as the reason recorded in field_checks (REASON_LABEL:
// "not stated in the provider's docs", "not stated: needs an account to check", ...), never as "no".
//
// Pure: build.mjs passes the providers, the dataset date (ASOF), data/not-free.json and its pageHero (the shared hero of
// every generated page, as for /not-free/); the tests call the same functions. An original that /not-free/ already
// covers (it stopped being free, or never was) gets no alternatives page: its entry there lists the closest free
// alternatives, and the /alternatives/ index links it.

import { escapeHtml } from './html.mjs';
import { comparator } from './sort.mjs';
import { ageInDays, SLA_DAYS } from './rules.mjs';
import { fieldCheck, REASON_LABEL } from './field-checks.mjs';
import { requirementsHtml, freeLimitsTableHtml, keysButtonHtml } from './provider-sections.mjs';
import { andList } from './long-guides.mjs';
import { NOT_STATED } from './not-stated.mjs';
import { FAMILY_PATH } from './model-families.mjs';
import { triStateHtml } from './compare.mjs';
import { datasetRef, websiteRef } from './site-entity.mjs';
import { safeUrl } from './text.mjs';
import { isoDateTime } from './structured-data.mjs';
import { collectionPageJsonLd, breadcrumbList } from './page-jsonld.mjs';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Sources on these pages must be https with no white space: stricter than text.mjs's http(s), built on its safeUrl.
const httpsUrl = (u) => (/^https:\/\/[^\s]+$/i.test(String(u || '')) ? safeUrl(u) : '');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** 2026-11-24 -> "24 Nov 2026". */
export const dayLabel = (iso) => (DATE_RE.test(String(iso || '')) ? `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}` : '');

/** Age in days of a date against the dataset date (never the clock, so the drift-gated pages stay byte-stable). */
const ageAt = (iso, asOf) => ageInDays(iso, new Date(`${asOf}T00:00:00Z`));

// ---------------------------------------------------------------- shared thresholds

/** A verification older than this (days, against the dataset date) leaves the date out of the title and shows a notice (§3.3-4). */
export const TITLE_DATE_MAX_DAYS = 30;
/** A page is built only for an entry verified within the freshness SLA (docs/freshness-sla.md), measured at the dataset date. */
export const PAGE_MAX_AGE_DAYS = SLA_DAYS;

const freshEnough = (p, asOf) => p.verified === true && DATE_RE.test(String(p.last_verified || '')) && ageAt(p.last_verified, asOf) <= PAGE_MAX_AGE_DAYS;

// ---------------------------------------------------------------- /limits/<slug>/

/** The facts a limits page is made of. Each counts only when the dataset records where it comes from. */
export const LIMIT_FACTS = Object.freeze(['free_limits', 'data_policy', 'card_required', 'phone_required', 'commercial_ok']);
/**
 * The limits page threshold: a verified entry inside the freshness SLA, structured `free_limits` with a source and a
 * reading date (the numbers the query asks for), and at least LIMITS_MIN_FACTS of LIMIT_FACTS sourced.
 */
export const LIMITS_MIN_FACTS = 4;

const hasSourcedLimits = (p) => !!(p.free_limits && httpsUrl(p.free_limits.source) && DATE_RE.test(String(p.free_limits.checked || '')));
const hasRecordedCheck = (p, field) => {
  const c = fieldCheck(p, field);
  return !!(c && DATE_RE.test(String(c.checked || '')) && Array.isArray(c.sources) && c.sources.some((s) => httpsUrl(s)));
};

/** The LIMIT_FACTS this entry records with a source. */
export function sourcedFacts(p) {
  return LIMIT_FACTS.filter((f) => {
    if (f === 'free_limits') return hasSourcedLimits(p);
    if (f === 'data_policy') return !!(p.data_policy && typeof p.data_policy === 'object' && httpsUrl(p.data_policy.source));
    return hasRecordedCheck(p, f);
  });
}

export function hasLimitsPage(p, asOf) {
  return freshEnough(p, asOf) && hasSourcedLimits(p) && sourcedFacts(p).length >= LIMITS_MIN_FACTS;
}

const LIMIT_WORDS = [
  ['requests_per_second', 'requests per second'],
  ['requests_per_minute', 'requests per minute'],
  ['requests_per_day', 'requests per day'],
  ['requests_per_month', 'requests per month'],
  ['tokens_per_day', 'tokens per day'],
  ['tokens_per_month', 'tokens per month'],
];
/** A dataset string as a sentence: trimmed, ending with a full stop. */
const sentence = (t) => { const x = String(t || '').trim(); return /[.!?]$/.test(x) ? x : `${x}.`; };
const sourceHost = (u) => { try { return new URL(u).hostname; } catch { return ''; } };

/** What one flag says, in words: the value, or the recorded reason it stays unknown. Plain text. */
function flagReasonWords(p, field, yes, no) {
  const v = p[field];
  if (v === true) return yes;
  if (v === false) return no;
  if (v === 'conditional') return 'conditional';
  const c = fieldCheck(p, field);
  return REASON_LABEL[c && REASON_LABEL[c.status] ? c.status : 'not_checked'];
}

/** The 1–2 sentence answer under the H1, from free_limits, card_required, phone_required and the limits source only. Plain text. */
export function limitsAnswer(p) {
  const fl = p.free_limits;
  const nums = LIMIT_WORDS.filter(([k]) => Number.isInteger(fl[k])).map(([k, w]) => `${fl[k].toLocaleString('en-US')} ${w}`);
  const scope = fl.scope ? ` (${String(fl.scope).replace(/[.\s]+$/, '')})` : '';
  const first = `As of ${dayLabel(fl.checked)}, ${p.name} publishes these free limits: ${andList(nums)}${scope}.`;
  const second = `Credit card: ${flagReasonWords(p, 'card_required', 'required', 'not required')}. Phone verification: ${flagReasonWords(p, 'phone_required', 'required', 'not required')}.`;
  const host = sourceHost(fl.source);
  return `${first} ${second}${host ? ` Source: ${host}.` : ''}`;
}

export function limitsPageTitle(p, asOf) {
  const dated = ageAt(p.last_verified, asOf) <= TITLE_DATE_MAX_DAYS;
  return `${p.name} free tier limits${dated ? ` (verified ${dayLabel(p.last_verified)})` : ''} · Free LLM API Hub`;
}

export const limitsPageDescription = (p) => limitsAnswer(p);

/** Data policy with the provider's sentence, its page, the day it was read and whether the page names the free plan. */
function policyHtml(p) {
  const dp = p.data_policy;
  if (!dp || typeof dp !== 'object' || !httpsUrl(dp.source)) {
    return `<h2 id="data-policy">Data policy</h2><p class="muted">No data policy is recorded for this provider yet.</p>`;
  }
  const src = httpsUrl(dp.source);
  const day = DATE_RE.test(String(dp.checked || '')) ? `, read ${escapeHtml(dp.checked)}` : '';
  const plan = dp.plan_named === false ? ' The page does not name the free plan, so this is the provider\'s general policy.' : '';
  return `<h2 id="data-policy">Data policy</h2><dl class="prov-reqs">` +
    `<div class="req"><dt>Trains on your prompts</dt><dd>${triStateHtml(dp.trains_on_prompts, 'yes', 'no')}</dd></div>` +
    `<div class="req"><dt>Retention</dt><dd>${dp.retention ? escapeHtml(dp.retention) : `<span class="tri tri-unk">${NOT_STATED}</span>`}</dd></div></dl>` +
    `<p class="req-source muted">${dp.quote ? `&ldquo;${escapeHtml(dp.quote)}&rdquo; ` : ''}Per <a href="${src}" target="_blank" rel="noopener">the provider's page</a>${day}.${plan}</p>`;
}

/**
 * Links to the model-family pages (/free-api/<family>/, lib/model-families.mjs) whose provider list includes `p`, so a
 * provider page here and a family page point at each other instead of repeating each other's tables. `families`: the
 * indexable family groups ({ slug, name, entries }).
 */
export function familyLinksHtml(p, families, prefix) {
  const mine = (families || []).filter((g) => (g.entries || []).some((e) => e.p && e.p.slug === p.slug));
  if (!mine.length) return '';
  return `<p>Open model families in ${escapeHtml(p.name)}'s free-model sample, with every provider that lists them: ` +
    andList(mine.map((g) => `<a href="${prefix}${FAMILY_PATH}${escapeHtml(g.slug)}/">${escapeHtml(g.name)}</a>`)) + `.</p>`;
}

/** The main of /limits/<slug>/. `alternatives`: whether /alternatives/<slug>/ exists; `pageHero`: build.mjs's hero. */
export function limitsPageMainHtml(p, { asOf, pageHero, prefix = '../../', alternatives = false, families = [] }) {
  const age = ageAt(p.last_verified, asOf);
  const stale = age > TITLE_DATE_MAX_DAYS
    ? `<p class="v warn">Last verified ${escapeHtml(p.last_verified)}, ${age} days before the dataset date (${escapeHtml(asOf)}): these limits may be out of date.</p>`
    : '';
  const crumbs = `<a href="${prefix}">Home</a> / <a href="${prefix}limits/">Free tier limits</a> / ${escapeHtml(p.name)}`;
  const facts = sourcedFacts(p);
  return pageHero({ crumbs, h1: `${escapeHtml(p.name)} free tier limits`, lede: escapeHtml(limitsAnswer(p)) }) +
    `<main id="main"><div class="wrap prose prov-prose">` +
    stale +
    `<h2 id="limits">Free limits</h2>` +
    freeLimitsTableHtml(p) +
    keysButtonHtml(p) +
    (p.rate_limits ? `<div class="prov-card"><h3>As published</h3><p>${escapeHtml(p.rate_limits)}</p></div>` : '') +
    (p.free_tier ? `<div class="prov-card"><h3>What's free</h3><p>${escapeHtml(p.free_tier)}</p></div>` : '') +
    (p.notes ? `<div class="prov-card"><h3>The catch</h3><p>${escapeHtml(p.notes)}</p></div>` : '') +
    `<h2 id="requirements">What you need to start</h2>` +
    requirementsHtml(p) +
    policyHtml(p) +
    `<h2 id="verification">Verification</h2>` +
    `<p>Entry last verified <time datetime="${escapeHtml(p.last_verified)}">${escapeHtml(p.last_verified)}</time>. ` +
    `${facts.length} of ${LIMIT_FACTS.length} facts on this page carry a recorded source. Limits change without notice: confirm on the provider's page before you build.</p>` +
    `<h2 id="more">More on ${escapeHtml(p.name)}</h2><div class="colls">` +
    `<a href="${prefix}p/${escapeHtml(p.slug)}">${escapeHtml(p.name)}: models, quickstart and change history</a>` +
    (alternatives ? `<a href="${prefix}alternatives/${escapeHtml(p.slug)}/">Free ${escapeHtml(p.name)} alternatives</a>` : '') +
    `<a href="${prefix}limits/">Free tier limits of other providers</a></div>` +
    familyLinksHtml(p, families, prefix) +
    `</div></main>`;
}

export function limitsPageJsonLd(p, { site, facts }) {
  const url = `${site}/limits/${p.slug}/`;
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage', name: `${p.name} free tier limits`, description: limitsAnswer(p), url,
        dateModified: isoDateTime(p.last_verified),
        isPartOf: websiteRef(site), about: datasetRef(site, facts),
      },
      breadcrumbList(site, [['Free tier limits', `${site}/limits/`], [p.name, url]]),
    ],
  });
}

// ---------------------------------------------------------------- /alternatives/<slug>/

/**
 * The providers people search alternatives for (SEO plan §3.2 P2, issue 4). One that is not in the dataset (mistral,
 * together-ai today) gets no page until it is. OpenAI is not in this list on purpose: it has no free API tier, and a
 * guide covers "free OpenAI API alternatives" instead of a template with an exception (maintainer decision, P-5).
 */
export const ALTERNATIVES_FOR = Object.freeze(['openrouter', 'groq', 'google-gemini', 'mistral', 'cerebras', 'together-ai', 'huggingface', 'nvidia-nim', 'cloudflare-workers-ai', 'cohere']);
/** At least this many qualifying alternatives, or no page (§3.2 P2). */
export const ALTERNATIVES_MIN = 5;
/** At most this many rows: the closest ones, so each page lists its own set. */
export const ALTERNATIVES_MAX = 8;

const primaryModality = (p) => (Array.isArray(p.modalities) && p.modalities[0]) || null;

/**
 * Whether `cand` qualifies as a free alternative to `orig`: verified and inside the freshness SLA, the same primary
 * modality, OpenAI-compatible when the original is, and a comparable free offer (an ongoing free tier always; a
 * one-time trial only for an original that is a trial itself).
 */
export function isAlternative(orig, cand, asOf) {
  if (!cand || cand.slug === orig.slug || !freshEnough(cand, asOf)) return false;
  if (!primaryModality(orig) || primaryModality(cand) !== primaryModality(orig)) return false;
  if (orig.openai_compatible === true && cand.openai_compatible !== true) return false;
  return cand.category === 'ongoing' || orig.category === cand.category;
}

const jaccard = (a, b) => {
  const A = new Set(a || []); const B = new Set(b || []);
  const inter = [...A].filter((x) => B.has(x)).length;
  const union = new Set([...A, ...B]).size;
  return union ? inter / union : 0;
};

/** The qualifying alternatives, closest first: modality overlap, same kind of free offer, ongoing, structured limits, then the explorer's order. */
export function alternativesFor(orig, providers, asOf) {
  const key = (c) => [
    -jaccard(orig.modalities, c.modalities),
    c.free_type === orig.free_type ? 0 : 1,
    c.category === 'ongoing' ? 0 : 1,
    hasSourcedLimits(c) ? 0 : 1,
  ];
  return providers.filter((c) => isAlternative(orig, c, asOf)).sort((a, b) => {
    const ka = key(a); const kb = key(b);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
    return comparator('recommended', 1, a, b);
  });
}

/** The not-free.json entries for the listed originals, by slug (an entry's dataset slug, else its id). */
export function notFreeOriginals(notFree) {
  const bySlug = new Map(((notFree && notFree.entries) || []).map((e) => [e.slug || e.id, e]));
  return ALTERNATIVES_FOR.filter((slug) => bySlug.has(slug)).map((slug) => bySlug.get(slug));
}

/**
 * The alternatives pages to build: [{ p, alts }] for each listed original in the dataset that passes the threshold and
 * that /not-free/ does not already cover (`notFree`: data/not-free.json).
 */
export function alternativesPages(providers, asOf, { notFree } = {}) {
  const bySlug = new Map(providers.map((p) => [p.slug, p]));
  const covered = new Set(notFreeOriginals(notFree).map((e) => e.slug || e.id));
  return ALTERNATIVES_FOR.filter((slug) => !covered.has(slug)).map((slug) => bySlug.get(slug))
    .filter((p) => p && freshEnough(p, asOf))
    .map((p) => ({ p, alts: alternativesFor(p, providers, asOf) }))
    .filter(({ alts }) => alts.length >= ALTERNATIVES_MIN)
    .map(({ p, alts }) => ({ p, alts: alts.slice(0, ALTERNATIVES_MAX) }));
}

const FREE_TYPE_WORDS = {
  'renewing-quota': 'a free quota that renews',
  perpetual: 'a free tier with no end date',
  'recurring-credit': 'a credit that renews',
  'trial-credit': 'a one-time trial credit',
};

/** One line per row: how the alternative differs from the original on recorded fields. Plain text, never free prose. */
export function differenceLine(orig, cand) {
  const out = [];
  if (cand.free_type !== orig.free_type && FREE_TYPE_WORDS[cand.free_type]) out.push(`${FREE_TYPE_WORDS[cand.free_type]} (${orig.name}: ${FREE_TYPE_WORDS[orig.free_type] || 'not recorded'})`);
  if (cand.card_required === false && orig.card_required !== false) out.push(`no credit card required (${orig.name}: ${flagReasonWords(orig, 'card_required', 'required', 'not required')})`);
  if (cand.card_required === true && orig.card_required !== true) out.push('credit card required');
  if (cand.phone_required === true && orig.phone_required !== true) out.push('phone verification required');
  if (cand.phone_required === false && orig.phone_required !== false) out.push(`no phone verification (${orig.name}: ${flagReasonWords(orig, 'phone_required', 'required', 'not required')})`);
  if (cand.commercial_ok === false && orig.commercial_ok !== false) out.push('evaluation only');
  if (cand.commercial_ok === true && orig.commercial_ok !== true) out.push(`commercial use allowed (${orig.name}: ${flagReasonWords(orig, 'commercial_ok', 'allowed', 'evaluation only')})`);
  const a = hasSourcedLimits(orig) && Number.isInteger(orig.free_limits.requests_per_day) ? orig.free_limits.requests_per_day : null;
  const b = hasSourcedLimits(cand) && Number.isInteger(cand.free_limits.requests_per_day) ? cand.free_limits.requests_per_day : null;
  if (a !== null && b !== null && a !== b) out.push(`${b > a ? 'higher' : 'lower'} published daily request cap: ${b.toLocaleString('en-US')} vs ${a.toLocaleString('en-US')}`);
  const extra = (cand.modalities || []).filter((m) => !(orig.modalities || []).includes(m));
  if (extra.length) out.push(`also lists ${andList(extra)}`);
  const missing = (orig.modalities || []).filter((m) => !(cand.modalities || []).includes(m));
  if (missing.length) out.push(`no ${andList(missing)} listed`);
  return out.length ? out.slice(0, 4).join('; ') : `no recorded difference in plan, card, phone, commercial use or modalities`;
}

export function alternativesPageTitle(orig, alts) {
  return `Free ${orig.name} alternatives: ${alts.length} verified free tiers · Free LLM API Hub`;
}

/** The criteria sentence, from the fields the rule reads. Plain text. */
export function alternativesCriteria(orig) {
  const parts = [`share ${orig.name}'s primary modality (${primaryModality(orig)})`];
  if (orig.openai_compatible === true) parts.push(`are OpenAI-compatible like ${orig.name}`);
  parts.push(orig.category === 'ongoing' ? 'offer an ongoing free tier' : 'offer an ongoing free tier or a trial credit');
  return `Verified providers that ${andList(parts)}, closest first.`;
}

export const alternativesPageDescription = (orig, alts) =>
  `${alts.length} free alternatives to ${orig.name}: ${alts.slice(0, 4).map((c) => c.name).join(', ')}${alts.length > 4 ? '…' : '.'} Card, phone, limits and verified date for each, from a sourced dataset.`;

function limitsCell(c, prefix, limitPages) {
  const fl = hasSourcedLimits(c) ? c.free_limits : null;
  const bits = fl ? [['requests_per_minute', 'RPM'], ['requests_per_day', 'RPD'], ['tokens_per_day', 'TPD']].filter(([k]) => Number.isInteger(fl[k])).map(([k, u]) => `${fl[k].toLocaleString('en-US')} ${u}`) : [];
  const text = bits.length ? escapeHtml(bits.join(' · ')) : 'as published on the provider page';
  return limitPages.has(c.slug) ? `<a href="${prefix}limits/${escapeHtml(c.slug)}/">${text}</a>` : text;
}

/** The main of /alternatives/<slug>/. `limitPages` = Set of slugs with a /limits/ page; `pageHero`: build.mjs's hero. */
export function alternativesPageMainHtml(orig, alts, { pageHero, prefix = '../../', limitPages = new Set(), families = [] }) {
  const yes = (v, y, n, c) => triStateHtml(v, y, n, c);
  const rows = alts.map((c) => `<tr>` +
    `<th scope="row" class="name"><a href="${prefix}p/${escapeHtml(c.slug)}">${escapeHtml(c.name)}</a></th>` +
    `<td>${limitsCell(c, prefix, limitPages)}</td>` +
    `<td>${yes(c.card_required, 'required', 'not required', fieldCheck(c, 'card_required'))}</td>` +
    `<td>${yes(c.phone_required, 'required', 'not required', fieldCheck(c, 'phone_required'))}</td>` +
    `<td>${yes(c.openai_compatible, 'yes', 'no', fieldCheck(c, 'openai_compatible'))}</td>` +
    `<td><time datetime="${escapeHtml(c.last_verified)}">${escapeHtml(c.last_verified)}</time></td>` +
    `<td class="notes">${escapeHtml(differenceLine(orig, c))}</td></tr>`).join('');
  const crumbs = `<a href="${prefix}">Home</a> / <a href="${prefix}alternatives/">Free alternatives</a> / ${escapeHtml(orig.name)}`;
  const origLinks = [`<a href="${prefix}p/${escapeHtml(orig.slug)}">${escapeHtml(orig.name)} provider page</a>`];
  if (limitPages.has(orig.slug)) origLinks.push(`<a href="${prefix}limits/${escapeHtml(orig.slug)}/">${escapeHtml(orig.name)} free tier limits</a>`);
  return pageHero({ crumbs, h1: `Free ${escapeHtml(orig.name)} alternatives`, lede: escapeHtml(alternativesCriteria(orig)) }) +
    `<main id="main"><div class="wrap prose prov-prose">` +
    `<h2 id="original">${escapeHtml(orig.name)} today</h2>` +
    `<p>${orig.free_tier ? escapeHtml(sentence(orig.free_tier)) + ' ' : ''}Verified <time datetime="${escapeHtml(orig.last_verified)}">${escapeHtml(orig.last_verified)}</time>. ` +
    `Credit card: ${escapeHtml(flagReasonWords(orig, 'card_required', 'required', 'not required'))}. Phone verification: ${escapeHtml(flagReasonWords(orig, 'phone_required', 'required', 'not required'))}.</p>` +
    `<div class="colls">${origLinks.join('')}</div>` +
    familyLinksHtml(orig, families, prefix) +
    `<h2 id="alternatives">${alts.length} alternatives</h2>` +
    // Seven columns: scrolls inside its own region on a phone, like the guides' tables.
    `<div class="table-scroll" role="region" aria-label="Free alternatives to ${escapeHtml(orig.name)}" tabindex="0">` +
    `<table class="alt-table"><caption>Free alternatives to ${escapeHtml(orig.name)}, closest first</caption>` +
    `<thead><tr><th scope="col">Provider</th><th scope="col">Limits</th><th scope="col">Credit card</th><th scope="col">Phone</th><th scope="col">OpenAI-compatible</th><th scope="col">Verified</th><th scope="col">How it differs from ${escapeHtml(orig.name)}</th></tr></thead>` +
    `<tbody>${rows}</tbody></table></div>` +
    `<p class="muted">Every value comes from the dataset; a flag nobody has confirmed reads as the reason recorded for it. Terms change without notice: confirm on each provider's page before you switch.</p>` +
    `<div class="colls"><a href="${prefix}alternatives/">Alternatives to other providers</a><a href="${prefix}compare/?compare=${escapeHtml([orig, ...alts.slice(0, 3)].map((c) => c.slug).join(','))}">Compare ${escapeHtml(orig.name)} with the first three</a></div>` +
    `</div></main>`;
}

export function alternativesPageJsonLd(orig, alts, { site }) {
  const url = `${site}/alternatives/${orig.slug}/`;
  return collectionPageJsonLd({
    site,
    name: `Free ${orig.name} alternatives`,
    url,
    description: alternativesCriteria(orig),
    crumbs: [['Free alternatives', `${site}/alternatives/`], [`Free ${orig.name} alternatives`, url]],
    items: alts.map((c) => ({ name: c.name, url: `${site}/p/${c.slug}` })),
  });
}

// ---------------------------------------------------------------- provider page block

/**
 * The "Hit the limit?" block of a provider page (§3.2 P1, §4.2): its own limits page and alternatives page when they
 * exist, and up to three qualifying alternatives. '' when there is nothing to link.
 */
export function providerLongtailHtml(p, providers, { asOf, prefix = '../', limitPages = new Set(), altPages = new Set() }) {
  const links = [];
  if (limitPages.has(p.slug)) links.push(`<a href="${prefix}limits/${escapeHtml(p.slug)}/">${escapeHtml(p.name)} free tier limits, with sources</a>`);
  if (altPages.has(p.slug)) links.push(`<a href="${prefix}alternatives/${escapeHtml(p.slug)}/">Free ${escapeHtml(p.name)} alternatives</a>`);
  const near = alternativesFor(p, providers, asOf).slice(0, 3);
  for (const c of near) links.push(`<a href="${prefix}p/${escapeHtml(c.slug)}">${escapeHtml(c.name)}</a>`);
  if (!links.length) return '';
  return `<h2 id="hit-the-limit">Hit the limit?</h2>` +
    (near.length ? `<p class="muted">Similar free tiers: same primary modality${p.openai_compatible === true ? ', OpenAI-compatible' : ''}, verified.</p>` : '') +
    `<div class="colls">${links.join('')}</div>`;
}
