// best.mjs — integrity rules for the editorial ranking (data/best.json).
//
// The /best page, the README top-20 and /api/v1/best.json all claim every pick
// is a verified provider with editorial copy (why + tag). build.mjs used to
// check only that slugs resolve and are unique, so an unverified (or copy-empty)
// pick would silently ship as "best" — a credibility bug. This is the one place
// those rules live: the validator, the build, and the test suite all call them.

/**
 * Return every integrity violation in `best` against `providers`.
 * Does not throw — validate.mjs wants the full list; assertBestPicks throws.
 */
export function bestPickErrors(best, providers) {
  const errors = [];
  const entries = best && best.entries;
  if (!Array.isArray(entries) || entries.length === 0) {
    errors.push('data/best.json must contain a non-empty entries array');
    return errors;
  }

  const bySlug = new Map((providers ?? []).map((p) => [p.slug, p]));
  const seen = new Set();
  entries.forEach((e, i) => {
    const n = i + 1;
    if (!e || !e.slug) {
      errors.push(`data/best.json entry #${n} is missing a slug`);
      return;
    }
    const id = e.slug;
    if (seen.has(id)) errors.push(`data/best.json lists ${id} more than once — a provider can only rank once`);
    seen.add(id);

    const why = typeof e.why === 'string' ? e.why.trim() : '';
    const tag = typeof e.tag === 'string' ? e.tag.trim() : '';
    if (!why) errors.push(`data/best.json entry ${id} is missing its editorial "why"`);
    if (!tag) errors.push(`data/best.json entry ${id} is missing its editorial "tag"`);

    const p = bySlug.get(id);
    if (!p) {
      errors.push(`data/best.json entry #${n} references unknown slug: ${id}`);
      return;
    }
    if (p.verified !== true) {
      errors.push(`data/best.json pick ${id} is not verified — editorial ranking cannot promote an unverified provider`);
    }
  });
  return errors;
}

/** Throw on the first integrity violation. Used by the build. */
export function assertBestPicks(best, providers) {
  const errors = bestPickErrors(best, providers);
  if (errors.length) throw new Error(errors[0]);
}

/** Validate, then return [{ rank, ...entry, p }] in rank order. */
export function resolveBestEntries(best, providers) {
  assertBestPicks(best, providers);
  const bySlug = new Map(providers.map((p) => [p.slug, p]));
  return best.entries.map((e, i) => ({ rank: i + 1, ...e, p: bySlug.get(e.slug) }));
}
