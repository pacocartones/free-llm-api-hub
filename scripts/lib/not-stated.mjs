// not-stated.mjs — the one wording for a value the dataset does not hold.
//
// null (or absent, or empty) means the provider's pages do not say it, or nobody has recorded it yet. It never
// means "no" or "0". Every page, the README, llms.txt and the .md mirrors show it as "not stated"; JSON keeps null
// and the machine reasons of field_checks (`source_silent`, `needs_account`, `sources_disagree`) stay as they are.
// A reason, when one is recorded, follows the words: "not stated in the provider's docs (checked 24 Nov 2026)".
//
// "—" is kept only for a cell that does not apply (no count to show), never for a missing value.

export const NOT_STATED = 'not stated';

/** HTML for a missing value: the words, in the muted "unknown" style (never colour alone). */
export const NOT_STATED_HTML = `<span class="tri tri-unk">${NOT_STATED}</span>`;

/** True when the dataset holds nothing for this value: null, undefined, '' (after trimming) or []. */
export const isUnstated = (v) => v === null || v === undefined || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length);

/** "not stated…" → "Not stated…", for the start of a cell or a sentence. */
export const capFirst = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

/** The value, or "not stated" when it is missing. */
export const orNotStated = (v) => (isUnstated(v) ? NOT_STATED : v);
