// Retired site URLs (data/redirects.json) and the stub pages build.mjs writes for them.
//
// GitHub Pages has no server-side redirects, so a retired provider or compare page that search engines still
// know becomes a small noindex page with a meta refresh and a canonical link to its new home. The build regenerates
// site/p/ and site/compare/ from scratch, so these stubs are the only thing left at the old URLs.
//
// redirectErrors() is the whole contract, run by the build (fail fast) and by redirects.test.mjs:
//   - a source is a site path under /p/<slug> or /compare/<a>-vs-<b>/ that the build does NOT also make a real
//     page for (a provider back in the dataset, or a pair that has a static page again, must leave this file);
//   - a target is a page the build makes: /, /compare/, /compare/?compare=<listed slugs>, /compare/<pair>/,
//     /p/<listed slug> or /not-free/#<id of an entry or group in data/not-free.json>.

const SLUG = '[a-z0-9][a-z0-9-]*';
const PROVIDER_SOURCE = new RegExp(`^/p/(${SLUG})$`);
const PAIR_SOURCE = new RegExp(`^/compare/(${SLUG}-vs-${SLUG})/$`);

/** The file under site/ that serves a source path: /p/x is p/x.html (Pages serves it extensionless), /a/b/ is a/b/index.html. */
export const redirectFile = (from) => (from.endsWith('/') ? `${from.slice(1)}index.html` : `${from.slice(1)}.html`);

/** The redirects as [from, to] pairs, sorted for a stable build. */
export const redirectEntries = (doc) => Object.entries(doc?.redirects || {}).sort(([a], [b]) => a.localeCompare(b, 'en'));

/**
 * Every problem with the redirect map, as readable lines (empty when it is valid).
 * providerSlugs: slugs with a /p/ page; comparePaths: <a>-vs-<b> paths with a static page; notFree: data/not-free.json.
 */
export function redirectErrors(doc, { providerSlugs, comparePaths, notFree }) {
  const errs = [];
  if (!doc || typeof doc.redirects !== 'object' || Array.isArray(doc.redirects)) return ['redirects must be an object of "from": "to"'];
  const slugs = new Set(providerSlugs);
  const pairs = new Set(comparePaths);
  const anchors = new Set([...(notFree?.entries || []), ...(notFree?.groups || [])].map((e) => e.id).filter(Boolean));
  const targetOk = (to) => {
    if (to === '/' || to === '/compare/') return true;
    let m = to.match(new RegExp(`^/compare/\\?compare=(${SLUG}(?:,${SLUG})+)$`));
    if (m) { const list = m[1].split(','); return list.length <= 4 && new Set(list).size === list.length && list.every((s) => slugs.has(s)); }
    if ((m = to.match(PAIR_SOURCE))) return pairs.has(m[1]);
    if ((m = to.match(PROVIDER_SOURCE))) return slugs.has(m[1]);
    if ((m = to.match(/^\/not-free\/#([a-z0-9-]+)$/))) return anchors.has(m[1]);
    return false;
  };
  for (const [from, to] of redirectEntries(doc)) {
    let m;
    if ((m = from.match(PROVIDER_SOURCE))) {
      if (slugs.has(m[1])) errs.push(`${from}: ${m[1]} is in data/providers.json again, so its page is built; remove the redirect`);
    } else if ((m = from.match(PAIR_SOURCE))) {
      if (pairs.has(m[1])) errs.push(`${from}: this pair has a static compare page again; remove the redirect`);
    } else {
      errs.push(`${from}: a source must be /p/<slug> or /compare/<a>-vs-<b>/`);
    }
    if (typeof to !== 'string' || !targetOk(to)) errs.push(`${from} → ${to}: the target is not a page the build makes`);
    if (typeof to === 'string' && to === from) errs.push(`${from}: redirects to itself`);
  }
  return errs;
}

/** The files under site/ that are redirect stubs, not pages (tests that walk the built pages skip them). */
export const redirectStubFiles = (doc) => new Set(redirectEntries(doc).map(([from]) => redirectFile(from)));
