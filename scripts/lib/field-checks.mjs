// field-checks.mjs — why a tri-state flag holds its value (data/schema.json, field_checks).
//
// A null flag reads "not stated" (not-stated.mjs). field_checks records, per flag, the official pages read, the day
// and what they said: `stated` (the page says it, so the flag is true, false or "conditional"), or one of three
// reasons a null stays null — `source_silent`, `needs_account`, `sources_disagree`. A flag with no entry is
// `not_checked`: derived here, never written in the data, and never "no".
import { hasHiddenChars } from './hidden-chars.mjs';
import { NOT_STATED } from './not-stated.mjs';
import { publicHttpsUrlError } from './public-fetch.mjs';

export const FIELD_CHECK_FIELDS = Object.freeze(['phone_required', 'card_required', 'commercial_ok', 'openai_compatible']);
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

/**
 * The words for a flag that stays null, by status: always "not stated", with the reason when one is recorded. The one
 * table for every page, the flags (flags.mjs), the compare table, llms-full.txt and the .md mirrors.
 */
export const REASON_LABEL = Object.freeze({
  source_silent: `${NOT_STATED} in the provider's docs`,
  needs_account: `${NOT_STATED}: needs an account to check`,
  sources_disagree: `${NOT_STATED}: the provider's pages disagree`,
  not_checked: NOT_STATED,
});

/** The reason alone, for a cell that already says "not stated" ('' when no reason is recorded). */
export const REASON_WHY = Object.freeze({
  source_silent: "the provider's docs do not say",
  needs_account: 'needs an account to check',
  sources_disagree: "the provider's pages disagree",
  not_checked: '',
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
