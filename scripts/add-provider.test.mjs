import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTmpDir } from './lib/tmp.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = join(ROOT, 'scripts/add-provider.mjs');
const TODAY = '2026-11-14';

function workspace() {
  const dir = makeTmpDir('add-provider-');
  const dataFile = join(dir, 'providers.json');
  const draftDir = join(dir, 'drafts');
  copyFileSync(join(ROOT, 'data/providers.json'), dataFile);
  return { dataFile, draftDir };
}

function run({ dataFile, draftDir }, slug, name) {
  const result = spawnSync(process.execPath, [SCRIPT, slug, name], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      ADD_PROVIDER_DATA_FILE: dataFile,
      ADD_PROVIDER_DRAFT_DIR: draftDir,
      ADD_PROVIDER_TODAY: TODAY,
      VALIDATE_TODAY: TODAY,
    },
  });
  return { ...result, output: `${result.stdout}${result.stderr}` };
}

function draftPath(work, slug) {
  return join(work.draftDir, `${slug}.json`);
}

function completeDraft(work, slug, overrides = {}) {
  const path = draftPath(work, slug);
  const draft = JSON.parse(readFileSync(path, 'utf8'));
  Object.assign(draft, {
    category: 'ongoing',
    free_type: 'perpetual',
    free_tier: '10 requests per minute',
    rate_limits: '10 requests/minute',
    modalities: ['text'],
    docs_url: 'https://example.com/docs',
    is_text_llm: true,
    ...overrides,
  });
  writeFileSync(path, `${JSON.stringify(draft, null, 2)}\n`);
}

test('add-provider keeps an invalid scaffold as a local draft, then appends it once after validation', () => {
  const work = workspace();
  const before = readFileSync(work.dataFile, 'utf8');

  const scaffold = run(work, 'example-ai', 'Example AI');
  assert.equal(scaffold.status, 1, scaffold.output);
  assert.equal(readFileSync(work.dataFile, 'utf8'), before);
  assert.ok(existsSync(draftPath(work, 'example-ai')), 'the editable draft must remain on disk');
  assert.match(scaffold.output, /draft .*example-ai\.json/i);
  assert.match(scaffold.output, /required fields to complete: category, free_type, free_tier, rate_limits, docs_url, is_text_llm/);
  assert.match(scaffold.output, /optional facts that may remain unknown: phone_required, card_required, commercial_ok, openai_compatible/);
  assert.match(scaffold.output, /validation failed/i);

  const draft = JSON.parse(readFileSync(draftPath(work, 'example-ai'), 'utf8'));
  assert.equal(draft.slug, 'example-ai');
  assert.equal(draft.name, 'Example AI');
  assert.equal(draft.verified, false);
  assert.equal(draft.last_verified, null);
  assert.equal(draft.category, null);
  assert.equal(draft.free_type, null);
  assert.equal(draft.free_tier, null);
  assert.equal(draft.rate_limits, null);
  assert.equal(draft.is_text_llm, null);

  completeDraft(work, 'example-ai');
  const add = run(work, 'example-ai', 'Example AI');
  assert.equal(add.status, 0, add.output);
  assert.match(add.output, /added example-ai \(Example AI\)/);
  assert.equal(existsSync(draftPath(work, 'example-ai')), false);

  const raw = readFileSync(work.dataFile, 'utf8');
  const provider = JSON.parse(raw).providers.at(-1);
  assert.equal(provider.slug, 'example-ai');
  assert.ok(raw.indexOf('"slug"') < raw.indexOf('"name"'));
  assert.ok(raw.lastIndexOf('"category"') < raw.lastIndexOf('"verified"'));

  const duplicate = run(work, 'example-ai', 'Example AI');
  assert.equal(duplicate.status, 2, duplicate.output);
  assert.match(duplicate.output, /refusing duplicate slug/);
  assert.equal(readFileSync(work.dataFile, 'utf8'), raw);
});

test('add-provider never installs a draft whose category contradicts its free type', () => {
  const work = workspace();
  const before = readFileSync(work.dataFile, 'utf8');
  run(work, 'category-clash', 'Category Clash');
  completeDraft(work, 'category-clash', { category: 'trial' });

  const result = run(work, 'category-clash', 'Category Clash');
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /belongs in category "ongoing"/);
  assert.equal(readFileSync(work.dataFile, 'utf8'), before);
  assert.ok(existsSync(draftPath(work, 'category-clash')));
});

test('add-provider never installs an incomplete draft marked verified', () => {
  const work = workspace();
  const before = readFileSync(work.dataFile, 'utf8');
  run(work, 'false-verification', 'False Verification');
  completeDraft(work, 'false-verification', { verified: true });

  const result = run(work, 'false-verification', 'False Verification');
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /last_verified/);
  assert.equal(readFileSync(work.dataFile, 'utf8'), before);
  assert.ok(existsSync(draftPath(work, 'false-verification')));
});

test('add-provider runs cross-dataset slug checks before replacing providers.json', () => {
  const work = workspace();
  const before = readFileSync(work.dataFile, 'utf8');
  run(work, 'github-copilot-free', 'Not A Provider');
  completeDraft(work, 'github-copilot-free');

  const result = run(work, 'github-copilot-free', 'Not A Provider');
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /shares its slug with a provider/);
  assert.equal(readFileSync(work.dataFile, 'utf8'), before);
  assert.ok(existsSync(draftPath(work, 'github-copilot-free')));
});

test('add-provider requires core facts but accepts unknown tri-state facts', () => {
  const work = workspace();
  const before = readFileSync(work.dataFile, 'utf8');
  run(work, 'required-facts', 'Required Facts');
  completeDraft(work, 'required-facts', { docs_url: '   ' });

  const missing = run(work, 'required-facts', 'Required Facts');
  assert.equal(missing.status, 1, missing.output);
  assert.match(missing.output, /required fields still missing: docs_url/);
  assert.equal(readFileSync(work.dataFile, 'utf8'), before);

  completeDraft(work, 'required-facts');
  const added = run(work, 'required-facts', 'Required Facts');
  assert.equal(added.status, 0, added.output);
  const provider = JSON.parse(readFileSync(work.dataFile, 'utf8')).providers.at(-1);
  for (const field of ['phone_required', 'card_required', 'commercial_ok', 'openai_compatible']) {
    assert.equal(provider[field], null, `${field} may remain unknown`);
  }
});

test('add-provider stamps added and generated before validating a provider verified today', () => {
  const work = workspace();
  run(work, 'verified-today', 'Verified Today');
  completeDraft(work, 'verified-today', {
    verified: true,
    last_verified: TODAY,
  });

  const result = run(work, 'verified-today', 'Verified Today');
  assert.equal(result.status, 0, result.output);
  const data = JSON.parse(readFileSync(work.dataFile, 'utf8'));
  assert.equal(data.generated, TODAY);
  assert.equal(data.providers.at(-1).added, TODAY);
  assert.equal(data.providers.at(-1).last_verified, TODAY);
});

test('add-provider refuses an active repository lock and recovers a stale one', () => {
  const work = workspace();
  const before = readFileSync(work.dataFile, 'utf8');
  run(work, 'locked-provider', 'Locked Provider');
  completeDraft(work, 'locked-provider');
  const lock = `${work.dataFile}.add-provider.lock`;
  mkdirSync(lock);
  writeFileSync(join(lock, 'owner.json'), `${JSON.stringify({ pid: process.pid, acquired_at: new Date().toISOString() })}\n`);

  const blocked = run(work, 'locked-provider', 'Locked Provider');
  assert.equal(blocked.status, 1, blocked.output);
  assert.match(blocked.output, /another add-provider process holds the dataset lock/);
  assert.equal(readFileSync(work.dataFile, 'utf8'), before);
  assert.ok(existsSync(draftPath(work, 'locked-provider')));

  const old = new Date(Date.now() - 10 * 60 * 1000);
  utimesSync(lock, old, old);
  const recovered = run(work, 'locked-provider', 'Locked Provider');
  assert.equal(recovered.status, 0, recovered.output);
  assert.equal(existsSync(lock), false, 'the recovered lock must be cleaned up');
  assert.equal(JSON.parse(readFileSync(work.dataFile, 'utf8')).providers.at(-1).slug, 'locked-provider');
});
