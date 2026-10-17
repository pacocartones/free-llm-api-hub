#!/usr/bin/env node
// Add one deliberately unverified provider scaffold to data/providers.json.
// This command records only the slug and display name supplied by its caller;
// every other value is a placeholder or null until a contributor confirms it
// against the provider's own documentation.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { serialize } from './_serialize.mjs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const FILE = join(ROOT, 'data/providers.json');
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PLACEHOLDER = 'Not yet confirmed';

// These are the facts a contributor must fill from a primary source. The
// structural defaults keep the row schema-valid without pretending to know
// which kind of offer or model access the provider has.
export const MISSING_FIELDS = [
  'category', 'free_type', 'free_tier', 'rate_limits', 'docs_url',
  'phone_required', 'card_required', 'commercial_ok', 'openai_compatible',
  'is_text_llm',
];

export function createProvider(slug, name) {
  return {
    slug,
    name,
    category: null,
    free_type: null,
    free_tier: null,
    rate_limits: null,
    notes: '',
    best_for: null,
    modalities: [],
    models_free: null,
    expires: null,
    docs_url: '',
    phone_required: null,
    card_required: null,
    commercial_ok: null,
    openai_compatible: null,
    openai_base_url: null,
    is_text_llm: null,
    model_tier: null,
    free_limits: null,
    data_policy: null,
    verified: false,
    last_verified: null,
    last_probed: null,
    probe_status: null,
  };
}

function usage() {
  console.error('usage: npm run add-provider -- <slug> "<Name>"');
  return 2;
}

function validate(path) {
  try {
    execFileSync(process.execPath, [join(ROOT, 'scripts/validate.mjs'), path], {
      cwd: ROOT,
      stdio: 'pipe',
      encoding: 'utf8',
    });
    return null;
  } catch (error) {
    return error;
  }
}

export function addProvider(path, slug, name) {
  const data = JSON.parse(readFileSync(path, 'utf8'));
  if (data.providers.some((provider) => provider.slug === slug)) {
    throw new Error(`refusing duplicate slug: ${slug}`);
  }

  data.providers.push(createProvider(slug, name));
  const temporary = `${path}.add-provider-${process.pid}.tmp`;
  writeFileSync(temporary, serialize(data), 'utf8');
  const error = validate(temporary);
  if (error) {
    unlinkSync(temporary);
    const detail = error.stderr || error.stdout || error.message;
    throw new Error(`validator rejected the new row:\n${String(detail).trim()}`);
  }
  renameSync(temporary, path);
}

export function main(args = process.argv.slice(2)) {
  if (args.length !== 2) return usage();
  const [slug, rawName] = args;
  const name = rawName.trim();
  if (!SLUG_RE.test(slug)) {
    console.error('slug must be lowercase kebab-case (for example: acme-ai)');
    return 2;
  }
  if (!name) {
    console.error('name must not be empty');
    return 2;
  }
  if (!existsSync(FILE)) {
    console.error(`missing dataset: ${FILE}`);
    return 1;
  }

  try {
    addProvider(FILE, slug, name);
  } catch (error) {
    console.error(error.message);
    return error.message.startsWith('refusing duplicate slug:') ? 2 : 1;
  }
  console.log(`added ${slug} (${name}) to data/providers.json`);
  console.log(`missing fields to confirm: ${MISSING_FIELDS.join(', ')}`);
  console.log('verified: false; fill the missing fields from the provider\'s own docs, then run npm test');
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(main());
