#!/usr/bin/env node
// check-og.mjs — every committed OG image must exist AND match the dataset.
//
// Existence alone lets a provider whose status/category/flags changed ship a
// stale social image (its PNG is present, just rendered from old data).
// `npm run og` writes site/og/manifest.json with the fingerprint of the exact
// data inputs each image was rendered from; this script recomputes those
// fingerprints from data/providers.json and fails on any difference. Pure Node
// — no @resvg needed, so the CI check does not need to render images.
//
// Exit 0 on a healthy state, 1 with the exact image path(s) + fix command.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { buildOgManifest, renderHomeOg } from './lib/og.mjs';

// Check the expected roster, never just the manifest's existing entries.
export function ogIssues(providers, homeSvg, actual, exists) {
  const expected = buildOgManifest(providers, homeSvg);
  const missing = Object.keys(expected).filter((file) => !exists(file));
  const stale = Object.keys(expected).filter((file) => actual?.[file] !== expected[file]);
  if (homeSvg !== renderHomeOg(homeSvg, providers)) stale.push('../og.svg');
  return { missing, stale };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
  const { providers } = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8'));
  const homeSvg = readFileSync(join(ROOT, 'site/og.svg'), 'utf8');
  let actual = {};
  try { actual = JSON.parse(readFileSync(join(ROOT, 'site/og/manifest.json'), 'utf8')); } catch { /* missing or invalid manifest is stale */ }
  const { missing, stale } = ogIssues(providers, homeSvg, actual, (file) => existsSync(join(ROOT, 'site/og', file)));
  for (const [label, files] of [['missing', missing], ['stale', stale]]) {
    if (!files.length) continue;
    console.error(`${files.length} OG image(s) are ${label}. Run: npm run og`);
    for (const file of files) console.error(`  ${join('site/og', file)}`);
  }
  if (missing.length || stale.length) process.exitCode = 1;
  else console.log('OK — all expected OG images exist and match the dataset.');
}
