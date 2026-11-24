// release-stamp.mjs — the dataset's release stamp (`generated`) and the date the build measures ages from.
//
// `generated` in data/providers.json is the day of the dataset release: it moves only together with `version`
// (RELEASING.md, `npm run release:prepare`). A data pull request leaves it alone. It used to be bumped by every
// data pull request, which made that one line — and every derived line that prints it (CITATION.cff, the CSV
// column, sitemap lastmod, "Data of …") — conflict between any two open data pull requests.
//
// The build still needs a reference day that is never older than the data it ranks (a verification after the
// reference day would read as "in the future" and drop the provider from /best). That day is `datasetAsOf`:
// the newest of `generated` and every provider's last_verified/added. It is derived, never stored.

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Today's day in UTC, YYYY-MM-DD. `override` (VALIDATE_TODAY in the tests) fixes it. */
export const utcToday = (override) => override || new Date().toISOString().slice(0, 10);

/** The newest last_verified/added of the providers, or null when none is dated. */
export function newestProviderDate(data) {
  return (data?.providers ?? [])
    .flatMap((p) => [p.last_verified, p.added])
    .filter((d) => typeof d === 'string' && DATE_RE.test(d))
    .sort()
    .pop() ?? null;
}

/** The reference day of a build: the newest of the release stamp and the provider dates. */
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
    errors.push(`top-level: release ${head.version} has generated ${head.generated}, older than the newest last_verified/added (${newest}); ` +
      'set it to the release day (npm run release:prepare)');
  }
  if (DATE_RE.test(base.generated || '') && head.generated < base.generated) {
    errors.push(`top-level: release ${head.version} moves generated back from ${base.generated} to ${head.generated}`);
  }
  return errors;
}
