// indexnow.mjs — which URLs a deploy adds or changes, and the IndexNow request that announces them.
//
// IndexNow (https://www.indexnow.org) lets a site tell Bing, Yandex and the other participating engines that a
// URL changed, instead of waiting for a crawl. The deploy workflow (pages.yml) calls scripts/indexnow.mjs twice:
// before the deploy it compares the sitemaps it is about to publish with the ones still live, and after the deploy
// is verified it sends the difference. These functions are the pure part, tested in scripts/indexnow.test.mjs.
//
// The key is public by design: the protocol proves ownership by serving it at the site root
// (site/<key>.txt, whose whole content is the key). It authorises nothing but these pings.

export const INDEXNOW_KEY = '96087c6012c181da7cf7f9dcc88f9996';
export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
export const SITE = 'https://freellmapihub.com';
export const SITEMAPS = ['sitemap.xml', 'sitemap-state.xml'];
// One deploy rarely changes more than a few dozen pages; a data-wide change (a release) touches every provider page.
// The protocol accepts 10,000 URLs per request, but a modest cap keeps one run from re-announcing the whole site.
export const URL_CAP = 100;

const xmlUnesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** The <url> entries of a sitemap, as a Map of loc to lastmod ('' when the entry has none). */
export function parseSitemap(xml) {
  const out = new Map();
  for (const m of String(xml || '').matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = /<loc>\s*([^<]+?)\s*<\/loc>/.exec(m[1]);
    if (!loc) continue;
    const lastmod = /<lastmod>\s*([^<]+?)\s*<\/lastmod>/.exec(m[1]);
    out.set(xmlUnesc(loc[1]), lastmod ? lastmod[1] : '');
  }
  return out;
}

/** Only https URLs on the site's own host can be announced with its key. */
export const ownUrl = (url, site = SITE) => {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.host === new URL(site).host;
  } catch { return false; }
};

/**
 * URLs that are new in `next` or whose lastmod differs from `prev` (both Maps from parseSitemap).
 * Newest lastmod first, then by URL, so a capped list keeps the most recent changes. Removed URLs are not sent:
 * the engines learn about a removal from the 404 when they next fetch it.
 */
export function changedUrls(prev, next, { cap = URL_CAP, site = SITE } = {}) {
  const changed = [];
  for (const [loc, lastmod] of next) {
    if (!ownUrl(loc, site)) continue;
    if (!prev.has(loc) || prev.get(loc) !== lastmod) changed.push([loc, lastmod]);
  }
  changed.sort((a, b) => (a[1] === b[1] ? (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0) : (a[1] < b[1] ? 1 : -1)));
  return { urls: changed.slice(0, cap).map(([loc]) => loc), total: changed.length, truncated: changed.length > cap };
}

/** The JSON body of an IndexNow submission. */
export function indexNowBody(urls, { key = INDEXNOW_KEY, site = SITE } = {}) {
  return { host: new URL(site).host, key, keyLocation: `${site}/${key}.txt`, urlList: urls.filter((u) => ownUrl(u, site)) };
}

/** What an IndexNow response status means, for the log (https://www.indexnow.org/documentation). */
export function describeStatus(status) {
  return ({
    200: 'OK: URLs submitted',
    202: 'Accepted: key validation pending',
    400: 'Bad request: invalid format',
    403: 'Forbidden: the key is not valid (key file not found or its content does not match)',
    422: 'Unprocessable: URLs do not belong to the host or the key does not match the schema',
    429: 'Too many requests: possible spam',
  })[status] || `HTTP ${status}`;
}
