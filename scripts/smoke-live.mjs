// smoke-live.mjs — every URL in the PUBLISHED sitemap, /.well-known/security.txt and /favicon.ico must answer HTTP 200.
//
// Run after a Pages deploy:
//   node scripts/smoke-live.mjs            # default: freellmapihub.com
//   FLLM_SITE=https://example.com node scripts/smoke-live.mjs
//   node scripts/smoke-live.mjs --origin https://<other host>   # another origin serving the same build
//
// --origin reads that origin's sitemap and requests each <loc> on that origin: the <loc>s always carry the canonical
// https://freellmapihub.com, so without it a staging host's sitemap would be checked against production
// (web-watch.yml, docs/architecture.md "Hosting cutover"). It takes precedence over FLLM_SITE.
//
// Fetches the deployed sitemap.xml, extracts every <loc>, and GETs each URL
// (bounded parallelism) asserting HTTP 200. Anything else — 404, 5xx, timeout,
// connection error — fails the run with the offending URLs. Same exit-code
// discipline as check-sitemap-live.mjs: process.exitCode, never process.exit()
// (libuv assert crash on Windows).
//
// FLLM_LIVE_ATTEMPTS (default 1) and FLLM_LIVE_RETRY_DELAY (seconds, default 10,
// doubling up to 60 s) retry the sitemap fetch and then only the URLs that did
// not answer 200: the Pages edge can take a few seconds to serve a new deploy.
// pages.yml sets them; see lib/live-retry.mjs.
import { retryConfig, retryFailing } from './lib/live-retry.mjs';
import { makeLiveFetch } from './lib/live-fetch.mjs';

const CANONICAL = 'https://freellmapihub.com';
const originArg = process.argv.indexOf('--origin');
const ORIGIN = originArg > -1 ? process.argv[originArg + 1] : null;
const USAGE_ERROR = originArg > -1 && !/^https?:\/\/[^/]+\/?$/.test(ORIGIN || '');
let SITE = ORIGIN || process.env.FLLM_SITE || CANONICAL;
while (SITE.endsWith('/')) SITE = SITE.slice(0, -1);
/** With --origin, a canonical <loc> is requested on that origin instead. */
const onOrigin = (loc) => (ORIGIN && loc.startsWith(`${CANONICAL}/`) ? SITE + loc.slice(CANONICAL.length) : loc);
const TIMEOUT_MS = 20000;
const CONCURRENCY = 8;
const RETRY = { ...retryConfig(process.env), log: (line) => console.log(line) };
// Past the CDN cache: ?deploy=<token per deploy run> on every request and Cache-Control: no-cache (lib/live-fetch.mjs).
const liveFetch = makeLiveFetch();

async function fetchWithTimeout(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await liveFetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function fetchSitemap() {
  try {
    const res = await fetchWithTimeout(`${SITE}/sitemap.xml`);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, xml: await res.text() };
  } catch (e) {
    return { ok: false, error: e.name === 'AbortError' ? 'timeout' : e.message };
  }
}

async function checkUrls(urls) {
  const results = [];
  for (let i = 0; i < urls.length; i += CONCURRENCY) {
    const batch = urls.slice(i, i + CONCURRENCY);
    results.push(...await Promise.all(batch.map(async (url) => {
      try {
        const res = await fetchWithTimeout(url);
        // Drain the body so the connection is released before the next batch.
        await res.arrayBuffer().catch(() => {});
        return { url, status: res.status, ok: res.status === 200 };
      } catch (e) {
        return { url, status: 0, ok: false, error: e.name === 'AbortError' ? 'timeout' : e.message };
      }
    })));
  }
  return results;
}

async function main() {
  if (USAGE_ERROR) {
    console.error('usage: node scripts/smoke-live.mjs [--origin https://<host>]');
    process.exitCode = 2;
    return;
  }
  const [sitemap] = await retryFailing([`${SITE}/sitemap.xml`], async () => [await fetchSitemap()], RETRY);
  if (!sitemap.ok) {
    console.error(`✗ could not fetch ${SITE}/sitemap.xml: ${sitemap.error}`);
    process.exitCode = 1;
    return;
  }

  const urls = [];
  for (const part of sitemap.xml.split('<loc>').slice(1)) {
    const end = part.indexOf('</loc>');
    if (end !== -1) urls.push(onOrigin(part.slice(0, end).trim()));
  }
  if (!urls.length) {
    console.error(`✗ no <loc> URLs found in ${SITE}/sitemap.xml`);
    process.exitCode = 1;
    return;
  }
  // Files outside the sitemap that must still be published: the dot-folder one is the first to vanish if the Pages
  // artifact drops hidden files again (pages.yml, include-hidden-files).
  // The sitemap index is the URL submitted in Search Console, so it must be published too.
  urls.push(`${SITE}/.well-known/security.txt`, `${SITE}/favicon.ico`, `${SITE}/sitemap-index.xml`);
  console.log(`Smoke: ${urls.length - 3} URLs from the published sitemap, plus security.txt, favicon.ico and sitemap-index.xml.`);

  const results = await retryFailing(urls, checkUrls, RETRY);
  const bad = results.filter((r) => !r.ok);
  if (!bad.length) {
    console.log(`✓ all ${results.length} URLs answered 200.`);
    return;
  }
  for (const r of bad) {
    console.error(`✗ ${r.status ? 'HTTP ' + r.status : r.error}  ${r.url}`);
  }
  console.error(`✗ ${bad.length}/${results.length} URLs did not answer 200${RETRY.attempts > 1 ? ` after ${RETRY.attempts} attempts` : ''}.`);
  process.exitCode = 1;
}

await main();
