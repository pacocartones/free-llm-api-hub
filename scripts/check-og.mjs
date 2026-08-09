#!/usr/bin/env node
// check-og.mjs — every committed OG image must exist AND match the dataset.
//
// Existence alone lets a provider whose status/category/flags changed ship a
// stale social image (its PNG is present, just rendered from old data).
// `npm run og` writes site/og/manifest.json with the fingerprint of the exact
// data inputs each image was rendered from; this script recomputes those
// fingerprints from data/providers.json and fails on any difference. Pure Node
// — no @resvg needed, so it runs in the dependency-free CI job.
//
// Exit 0 on a healthy state, 1 with the exact image path(s) + fix command.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildOgManifest } from './lib/og.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { providers } = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8'));

// 1. Every provider must have its PNG committed (unchanged behavior).
const missing = providers
  .filter((p) => !existsSync(join(ROOT, `site/og/p/${p.slug}.png`)))
  .map((p) => p.slug);
if (missing.length) {
  console.error(`${missing.length} provider(s) are missing their OG image. Run: npm run og`);
  for (const s of missing) console.error(`  site/og/p/${s}.png`);
  process.exit(1);
}

// 2. Every data-dependent OG must match the current dataset.
const expected = buildOgManifest(providers);
const manifestPath = join(ROOT, 'site/og/manifest.json');
let actual = {};
if (existsSync(manifestPath)) {
  try { actual = JSON.parse(readFileSync(manifestPath, 'utf8')); } catch { /* treated as empty below */ }
}
const stale = Object.keys(expected).filter((file) => actual[file] !== expected[file]);
if (stale.length) {
  console.error(`${stale.length} OG image(s) are stale relative to the dataset. Run: npm run og`);
  for (const f of stale) console.error(`  site/og/${f}`);
  process.exit(1);
}

console.log(
  `OK — ${providers.length} provider OG images present, ${Object.keys(expected).length} OG images match the dataset.`
);
