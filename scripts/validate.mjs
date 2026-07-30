#!/usr/bin/env node
// Validates data/providers.json against the project's integrity rules.
// Fails CI (exit 1) if the dataset would ship a claim it can't back up.
// Zero dependencies. Run with: node scripts/validate.mjs   (or `npm test`)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8'));

const CATEGORIES = ['ongoing', 'trial'];
const FREE_TYPES = ['perpetual', 'renewing-quota', 'recurring-credit', 'trial-credit'];
const MODALITIES = ['text', 'vision', 'image', 'audio', 'embeddings', 'rerank'];
const TRISTATE = [true, false, null];
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const URL_RE = /^https?:\/\/.+/;

const errors = [];
const seenSlugs = new Set();
const seenNames = new Set();

function check(cond, msg) {
  if (!cond) errors.push(msg);
}

if (!/^\d+\.\d+\.\d+$/.test(data.version || '')) errors.push('top-level: version must be semver');
if (!DATE_RE.test(data.generated || '')) errors.push('top-level: generated must be YYYY-MM-DD');
if (!Array.isArray(data.providers) || data.providers.length === 0)
  errors.push('top-level: providers must be a non-empty array');

for (const p of data.providers ?? []) {
  const id = p.slug || p.name || '(unknown)';

  check(SLUG_RE.test(p.slug || ''), `${id}: slug must be kebab-case`);
  check(!seenSlugs.has(p.slug), `${id}: duplicate slug`);
  seenSlugs.add(p.slug);
  check(!seenNames.has(p.name), `${id}: duplicate name`);
  seenNames.add(p.name);

  check(typeof p.name === 'string' && p.name.length > 0, `${id}: name required`);
  check(CATEGORIES.includes(p.category), `${id}: category must be one of ${CATEGORIES.join('/')}`);
  check(FREE_TYPES.includes(p.free_type), `${id}: free_type must be one of ${FREE_TYPES.join('/')}`);
  check(typeof p.free_tier === 'string' && p.free_tier.length > 0, `${id}: free_tier required`);
  check(typeof p.verified === 'boolean', `${id}: verified must be boolean`);

  for (const f of ['phone_required', 'card_required', 'commercial_ok', 'openai_compatible'])
    check(TRISTATE.includes(p[f]), `${id}: ${f} must be true/false/null`);

  if (Array.isArray(p.modalities))
    for (const m of p.modalities) check(MODALITIES.includes(m), `${id}: unknown modality "${m}"`);

  // Integrity core: a verified entry must carry a dated, real source link.
  if (p.verified) {
    check(DATE_RE.test(p.last_verified || ''), `${id}: verified entry needs a YYYY-MM-DD last_verified`);
    check(URL_RE.test(p.docs_url || ''), `${id}: verified entry needs a real docs_url (primary source)`);
  } else {
    check(p.last_verified === null, `${id}: unverified entry must have last_verified: null`);
  }
}

if (errors.length) {
  console.error(`✗ providers.json failed validation (${errors.length} issue${errors.length > 1 ? 's' : ''}):`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}

console.log(`✓ providers.json is valid — ${data.providers.length} providers, schema v${data.version}.`);
