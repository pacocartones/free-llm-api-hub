// release-stamp.mjs — the dataset's release stamp (`generated` in data/providers.json) and the public data date.
//
// `generated` in data/providers.json is the day of the dataset release: it moves only together with `version`
// (RELEASING.md, `npm run release:prepare`). A data pull request leaves it alone. It used to be bumped by every
// data pull request, which put that one line in conflict between any two open data pull requests.
//
// Consumers keep the meaning documented in docs/api.md: every public `generated` (the /api/v1 envelopes, the CSV
// column `dataset_generated`, providers.json on the site, llms.txt, sitemap lastmod, "Data of …") is "the date of
// the last dataset change". The build derives it with `datasetAsOf`: the newest of the release stamp and every date
// recorded on a provider. It is computed from the committed data only, never from the clock.

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Today's day in UTC, YYYY-MM-DD. `override` (VALIDATE_TODAY in the tests) fixes it. */
export const utcToday = (override) => override || new Date().toISOString().slice(0, 10);

/** Every date a data change writes on a provider: verification, addition, the checked days of its sourced facts, probes. */
const providerDates = (p) => [
  p.last_verified, p.added, p.last_probed,
  p.data_policy?.checked, p.free_limits?.checked, p.no_expiry?.checked, p.anonymous_access?.checked,
];

/** The newest date recorded on the providers, or null when none is dated. */
export function newestProviderDate(data) {
  return (data?.providers ?? [])
    .flatMap(providerDates)
    .filter((d) => typeof d === 'string' && DATE_RE.test(d))
    .sort()
    .pop() ?? null;
}

/** The public date of the data ("last dataset change"): the newest of the release stamp and every provider date. */
export function datasetAsOf(data) {
  const newest = newestProviderDate(data);
  return newest && newest > data.generated ? newest : data.generated;
}

/**
 * The stamp rule between a base revision of data/providers.json and the head one. Returns a list of errors.
 * - Same `version`: `generated` must not change (a data change is not a release).
 * - New `version` (a release): `generated` must cover every provider date and must not go backwards.
 * The "not after today" rule lives in validate.mjs, which runs on every revision.
 */
export function releaseStampErrors(base, head) {
  if (!base || !head) return [];
  const errors = [];
  if (base.version === head.version) {
    if (head.generated !== base.generated) {
      errors.push(`top-level: generated changed from ${base.generated} to ${head.generated} without a release. ` +
        `Leave "generated": "${base.generated}" as it is: it is the release date and moves only with "version" ` +
        '(npm run release:prepare, see RELEASING.md). Your dates go in last_verified, added and checked.');
    }
    return errors;
  }
  const newest = newestProviderDate(head);
  if (newest && head.generated < newest) {
    errors.push(`top-level: release ${head.version} has generated ${head.generated}, older than the newest date in the data (${newest}); ` +
      'set it to the release day (npm run release:prepare)');
  }
  if (DATE_RE.test(base.generated || '') && head.generated < base.generated) {
    errors.push(`top-level: release ${head.version} moves generated back from ${base.generated} to ${head.generated}`);
  }
  return errors;
}
