import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addProvider, createProvider, MISSING_FIELDS } from './add-provider.mjs';
import { makeTmpDir } from './lib/tmp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VALIDATE = join(ROOT, 'scripts/validate.mjs');

test('add-provider appends a canonical, validator-approved scaffold and refuses duplicates', () => {
  const dir = makeTmpDir('add-provider-');
  const dataPath = join(dir, 'providers.json');
  copyFileSync(join(ROOT, 'data/providers.json'), dataPath);
  const before = readFileSync(dataPath, 'utf8');

  addProvider(dataPath, 'example-ai', 'Example AI');
  const raw = readFileSync(dataPath, 'utf8');
  const data = JSON.parse(raw);
  const provider = data.providers.at(-1);

  assert.equal(data.providers.length, JSON.parse(before).providers.length + 1);
  assert.deepEqual(provider, createProvider('example-ai', 'Example AI'));
  assert.ok(raw.indexOf('"slug"') < raw.indexOf('"name"'));
  assert.ok(raw.indexOf('"name"') < raw.indexOf('"category"'));
  assert.ok(raw.indexOf('"category"') < raw.indexOf('"verified"'));
  assert.equal(provider.verified, false);
  assert.deepEqual(MISSING_FIELDS, [
    'category', 'free_type', 'free_tier', 'rate_limits', 'docs_url',
    'phone_required', 'card_required', 'commercial_ok', 'openai_compatible',
    'is_text_llm',
  ]);
  execFileSync(process.execPath, [VALIDATE, dataPath], { cwd: ROOT, stdio: 'pipe' });

  assert.throws(() => addProvider(dataPath, 'example-ai', 'Another Name'), /refusing duplicate slug/);
  assert.equal(readFileSync(dataPath, 'utf8'), raw, 'duplicate refusal must not rewrite the file');

  const invalidPath = join(dir, 'invalid.json');
  const invalid = JSON.parse(raw);
  invalid.providers.at(-1).verified = true;
  writeFileSync(invalidPath, JSON.stringify(invalid));
  assert.throws(
    () => execFileSync(process.execPath, [VALIDATE, invalidPath], { cwd: ROOT, stdio: 'pipe' }),
    /./,
    'the validator rejects a scaffold if it is marked verified without evidence',
  );
});
