// smoke-live.mjs — every URL in the PUBLISHED sitemap, /.well-known/security.txt and /favicon.ico must answer HTTP 200.
//
// Run after a Pages deploy:
//   node scripts/smoke-live.mjs            # default: freellmapihub.com
//   FLLM_SITE=https://example.com node scripts/smoke-live.mjs
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

let SITE = process.env.FLLM_SITE || 'https://freellmapihub.com';
while (SITE.endsWith('/')) SITE = SITE.slice(0, -1);
const TIMEOUT_MS = 20000;
const CONCURRENCY = 8;
const RETRY = { ...retryConfig(process.env), log: (line) => console.log(line) };

async function fetchWithTimeout(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { signal: ctrl.signal });
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
  const [sitemap] = await retryFailing([`${SITE}/sitemap.xml`], async () => [await fetchSitemap()], RETRY);
  if (!sitemap.ok) {
    console.error(`✗ could not fetch ${SITE}/sitemap.xml: ${sitemap.error}`);
    process.exitCode = 1;
    return;
  }

  const urls = [];
  for (const part of sitemap.xml.split('<loc>').slice(1)) {
    const end = part.indexOf('</loc>');
    if (end !== -1) urls.push(part.slice(0, end).trim());
  }
  if (!urls.length) {
    console.error(`✗ no <loc> URLs found in ${SITE}/sitemap.xml`);
    process.exitCode = 1;
    return;
  }
  // Files outside the sitemap that must still be published: the dot-folder one is the first to vanish if the Pages
  // artifact drops hidden files again (pages.yml, include-hidden-files).
  urls.push(`${SITE}/.well-known/security.txt`, `${SITE}/favicon.ico`);
  console.log(`Smoke: ${urls.length - 2} URLs from the published sitemap, plus security.txt and favicon.ico.`);

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
