// provider-dates.mjs — the day a provider page last changed in substance, for its WebPage `dateModified`.
//
// `last_verified` is the day the whole record was re-read, but single facts are re-read in between (a field check on
// the card flag, a new data-policy reading, refreshed free limits). The page's dateModified is the newest of those
// days, so a search engine sees the page as current when one of its facts was just checked. Every date comes from the
// record; nothing is set to the build day.

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isIso = (d) => typeof d === 'string' && ISO.test(d);

/** Every day a fact of the provider was read: last_verified and each dated sub-record. */
export function providerFactDates(p) {
  return [
    p.last_verified, p.free_limits?.checked, p.data_policy?.checked, p.no_expiry?.checked, p.anonymous_access?.checked,
    ...Object.values(p.field_checks && typeof p.field_checks === 'object' ? p.field_checks : {}).map((c) => c?.checked),
    ...(Array.isArray(p.published_speed) ? p.published_speed.map((e) => e?.checked) : []),
  ].filter(isIso);
}

/** The newest day a fact of the provider was read (YYYY-MM-DD), or null when none is recorded. */
export function providerDateModified(p) {
  return providerFactDates(p).sort().pop() ?? null;
}
