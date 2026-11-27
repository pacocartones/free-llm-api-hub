// field-checks.mjs — why a tri-state flag holds its value (data/schema.json, field_checks).
//
// A null flag used to mean only "not confirmed". field_checks records, per flag, the official pages read, the day
// and what they said: `stated` (the page says it, so the flag is true, false or "conditional"), or one of three
// reasons a null stays null — `source_silent`, `needs_account`, `sources_disagree`. A flag with no entry is
// `not_checked`: derived here, never written in the data, and never "no".
import { hasHiddenChars } from './hidden-chars.mjs';
import { publicHttpsUrlError } from './public-fetch.mjs';

/** The four production flags every provider carries (counted on /coverage/ and /quality/). */
export const PRODUCTION_FLAG_FIELDS = Object.freeze(['phone_required', 'card_required', 'commercial_ok', 'openai_compatible']);
/**
 * The two terms flags (dataset 2.16.0): may one person hold several accounts, and may limits be got around. Optional on a
 * provider; when present they always carry a field_checks entry. null is never permission.
 */
export const TERMS_FLAG_FIELDS = Object.freeze(['multi_account_forbidden', 'limit_circumvention_forbidden']);
/** Every flag that may have a field_checks entry. */
export const FIELD_CHECK_FIELDS = Object.freeze([...PRODUCTION_FLAG_FIELDS, ...TERMS_FLAG_FIELDS]);
export const NULL_REASONS = Object.freeze(['source_silent', 'needs_account', 'sources_disagree']);
export const STATUSES = Object.freeze(['stated', ...NULL_REASONS]);
/** Every status a consumer can see for a flag: the recorded ones plus the derived not_checked. */
export const DERIVED_STATUSES = Object.freeze([...STATUSES, 'not_checked']);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The recorded check of one flag, or null. */
export function fieldCheck(p, field) {
  const fc = p && p.field_checks;
  return fc && typeof fc === 'object' && fc[field] && typeof fc[field] === 'object' ? fc[field] : null;
}

/** stated | source_silent | needs_account | sources_disagree | not_checked. */
export function fieldCheckStatus(p, field) {
  const c = fieldCheck(p, field);
  return c && STATUSES.includes(c.status) ? c.status : 'not_checked';
}

/** Plain words for a reason a flag stays null (also used by the site and llms-full.txt). */
export const REASON_LABEL = Object.freeze({
  source_silent: 'not stated by the provider',
  needs_account: 'needs an account to check',
  sources_disagree: 'provider pages disagree',
  not_checked: 'not confirmed',
});

/** The validator rules of field_checks for one provider. @returns {string[]} */
export function fieldCheckErrors(p, { today }) {
  const errors = [];
  const id = p.slug || p.name || '(unknown)';
  if (p.field_checks == null) return errors;
  for (const [field, c] of Object.entries(p.field_checks)) {
    const where = `${id}: field_checks.${field}`;
    if (!FIELD_CHECK_FIELDS.includes(field) || !c || typeof c !== 'object') { errors.push(`${where} is not a tri-state flag`); continue; }
    const value = p[field];
    if (c.status === 'stated') {
      if (value === null || value === undefined) errors.push(`${where}: ${field} is null, so its check cannot be stated (use source_silent, needs_account or sources_disagree)`);
    } else if (NULL_REASONS.includes(c.status)) {
      if (value !== null) errors.push(`${where}: ${field} is ${JSON.stringify(value)}, so its check must be stated (${c.status} goes with null)`);
      if (c.quote != null) errors.push(`${where}: a quote goes with stated only; say what the pages say in the note`);
    }
    if (c.status === 'sources_disagree') {
      if (!Array.isArray(c.sources) || c.sources.length < 2) errors.push(`${where}: sources_disagree needs the two pages that disagree in sources`);
      if (c.note == null) errors.push(`${where}: sources_disagree needs a note saying what each page says`);
    }
    if (!DATE_RE.test(c.checked || '') || c.checked > today) errors.push(`${where}.checked must be a date not after today in UTC (${today})`);
    for (const s of Array.isArray(c.sources) ? c.sources : []) {
      if (publicHttpsUrlError(s)) errors.push(`${where}.sources: ${JSON.stringify(String(s).slice(0, 80))} must be the provider's public HTTPS page`);
      else if (hasHiddenChars(s)) errors.push(`${where}.sources must not contain control, bidirectional or zero-width characters`);
    }
    for (const [k, max] of [['quote', 400], ['note', 300]]) {
      if (c[k] == null) continue;
      if (typeof c[k] !== 'string' || !c[k].trim() || c[k].length > max) errors.push(`${where}.${k} must be text of 1 to ${max} characters`);
      else if (hasHiddenChars(c[k])) errors.push(`${where}.${k} must not contain control, bidirectional or zero-width characters`);
    }
    // The provider's own words go in quote (registered in data/quotes.json); a note is ours, so it carries no « » passage.
    if (typeof c.note === 'string' && /[«»]/.test(c.note)) errors.push(`${where}.note must not put passages between « »: the provider's sentence goes in quote`);
  }
  return errors;
}

/**
 * The receipts rule: a flag that holds a value (true, false or "conditional") carries the provider's own sentence — a
 * `stated` check with its `quote` (registered in data/quotes.json, checked by scripts/lib/quotes.mjs). A value that no
 * official sentence supports goes back to null with the reason (source_silent, needs_account or sources_disagree).
 *
 * UNSOURCED_ALLOWLIST holds the few exceptions that could not be fixed yet, each time-boxed: { slug, field, until, reason }.
 * An entry past its `until` day fails, and so does an entry that is no longer needed, so the list only shrinks.
 */
export const UNSOURCED_ALLOWLIST = Object.freeze([
  // Official pages that state the value but render it only with JavaScript, so quotes:add reads an empty shell.
  { slug: 'google-gemini', field: 'commercial_ok', until: '2026-12-31', reason: 'ai.google.dev/gemini-api/terms renders only with JavaScript' },
  { slug: 'google-gemini', field: 'openai_compatible', until: '2026-12-31', reason: 'ai.google.dev/gemini-api/docs/openai renders only with JavaScript' },
  { slug: 'ai-horde', field: 'commercial_ok', until: '2026-12-31', reason: 'the aihorde.net FAQ answers render only with JavaScript' },
  { slug: 'pollinations', field: 'commercial_ok', until: '2026-12-31', reason: 'pollinations.ai/terms renders only with JavaScript' },
  { slug: 'tencent-hunyuan', field: 'phone_required', until: '2026-12-31', reason: 'the cloud.tencent.com sign-up guide renders only with JavaScript' },
  // Official pages that answer HTTP 403 to clients that are not browsers.
  { slug: 'nlpcloud', field: 'card_required', until: '2026-12-31', reason: 'nlpcloud.com answers HTTP 403 to non-browser clients' },
  { slug: 'nlpcloud', field: 'commercial_ok', until: '2026-12-31', reason: 'nlpcloud.com answers HTTP 403 to non-browser clients' },
  { slug: 'sambanova', field: 'openai_compatible', until: '2026-12-31', reason: 'docs.sambanova.ai answers HTTP 403 to non-browser clients' },
]);

/** True when the flag holds a value and has a stated check with a quote. */
export function hasReceipt(p, field) {
  const c = fieldCheck(p, field);
  return !!c && c.status === 'stated' && typeof c.quote === 'string' && c.quote.trim() !== '';
}

/** The receipts rule for one provider. @returns {string[]} */
export function unsourcedFlagErrors(p, { today, allowlist = UNSOURCED_ALLOWLIST }) {
  const errors = [];
  const id = p.slug || p.name || '(unknown)';
  for (const field of FIELD_CHECK_FIELDS) {
    const value = p[field];
    if (value === null || value === undefined || hasReceipt(p, field)) continue;
    const allowed = allowlist.find((a) => a.slug === p.slug && a.field === field);
    if (allowed && DATE_RE.test(allowed.until || '') && allowed.until >= today) continue;
    errors.push(allowed
      ? `${id}: ${field} is on the unsourced allowlist until ${allowed.until}, which has passed: record the provider's sentence or set it to null with the reason`
      : `${id}: ${field} is ${JSON.stringify(value)} with no provider sentence: record a stated field_checks.${field} with its quote (npm run quotes:add -- ${id} --field ${field}), or set ${field} to null with the reason (source_silent, needs_account or sources_disagree)`);
  }
  return errors;
}

/** The allowlist itself: well-formed, time-boxed and still needed. @returns {string[]} */
export function unsourcedAllowlistErrors(providers, { allowlist = UNSOURCED_ALLOWLIST } = {}) {
  const errors = [];
  const seen = new Set();
  for (const a of allowlist) {
    const where = `UNSOURCED_ALLOWLIST ${a && a.slug}.${a && a.field}`;
    if (!a || !FIELD_CHECK_FIELDS.includes(a.field) || typeof a.slug !== 'string') { errors.push(`${where}: an entry names a provider slug and one of ${FIELD_CHECK_FIELDS.join(', ')}`); continue; }
    if (!DATE_RE.test(a.until || '')) errors.push(`${where}: until must be a date (YYYY-MM-DD)`);
    if (typeof a.reason !== 'string' || !a.reason.trim()) errors.push(`${where}: an entry says why the flag could not be sourced`);
    if (seen.has(`${a.slug}.${a.field}`)) errors.push(`${where}: listed twice`);
    seen.add(`${a.slug}.${a.field}`);
    const p = providers.find((x) => x.slug === a.slug);
    if (!p) errors.push(`${where}: no provider has that slug`);
    else if (p[a.field] === null || p[a.field] === undefined || hasReceipt(p, a.field)) errors.push(`${where}: the flag is null or sourced now, so remove the entry`);
  }
  return errors;
}

/**
 * Counts by status of one flag over a population: { stated, source_silent, needs_account, sources_disagree,
 * not_checked, unsourced } where unsourced = a non-null value with no stated check.
 */
export function fieldCheckCounts(providers, field) {
  const out = Object.fromEntries(DERIVED_STATUSES.map((s) => [s, 0]));
  out.unsourced = 0;
  for (const p of providers) {
    const status = fieldCheckStatus(p, field);
    if (p[field] === null || p[field] === undefined) {
      out[status === 'stated' ? 'not_checked' : status] += 1;
    } else {
      out.stated += status === 'stated' ? 1 : 0;
      out.unsourced += status === 'stated' ? 0 : 1;
    }
  }
  return out;
}
