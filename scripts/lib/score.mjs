// score.mjs — the FLLMAPIHUB score: how a provider's free access ranks, 0-100.
//
// Seventy points are mathematical, from six inputs that live in data/providers.json and
// data/probe-report.json; thirty are an editorial rating per provider (data/editorial.json).
// Every number that shapes the result is a named constant in this file, so the method is
// one place to read and to change.
//
//   quality       22  model_tier 0-4, the best free model's public preference rating
//   limits        18  free_limits: requests/day or tokens/day the provider publishes
//   friction      13  no card and no phone required
//   commercial     9  commercial use allowed
//   openai         4  OpenAI-compatible endpoint
//   stability      4  the latest live probe, when there is one
//   editorial     30  a rating 0-30 per provider; a provider without one gets 15
//
// Rules the code enforces (each has a test):
//  - Missing information scores zero or neutral (the middle, for the two yes/no requirements), never an estimate. A missing input also lowers
//    the confidence shown: the number of the six mathematical inputs that are confirmed.
//  - `partner` is never read here. Being a partner adds nothing to the score.
//  - Deterministic: the same data gives the same order; ties break by the mathematical score, then by name.
//  - Nothing here fixes a position. The ranking is computed from the data every time.
//  - The top 10 takes only verified, unexpired providers that offer text LLMs (is_text_llm).

import { SLA_DAYS, ageInDays } from './rules.mjs';

export const SCORE_WEIGHTS = Object.freeze({ quality: 22, limits: 18, friction: 13, commercial: 9, openai: 4, stability: 4 });
export const EDITORIAL_WEIGHT = 30;
export const EDITORIAL_DEFAULT = 15;
export const MATH_INPUTS = Object.freeze(Object.keys(SCORE_WEIGHTS));
export const TOP_SIZE = 10;

// Friction: a card costs more than a phone, as in the explorer's Recommended sort (3 against 2).
export const FRICTION_WEIGHTS = Object.freeze({ card: 3, phone: 2 });

// Limits are compared on a log scale between a floor (0 points) and a ceiling (full points).
// Provisional values chosen to separate today's published figures; they are the first thing
// to review. Only requests/day and tokens/day (or the monthly figure divided by 30) count:
// per-second and per-minute limits are a speed, not an allowance, and are not converted.
export const LIMITS_SCALE = Object.freeze({
  requests_per_day: { floor: 10, ceiling: 10_000 },
  tokens_per_day: { floor: 10_000, ceiling: 10_000_000 },
});

// A probe older than this says nothing about now.
export const STABILITY_WINDOW_DAYS = 30;

if (Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0) + EDITORIAL_WEIGHT !== 100) {
  throw new Error('score weights must add up to 100');
}

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const logScale = (value, { floor, ceiling }) => (value > 0 ? clamp01((Math.log10(value) - Math.log10(floor)) / (Math.log10(ceiling) - Math.log10(floor))) : 0);

// A tri-state requirement flag as -1 (confirmed requirement), 0 (unknown), +1 (confirmed none).
const noRequirement = (v) => (v === false ? 1 : v === true ? -1 : 0);
const mapSigned = (x) => (x + 1) / 2; // -1..1 -> 0..1; unknown sits in the middle, neither rewarded nor punished

/**
 * Each input as { frac, known }: frac is the fraction 0..1 of its weight, known says whether the data
 * confirms it. Quality, limits and stability score zero when unknown. The two tri-state requirements
 * (friction, commercial use) are symmetric around "unknown": a confirmed good answer adds, a confirmed
 * bad one subtracts, unknown sits in the middle and is neither rewarded nor punished.
 */
export function inputFractions(p, stability = null) {
  const frictionKnown = p.card_required != null || p.phone_required != null;
  const frictionSigned = (FRICTION_WEIGHTS.card * noRequirement(p.card_required) + FRICTION_WEIGHTS.phone * noRequirement(p.phone_required)) / (FRICTION_WEIGHTS.card + FRICTION_WEIGHTS.phone);
  const fl = p.free_limits;
  let limits = null;
  if (fl) {
    const rpd = fl.requests_per_day ?? (fl.requests_per_month != null ? fl.requests_per_month / 30 : null);
    const tpd = fl.tokens_per_day ?? (fl.tokens_per_month != null ? fl.tokens_per_month / 30 : null);
    const parts = [];
    if (rpd != null) parts.push(logScale(rpd, LIMITS_SCALE.requests_per_day));
    if (tpd != null) parts.push(logScale(tpd, LIMITS_SCALE.tokens_per_day));
    limits = parts.length ? Math.max(...parts) : null; // the allowance the provider states most generously
  }
  const known = (frac) => ({ frac: frac ?? 0, known: frac != null });
  return {
    quality: known(Number.isInteger(p.model_tier) ? clamp01(p.model_tier / 4) : null),
    limits: known(limits),
    friction: { frac: frictionKnown ? mapSigned(frictionSigned) : 0.5, known: frictionKnown },
    commercial: { frac: p.commercial_ok == null ? 0.5 : p.commercial_ok ? 1 : 0, known: p.commercial_ok != null },
    openai: { frac: p.openai_compatible === true ? 1 : 0, known: p.openai_compatible != null },
    stability: known(stability),
  };
}

/** The editorial rating of a provider: its entry in the public file, else the default. */
export function editorialRating(editorial, slug) {
  const r = editorial?.ratings?.[slug]?.score;
  return Number.isFinite(r) && r >= 0 && r <= EDITORIAL_WEIGHT ? r : EDITORIAL_DEFAULT;
}

/**
 * Stability from the latest probe report: 1 when a real inference call succeeded, 0.5 when only
 * the credentials were accepted, 0 when the probe failed, null when there is no usable probe
 * (no key, or older than the window). The repository keeps no probe history, so this is the
 * latest probe and not an uptime over 30 days.
 */
export function stabilityFromProbe(report, slug, now = new Date()) {
  if (!report || !Array.isArray(report.results)) return null;
  const age = ageInDays(report.probed_at, now);
  if (age == null || age < 0 || age > STABILITY_WINDOW_DAYS) return null;
  const r = report.results.find((x) => x.slug === slug);
  if (!r) return null;
  if (r.status === 'live') return 1;
  if (r.status === 'auth-ok') return 0.5;
  if (['auth-failed', 'tier-ended', 'rate-limited', 'error'].includes(r.status)) return 0;
  return null; // skipped-no-key and anything else: not measured
}

/** The score of one provider. Never reads `partner`. */
export function scoreProvider(p, { editorial = null, stability = null } = {}) {
  const f = inputFractions(p, stability);
  const parts = {};
  let math = 0;
  let confirmed = 0;
  for (const k of MATH_INPUTS) {
    if (f[k].known) confirmed += 1;
    parts[k] = f[k].frac * SCORE_WEIGHTS[k];
    math += parts[k];
  }
  const editorialPoints = editorialRating(editorial, p.slug);
  return { slug: p.slug, math, editorial: editorialPoints, total: math + editorialPoints, confirmed, of: MATH_INPUTS.length, parts };
}

/** Every violation in the public editorial file against the providers. Does not throw. */
export function editorialErrors(editorial, providers) {
  const errors = [];
  if (!editorial || typeof editorial !== 'object' || typeof editorial.ratings !== 'object' || editorial.ratings === null) {
    return ['data/editorial.json must have a ratings object'];
  }
  if (editorial.default !== EDITORIAL_DEFAULT) errors.push(`data/editorial.json default must be ${EDITORIAL_DEFAULT} (the constant in lib/score.mjs), got ${editorial.default}`);
  const slugs = new Set(providers.map((p) => p.slug));
  for (const [slug, r] of Object.entries(editorial.ratings)) {
    if (!slugs.has(slug)) errors.push(`data/editorial.json rates unknown provider "${slug}"`);
    if (!r || !Number.isFinite(r.score) || r.score < 0 || r.score > EDITORIAL_WEIGHT) errors.push(`data/editorial.json: ${slug} score must be a number from 0 to ${EDITORIAL_WEIGHT}`);
    if (r && r.note !== undefined && typeof r.note !== 'string') errors.push(`data/editorial.json: ${slug} note must be a string`);
  }
  return errors;
}

/** Verified and not past the freshness SLA. */
export function isEligible(p, now = new Date()) {
  if (p.verified !== true) return false;
  const age = ageInDays(p.last_verified, now);
  return age != null && age <= SLA_DAYS;
}

const byRank = (a, b) => b.total - a.total || b.math - a.math || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

/** Every eligible provider ranked, best first; each carries its score breakdown. */
export function rankProviders(providers, { editorial = null, probeReport = null, now = new Date() } = {}) {
  return providers
    .filter((p) => isEligible(p, now))
    .map((p) => ({ name: p.name, provider: p, ...scoreProvider(p, { editorial, stability: stabilityFromProbe(probeReport, p.slug, now) }) }))
    .sort(byRank);
}

/** The top 10: only providers that offer text LLMs. */
export function topProviders(providers, opts = {}) {
  return rankProviders(providers.filter((p) => p.is_text_llm === true), opts).slice(0, TOP_SIZE);
}
