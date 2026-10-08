// check-sitemap-live.mjs — end-to-end: committed sitemap == deployed sitemap.
//
// Run after a Pages deploy:
//   node scripts/check-sitemap-live.mjs        # default: freellmapihub.com
//   FLLM_SITE=https://example.com node scripts/check-sitemap-live.mjs
//
// Compares the repo's site/sitemap.xml (what the drift gate commits and the
// build regenerates deterministically) with the live copy served by the site.
// Any difference — a stale deploy, a drift-gate hole, or a build that stopped
// being deterministic — surfaces here. Runs manually after a deploy and as the
// verify-live job of pages.yml once the deployment is live.
//
// FLLM_LIVE_ATTEMPTS (default 1) + FLLM_LIVE_RETRY_DELAY seconds (default 10)
// drive the retry loop: the Pages edge can take a few seconds to serve the new
// version, so CI sets FLLM_LIVE_ATTEMPTS=6 and retries both fetch failures and
// byte mismatches before failing with the divergence context below.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = (process.env.FLLM_SITE || 'https://freellmapihub.com').replace(/\/$/, '');

async function main() {
  const local = readFileSync(join(ROOT, 'site/sitemap.xml'), 'utf8');
  const rawAttempts = parseInt(process.env.FLLM_LIVE_ATTEMPTS || '1', 10);
  const attempts = Number.isFinite(rawAttempts) && rawAttempts >= 1 ? rawAttempts : 1;
  const rawDelay = parseInt(process.env.FLLM_LIVE_RETRY_DELAY || '10', 10);
  const retryDelayMs = (Number.isFinite(rawDelay) && rawDelay >= 0 ? rawDelay : 10) * 1000;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  let last = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    let live = null;
    let err = null;
    try {
      const res = await fetch(`${SITE}/sitemap.xml`, { signal: ctrl.signal });
      if (!res.ok) err = `HTTP ${res.status}`;
      else live = await res.text();
    } catch (e) {
      err = e.name === 'AbortError' ? 'timeout' : e.message;
    } finally {
      clearTimeout(t);
    }

    if (err) {
      last = { err };
    } else if (live === local) {
      console.log(`✓ sitemap matches production — ${live.length} bytes, identical.`);
      return;
    } else {
      const n = Math.min(local.length, live.length);
      let i = 0;
      while (i < n && local[i] === live[i]) i++;
      last = { offset: i, live };
    }

    if (attempt < attempts) {
      const why = last.err || 'byte mismatch (deploy edge may still be propagating)';
      console.log(`  attempt ${attempt}/${attempts}: ${why} — retrying in ${retryDelayMs / 1000}s`);
      await sleep(retryDelayMs);
    }
  }

  if (last.err) {
    console.error(`✗ ${SITE}/sitemap.xml → ${last.err}`);
  } else {
    const i = last.offset;
    console.error(`✗ sitemap differs from production at offset ${i}.`);
    console.error(`  local: …${local.slice(Math.max(0, i - 40), i + 60)}…`);
    console.error(`  live:  …${last.live.slice(Math.max(0, i - 40), i + 60)}…`);
    console.error('  Run `npm run build` and commit the regenerated site/sitemap.xml, then redeploy.');
  }
  process.exitCode = 1;
}
await main();
