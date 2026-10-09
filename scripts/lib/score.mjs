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
//   stability      4  the share of successful probes over a real 30-day series (null until one exists)
//   editorial     30  a rating 0-30 per provider; a provider without one gets 15
//
// Rules the code enforces (each has a test):
//  - Missing information scores zero or neutral (the middle, for the two yes/no requirements), never an estimate. A missing input also lowers
//    the confidence shown: the number of the six mathematical inputs that are confirmed.
//  - `partner` is never read here. Being a partner adds nothing to the score.
//  - Deterministic: the same data gives the same order; ties break by the mathematical score, then by name.
//  - Nothing here fixes a position. The ranking is computed from the data every time.
//  - The top takes only verified, unexpired providers that offer text LLMs (is_text_llm), and only those with at
//    least MIN_CONFIRMED of the six mathematical inputs confirmed. It holds up to ten: it is never padded.
//  - The editorial rating cannot move a provider further from the default than its confirmed inputs allow:
//    |rating - 15| <= 15 * confirmed / 6. The engine clips; it never lets the editorial part outweigh the data.
//  - A tier near a threshold keeps its score (nothing is downgraded); the flag is returned for the page to show.
//  - Stability stays unmeasured (null for everyone) until a probe series of at least 30 days exists.

import { SLA_DAYS, ageInDays } from './rules.mjs';

export const SCORE_WEIGHTS = Object.freeze({ quality: 22, limits: 18, friction: 13, commercial: 9, openai: 4, stability: 4 });
export const EDITORIAL_WEIGHT = 30;
export const EDITORIAL_DEFAULT = 15;
export const MATH_INPUTS = Object.freeze(Object.keys(SCORE_WEIGHTS));
export const TOP_SIZE = 10; // the most the top can hold
export const MIN_CONFIRMED = 4; // of the six mathematical inputs, to enter the ranking and the top
// The editorial deviation from the default is capped by how much of the data is confirmed.
export const EDITORIAL_CAP_BASE = 15;
// Above this deviation a public note is mandatory (checked in editorialErrors).
export const EDITORIAL_NOTE_THRESHOLD = 5;

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

// Stability needs a real series: probes spanning at least this many days and at least this many samples.
// The repository keeps no probe history yet, so stability is null for every provider until it does.
export const STABILITY_MIN_DAYS = 30;
export const STABILITY_MIN_SAMPLES = 12;

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
  const frictionAny = p.card_required != null || p.phone_required != null;
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
    // Friction is one requirement with two parts, and a part that is known already informs: it counts as confirmed
    // when at least one of card_required and phone_required is known (the Owner's reading); the unknown part scores neutral.
    friction: { frac: frictionAny ? mapSigned(frictionSigned) : 0.5, known: frictionAny },
    commercial: { frac: p.commercial_ok == null ? 0.5 : p.commercial_ok ? 1 : 0, known: p.commercial_ok != null },
    openai: { frac: p.openai_compatible === true ? 1 : 0, known: p.openai_compatible != null },
    stability: known(stability),
  };
}

/** The most the editorial rating may move away from the default, given how many inputs are confirmed. */
export const editorialCap = (confirmed) => (EDITORIAL_CAP_BASE * Math.min(MATH_INPUTS.length, Math.max(0, confirmed))) / MATH_INPUTS.length;

/** The editorial rating of a provider: its entry in the public file, else the default. */
export function editorialRating(editorial, slug) {
  const r = editorial?.ratings?.[slug]?.score;
  return Number.isFinite(r) && r >= 0 && r <= EDITORIAL_WEIGHT ? r : EDITORIAL_DEFAULT;
}

/**
 * Stability as the share of successful probes over a real series: report.history is a list of
 * { date, slug, status }. It needs samples spanning at least STABILITY_MIN_DAYS days and at least
 * STABILITY_MIN_SAMPLES of them for that provider, counted over the last STABILITY_MIN_DAYS days;
 * otherwise null (not measured). A `live` probe counts 1, `auth-ok` 0.5, a failed one 0; probes that
 * were skipped for lack of a key are not samples. A single probe report is not a series and gives null.
 */
export function stabilityFromProbe(report, slug, now = new Date()) {
  const hist = report && Array.isArray(report.history) ? report.history : null;
  if (!hist) return null;
  const value = { live: 1, 'auth-ok': 0.5, 'auth-failed': 0, 'tier-ended': 0, 'rate-limited': 0, error: 0 };
  const samples = hist
    .filter((h) => h && h.slug === slug && h.status in value)
    .map((h) => ({ age: ageInDays(h.date, now), v: value[h.status] }))
    .filter((h) => h.age != null && h.age >= 0 && h.age <= STABILITY_MIN_DAYS);
  if (samples.length < STABILITY_MIN_SAMPLES) return null;
  const span = Math.max(...samples.map((h) => h.age)) - Math.min(...samples.map((h) => h.age));
  if (span < STABILITY_MIN_DAYS - 1) return null;
  return samples.reduce((a, h) => a + h.v, 0) / samples.length;
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
  const asked = editorialRating(editorial, p.slug);
  const cap = editorialCap(confirmed);
  const editorialPoints = EDITORIAL_DEFAULT + Math.max(-cap, Math.min(cap, asked - EDITORIAL_DEFAULT));
  return {
    slug: p.slug, math, editorial: editorialPoints, editorialAsked: asked, editorialClipped: editorialPoints !== asked,
    total: math + editorialPoints, confirmed, of: MATH_INPUTS.length, parts,
    boundary: p.model_tier_source?.boundary === true, // the tier is near a threshold: shown, never penalised
  };
}

/** Every violation in the public editorial file against the providers. Does not throw. */
export function editorialErrors(editorial, providers) {
  const errors = [];
  if (!editorial || typeof editorial !== 'object' || typeof editorial.ratings !== 'object' || editorial.ratings === null || Array.isArray(editorial.ratings)) {
    return ['data/editorial.json must have a ratings object'];
  }
  if (editorial.default !== EDITORIAL_DEFAULT) errors.push(`data/editorial.json default must be ${EDITORIAL_DEFAULT} (the constant in lib/score.mjs), got ${editorial.default}`);
  const slugs = new Set(providers.map((p) => p.slug));
  for (const [slug, r] of Object.entries(editorial.ratings)) {
    if (!slugs.has(slug)) errors.push(`data/editorial.json rates unknown provider "${slug}"`);
    if (!r || !Number.isFinite(r.score) || r.score < 0 || r.score > EDITORIAL_WEIGHT) errors.push(`data/editorial.json: ${slug} score must be a number from 0 to ${EDITORIAL_WEIGHT}`);
    if (r && r.note !== undefined && typeof r.note !== 'string') errors.push(`data/editorial.json: ${slug} note must be a string`);
    if (r && Number.isFinite(r.score) && Math.abs(r.score - EDITORIAL_DEFAULT) > EDITORIAL_NOTE_THRESHOLD && !(typeof r.note === 'string' && r.note.trim().length > 0)) {
      errors.push(`data/editorial.json: ${slug} deviates ${Math.abs(r.score - EDITORIAL_DEFAULT)} points from the default of ${EDITORIAL_DEFAULT}; a public note is mandatory above ${EDITORIAL_NOTE_THRESHOLD}`);
    }
  }
  return errors;
}

/** Verified and not past the freshness SLA. */
export function isEligible(p, now = new Date()) {
  if (p.verified !== true) return false;
  const age = ageInDays(p.last_verified, now);
  return age != null && age >= 0 && age <= SLA_DAYS; // a verification date in the future is not a verification
}

const byRank = (a, b) => b.total - a.total || b.math - a.math || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

/**
 * Every eligible provider that meets the minimum of confirmed inputs, ranked best first, each with its
 * score breakdown. minConfirmed = 0 lists every eligible provider (for review).
 */
export function rankProviders(providers, { editorial = null, probeReport = null, now = new Date(), minConfirmed = MIN_CONFIRMED } = {}) {
  return providers
    .filter((p) => isEligible(p, now))
    .map((p) => ({ name: p.name, provider: p, ...scoreProvider(p, { editorial, stability: stabilityFromProbe(probeReport, p.slug, now) }) }))
    .filter((r) => r.confirmed >= minConfirmed)
    .sort(byRank);
}

/** The top: up to ten text-LLM providers that meet the minimum. It is not padded to ten. */
export function topProviders(providers, opts = {}) {
  return rankProviders(providers.filter((p) => p.is_text_llm === true), opts).slice(0, TOP_SIZE);
}
