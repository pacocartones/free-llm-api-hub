// smoke-live.mjs — every URL in the PUBLISHED sitemap must answer HTTP 200.
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

let SITE = process.env.FLLM_SITE || 'https://freellmapihub.com';
while (SITE.endsWith('/')) SITE = SITE.slice(0, -1);
const TIMEOUT_MS = 20000;
const CONCURRENCY = 8;

async function fetchWithTimeout(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  let xml;
  try {
    const res = await fetchWithTimeout(`${SITE}/sitemap.xml`);
    if (!res.ok) {
      console.error(`✗ ${SITE}/sitemap.xml → HTTP ${res.status}`);
      process.exitCode = 1;
      return;
    }
    xml = await res.text();
  } catch (e) {
    console.error(`✗ could not fetch ${SITE}/sitemap.xml: ${e.name === 'AbortError' ? 'timeout' : e.message}`);
    process.exitCode = 1;
    return;
  }

  const urls = [];
  for (const part of xml.split('<loc>').slice(1)) {
    const end = part.indexOf('</loc>');
    if (end !== -1) urls.push(part.slice(0, end).trim());
  }
  if (!urls.length) {
    console.error(`✗ no <loc> URLs found in ${SITE}/sitemap.xml`);
    process.exitCode = 1;
    return;
  }
  console.log(`Smoke: ${urls.length} URLs from the published sitemap.`);

  const results = [];
  for (let i = 0; i < urls.length; i += CONCURRENCY) {
    const batch = urls.slice(i, i + CONCURRENCY);
    results.push(...await Promise.all(batch.map(async (url) => {
      try {
        const res = await fetchWithTimeout(url);
        return { url, status: res.status };
      } catch (e) {
        return { url, status: 0, error: e.name === 'AbortError' ? 'timeout' : e.message };
      }
    })));
  }

  const bad = results.filter((r) => r.status !== 200);
  if (!bad.length) {
    console.log(`✓ all ${results.length} URLs answered 200.`);
    return;
  }
  for (const r of bad) {
    console.error(`✗ ${r.status ? 'HTTP ' + r.status : r.error}  ${r.url}`);
  }
  console.error(`✗ ${bad.length}/${results.length} URLs did not answer 200.`);
  process.exitCode = 1;
}

await main();
