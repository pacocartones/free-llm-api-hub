// free-limits.mjs — the structured free limits of a record (`free_limits`), by metric.
//
// A data module: no markup, no file access. long-guides.mjs re-exports it for its rankings; stale-claims-data.mjs reads it
// to resolve evidence, so the guard on data/stale-claims.json does not reach the guide renderers.

export const LIMIT_METRICS = [
  { key: 'requests_per_day', label: 'requests per day', head: 'Requests per day' },
  { key: 'requests_per_minute', label: 'requests per minute', head: 'Requests per minute' },
  { key: 'requests_per_second', label: 'requests per second', head: 'Requests per second' },
  { key: 'tokens_per_day', label: 'tokens per day', head: 'Tokens per day' },
  { key: 'tokens_per_minute', label: 'tokens per minute', head: 'Tokens per minute' },
  { key: 'requests_per_month', label: 'requests per month', head: 'Requests per month' },
  { key: 'tokens_per_month', label: 'tokens per month', head: 'Tokens per month' },
];
export const limitOf = (x, key) => (x.free_limits && Number.isFinite(x.free_limits[key]) ? x.free_limits[key] : null);

// Per-model limits (dataset 2.16.0), shared by the validator, the provider and model pages and /api/v1/models.json,
// so "which numbers apply to this model" has one answer.
//
// `free_limits` is one object per provider (its shape is fixed in API v1). Its top-level numbers apply to the whole
// free offer, narrowed only by `scope`. The optional `free_limits.per_model` (dataset 2.16.0) lists numbers the
// provider publishes for one model ID of its `models_free`: `{ model, <units>..., scope? }`. Those entries share the
// object's `source` and `checked`: one page, read on one day. A model with no entry of its own falls back to the
// provider-wide numbers, labelled as such; nothing is copied, estimated or converted between units.

/** The numeric units, in display order, with their human label. */
export const LIMIT_UNITS = Object.freeze([
  ['requests_per_second', 'requests per second'],
  ['requests_per_minute', 'requests per minute'],
  ['requests_per_day', 'requests per day'],
  ['requests_per_month', 'requests per month'],
  ['tokens_per_day', 'tokens per day'],
  ['tokens_per_month', 'tokens per month'],
]);
export const LIMIT_KEYS = Object.freeze(LIMIT_UNITS.map(([k]) => k));

/** The numbers of an object (the provider-wide `free_limits` or one `per_model` entry), in unit order. */
export function limitNumbers(obj) {
  const out = {};
  for (const k of LIMIT_KEYS) if (obj && Number.isInteger(obj[k]) && obj[k] >= 1) out[k] = obj[k];
  return out;
}

/** The `per_model` entries, or [] when there are none (or the field is malformed). */
export const perModelLimits = (p) => (p && p.free_limits && Array.isArray(p.free_limits.per_model) ? p.free_limits.per_model.filter((e) => e && typeof e === 'object') : []);

/**
 * The limits that apply to model `id` of provider `p`:
 *   { applies_to: 'model', limits, scope, source, checked }    - the provider publishes numbers for this exact ID
 *   { applies_to: 'provider', limits, scope, source, checked } - provider-wide numbers (no entry for this ID)
 *   { applies_to: 'none_published' }                           - free_limits is null: the provider publishes none
 *   { applies_to: 'not_recorded' }                             - nothing recorded for this ID
 * `id` must be the exact ID the provider lists; a different spelling of the same model never matches.
 */
export function limitsForModel(p, id) {
  if (p && p.free_limits === null) return { applies_to: 'none_published' };
  const fl = p && p.free_limits;
  if (!fl || typeof fl !== 'object') return { applies_to: 'not_recorded' };
  const own = perModelLimits(p).find((e) => e.model === id);
  const ownNumbers = own ? limitNumbers(own) : {};
  if (Object.keys(ownNumbers).length) {
    return { applies_to: 'model', limits: ownNumbers, scope: own.scope ?? null, source: fl.source, checked: fl.checked };
  }
  const wide = limitNumbers(fl);
  if (Object.keys(wide).length) return { applies_to: 'provider', limits: wide, scope: fl.scope ?? null, source: fl.source, checked: fl.checked };
  return { applies_to: 'not_recorded' };
}

/**
 * Validator rules for `free_limits.per_model` that JSON Schema cannot express. Returns error strings.
 * Each entry names an ID of the same provider's `models_free`, exactly as listed; an ID appears once; and each
 * entry carries at least one number.
 */
export function perModelLimitErrors(p) {
  const id = p && p.slug ? p.slug : '(unknown)';
  const fl = p && p.free_limits;
  if (!fl || typeof fl !== 'object' || fl.per_model === undefined) return [];
  if (!Array.isArray(fl.per_model) || fl.per_model.length === 0) return [`${id}: free_limits.per_model must be a non-empty array when present`];
  const errors = [];
  const listed = new Set(Array.isArray(p.models_free) ? p.models_free : []);
  const seen = new Set();
  for (const [i, e] of fl.per_model.entries()) {
    const where = `${id}: free_limits.per_model[${i}]`;
    if (!e || typeof e !== 'object') { errors.push(`${where} must be an object`); continue; }
    if (typeof e.model !== 'string' || !listed.has(e.model)) errors.push(`${where}.model "${e.model}" must be an ID of the provider's models_free, exactly as listed`);
    else if (seen.has(e.model)) errors.push(`${where}.model "${e.model}" appears more than once`);
    else seen.add(e.model);
    if (!Object.keys(limitNumbers(e)).length) errors.push(`${where} must carry at least one numeric limit (${LIMIT_KEYS.join(', ')})`);
  }
  return errors;
}
