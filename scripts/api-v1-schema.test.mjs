// The published /api/v1/schema.json is open (fields are only added within v1,
// so a consumer's validator must not reject a key the schema does not list
// yet), while the canonical data/schema.json that scripts/validate.mjs uses
// stays closed, so a typo in the dataset still fails.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { makeTmpDir } from './lib/tmp.mjs';
import { apiV1ProviderSchema, openAdditionalProperties, toApiV1Provider } from './lib/api-v1.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CANONICAL = JSON.parse(readFileSync(join(ROOT, 'data/schema.json'), 'utf8'));
const DATA = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8'));

const compile = (schema) => {
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictTypes: false, validateFormats: true });
  addFormats(ajv, ['date', 'uri']);
  return ajv.compile(schema);
};

/** A v1 provider-list payload built the way build.mjs builds providers.json. */
const v1Payload = () => {
  const providers = structuredClone(DATA.providers).map(({ env_key, ...p }) => toApiV1Provider(p));
  return {
    dataset: 'free-llm-api-hub',
    version: DATA.version,
    generated: DATA.generated,
    license: 'CC-BY-4.0',
    homepage: 'https://freellmapihub.com/',
    docs: 'https://freellmapihub.com/api/',
    count: providers.length,
    providers,
  };
};

const withFieldChecks = (payload) => payload.providers.findIndex((p) => p.field_checks && Object.keys(p.field_checks).length);

test('openAdditionalProperties turns every closed object open and leaves its input untouched', () => {
  const input = { additionalProperties: false, properties: { a: { additionalProperties: false } }, allOf: [{ additionalProperties: false }], $defs: { m: { additionalProperties: { type: 'string' } } } };
  const before = structuredClone(input);
  assert.deepEqual(openAdditionalProperties(input), {
    additionalProperties: true,
    properties: { a: { additionalProperties: true } },
    allOf: [{ additionalProperties: true }],
    $defs: { m: { additionalProperties: { type: 'string' } } },
  });
  assert.deepEqual(input, before, 'the canonical schema object is not mutated');
});

test('the published v1 schema has no closed object left, and the canonical schema keeps all of them', () => {
  const published = JSON.stringify(apiV1ProviderSchema(CANONICAL));
  assert.doesNotMatch(published, /"additionalProperties":false/);
  assert.match(published, /"additionalProperties":true/);
  const canonical = JSON.stringify(CANONICAL);
  assert.match(canonical, /"additionalProperties":false/, 'apiV1ProviderSchema does not mutate the canonical schema');
  assert.equal(apiV1ProviderSchema(CANONICAL).$defs.provider.additionalProperties, true);
});

test('the published v1 schema accepts an unknown field on the envelope, a provider and a nested object', () => {
  const validate = compile(apiV1ProviderSchema(CANONICAL));
  const payload = v1Payload();
  assert.equal(validate(payload), true, JSON.stringify(validate.errors));

  const extended = structuredClone(payload);
  extended.future_envelope_field = 'x';
  extended.providers[0].future_provider_field = { any: 'shape' };
  const i = withFieldChecks(extended);
  assert.ok(i >= 0, 'the dataset has a provider with field_checks');
  const flag = Object.keys(extended.providers[i].field_checks)[0];
  extended.providers[i].field_checks[flag].future_check_field = true;
  extended.providers[i].field_checks.future_flag = { status: 'stated' };
  assert.equal(validate(extended), true, JSON.stringify(validate.errors));
});

test('the published v1 schema still checks the fields it lists', () => {
  const validate = compile(apiV1ProviderSchema(CANONICAL));
  const missing = v1Payload();
  delete missing.providers[0].slug;
  assert.equal(validate(missing), false, 'a required property is still required');

  const retyped = v1Payload();
  retyped.providers[0].commercial_ok = 'conditional';
  assert.equal(validate(retyped), false, 'a listed field keeps its v1 type');

  const badCheck = v1Payload();
  const i = withFieldChecks(badCheck);
  const flag = Object.keys(badCheck.providers[i].field_checks)[0];
  badCheck.providers[i].field_checks[flag].status = 'maybe';
  assert.equal(validate(badCheck), false, 'a nested listed field keeps its enum');
});

test('the canonical dataset schema and scripts/validate.mjs still reject an unknown provider field', () => {
  const validate = compile(CANONICAL);
  assert.equal(validate(DATA), true, JSON.stringify(validate.errors));
  const typo = structuredClone(DATA);
  typo.providers[0].card_requird = false;
  assert.equal(validate(typo), false);
  assert.ok(validate.errors.some((e) => e.keyword === 'additionalProperties' && e.params.additionalProperty === 'card_requird'));

  const fixture = join(makeTmpDir('api-v1-schema-'), 'providers.json');
  writeFileSync(fixture, JSON.stringify(typo));
  const run = spawnSync(process.execPath, ['scripts/validate.mjs', fixture], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(run.status, 1, 'validate.mjs fails on the typo');
  assert.match(run.stderr, /\/providers\/0\/card_requird/);
});
