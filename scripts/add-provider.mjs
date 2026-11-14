#!/usr/bin/env node
// Prepare one provider row without weakening the canonical dataset contract.
// The first run writes an intentionally invalid local draft. A later run
// appends that draft only after the full production validator accepts it.
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ORDER, serialize } from './_serialize.mjs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const FILE = process.env.ADD_PROVIDER_DATA_FILE || join(ROOT, 'data/providers.json');
export const DRAFT_DIR = process.env.ADD_PROVIDER_DRAFT_DIR || join(ROOT, '.freebuff/provider-drafts');
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const MISSING_FIELDS = [
  'category', 'free_type', 'free_tier', 'rate_limits', 'docs_url',
  'phone_required', 'card_required', 'commercial_ok', 'openai_compatible',
  'is_text_llm',
];

export function createProvider(slug, name) {
  const values = {
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
    model_tier_source: null,
    free_limits: null,
    no_expiry: null,
    verified: false,
    last_verified: null,
    last_probed: null,
    probe_status: null,
    data_policy: null,
  };
  return Object.fromEntries(ORDER.filter((key) => key in values).map((key) => [key, values[key]]));
}

function draftFile(draftDir, slug) {
  return join(draftDir, `${slug}.json`);
}

function pendingFields(provider) {
  return MISSING_FIELDS.filter((field) => provider[field] === null || provider[field] === '');
}

function validationError(path) {
  const result = spawnSync(process.execPath, [join(ROOT, 'scripts/validate.mjs'), path], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, VALIDATE_PROPOSAL: '1' },
  });
  if (result.status === 0) return null;
  return `${result.stdout}${result.stderr}`.trim() || `validator exited with status ${result.status}`;
}

export function addProvider(dataFile, draftDir, slug, name) {
  const raw = readFileSync(dataFile, 'utf8');
  const data = JSON.parse(raw);
  if (data.providers.some((provider) => provider.slug === slug)) {
    throw new Error(`refusing duplicate slug: ${slug}`);
  }

  mkdirSync(draftDir, { recursive: true });
  const draft = draftFile(draftDir, slug);
  if (!existsSync(draft)) {
    const provider = createProvider(slug, name);
    writeFileSync(draft, `${JSON.stringify(provider, null, 2)}\n`, 'utf8');
    const candidate = structuredClone(data);
    candidate.providers.push(provider);
    const temporary = `${dataFile}.add-provider-${process.pid}.tmp`;
    writeFileSync(temporary, serialize(candidate), 'utf8');
    const error = validationError(temporary);
    unlinkSync(temporary);
    if (!error) {
      unlinkSync(draft);
      throw new Error('safety check failed: the incomplete scaffold unexpectedly passed validation');
    }
    return { status: 'draft', draft, pending: pendingFields(provider), error };
  }

  const provider = JSON.parse(readFileSync(draft, 'utf8'));
  if (provider.slug !== slug || provider.name !== name) {
    throw new Error(`draft identity must remain ${slug} (${name})`);
  }
  const unknown = Object.keys(provider).filter((key) => !ORDER.includes(key));
  if (unknown.length) throw new Error(`draft has unknown field${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}`);

  const candidate = structuredClone(data);
  candidate.providers.push(provider);
  const temporary = `${dataFile}.add-provider-${process.pid}.tmp`;
  writeFileSync(temporary, serialize(candidate), 'utf8');
  const error = validationError(temporary);
  if (error) {
    unlinkSync(temporary);
    return { status: 'invalid', draft, pending: pendingFields(provider), error };
  }
  if (readFileSync(dataFile, 'utf8') !== raw) {
    unlinkSync(temporary);
    throw new Error('providers.json changed while the draft was being validated; retry');
  }
  renameSync(temporary, dataFile);
  unlinkSync(draft);
  return { status: 'added', draft, pending: [] };
}

function usage() {
  console.error('usage: npm run add-provider -- <slug> "<Name>"');
  return 2;
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

  let result;
  try {
    result = addProvider(FILE, DRAFT_DIR, slug, name);
  } catch (error) {
    console.error(error.message);
    return error.message.startsWith('refusing duplicate slug:') ? 2 : 1;
  }
  if (result.status === 'added') {
    console.log(`added ${slug} (${name}) to data/providers.json`);
    return 0;
  }

  console.error(result.error);
  console.log(`${result.status === 'draft' ? 'draft written' : 'draft remains'}: ${result.draft}`);
  if (result.pending.length) console.log(`fields still to confirm: ${result.pending.join(', ')}`);
  console.log('validation failed as expected; complete the draft and run the same command again');
  console.log('data/providers.json was not changed');
  return 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main());
