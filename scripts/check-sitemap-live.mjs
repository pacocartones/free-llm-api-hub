// check-sitemap-live.mjs — end-to-end: committed sitemap == deployed sitemap.
//
// Run after a Pages deploy:
//   node scripts/check-sitemap-live.mjs        # default: freellmapihub.com
//   FLLM_SITE=https://example.com node scripts/check-sitemap-live.mjs
//
// Compares the repo's site/sitemap.xml (what the drift gate commits and the
// build regenerates deterministically) with the live copy served by the site.
// Any difference — a stale deploy, a drift-gate hole, or a build that stopped
// being deterministic — surfaces here. This is a manual/agent check, not part
// of CI: it depends on production having just been deployed.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = (process.env.FLLM_SITE || 'https://freellmapihub.com').replace(/\/$/, '');

async function main() {
  const local = readFileSync(join(ROOT, 'site/sitemap.xml'), 'utf8');

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  let live;
  try {
    const res = await fetch(`${SITE}/sitemap.xml`, { signal: ctrl.signal });
    if (!res.ok) {
      console.error(`✗ ${SITE}/sitemap.xml → HTTP ${res.status}`);
      process.exitCode = 1;
      return;
    }
    live = await res.text();
  } catch (e) {
    console.error(`✗ fetch failed: ${e.name === 'AbortError' ? 'timeout' : e.message}`);
    process.exitCode = 1;
    return;
  } finally {
    clearTimeout(t);
  }

  if (local === live) {
    console.log(`✓ sitemap matches production — ${live.length} bytes, identical.`);
    return;
  }

  // First divergence, with context, for a useful failure message.
  const n = Math.min(local.length, live.length);
  let i = 0;
  while (i < n && local[i] === live[i]) i++;
  console.error(`✗ sitemap differs from production at offset ${i}.`);
  console.error(`  local: …${local.slice(Math.max(0, i - 40), i + 60)}…`);
  console.error(`  live:  …${live.slice(Math.max(0, i - 40), i + 60)}…`);
  console.error('  Run `npm run build` and commit the regenerated site/sitemap.xml, then redeploy.');
  process.exitCode = 1;
}

await main();
