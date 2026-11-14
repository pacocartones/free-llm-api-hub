import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeTmpDir } from './lib/tmp.mjs';

const SCRIPT = fileURLToPath(new URL('./fetch-models.mjs', import.meta.url));
const SYNTHETIC_KEY = 'sk-SYNTHETIC1234567890z';

function runWithResponse(modelIds, syntheticKey = SYNTHETIC_KEY, rawKeyedBody = null) {
  const root = makeTmpDir('flah-provider-output-');
  const divert = join(root, 'divert.mjs');
  writeFileSync(divert, `
globalThis.fetch = async (url, options = {}) => {
  if (options.headers && options.headers.Authorization && ${JSON.stringify(rawKeyedBody)} !== null) {
    return new Response(${JSON.stringify(rawKeyedBody)}, {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  let body;
  if (options.headers && options.headers.Authorization) {
    body = { data: ${JSON.stringify(modelIds)}.map((id) => ({ id })) };
  } else if (String(url).includes('pollinations')) {
    body = [];
  } else if (String(url).includes('ollama.com')) {
    body = { models: [] };
  } else {
    body = { data: [] };
  }
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};
`);
  return spawnSync(process.execPath, ['--import', pathToFileURL(divert).href, SCRIPT], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, GROQ_API_KEY: syntheticKey },
  });
}

test('fetch-models rejects fragments that sampling reorders into a configured credential before stdout', () => {
  const prefix = SYNTHETIC_KEY.slice(0, -1);
  const suffix = SYNTHETIC_KEY.slice(-1);
  const run = runWithResponse([suffix, prefix]);
  assert.notEqual(run.status, 0);
  assert.doesNotMatch(`${run.stdout}${run.stderr}`, new RegExp(`${prefix}|${suffix}, ${prefix}`));
  assert.match(run.stderr, /Unsafe provider response metadata was rejected/);
});

test('fetch-models validates the complete log payload including its fixed text', () => {
  const run = runWithResponse(['alphaz'], 'modelsalphaz');
  assert.notEqual(run.status, 0);
  assert.doesNotMatch(`${run.stdout}${run.stderr}`, /alphaz/);
  assert.match(run.stderr, /Unsafe provider response metadata was rejected/);
});

test('fetch-models fails closed when a configured credential is too short to scan safely', () => {
  const run = runWithResponse(['alpha'], 'modelsalpha');
  assert.notEqual(run.status, 0);
  assert.doesNotMatch(`${run.stdout}${run.stderr}`, /alpha/);
  assert.match(run.stderr, /Unsafe provider response metadata was rejected/);
});

test('fetch-models never echoes a credential reflected in an invalid JSON response', () => {
  const run = runWithResponse([], SYNTHETIC_KEY, SYNTHETIC_KEY);
  assert.equal(run.status, 0);
  assert.doesNotMatch(`${run.stdout}${run.stderr}`, /sk-SYNTHET/);
  assert.match(run.stdout, /fetch failed \(invalid JSON\), left unchanged/);
});

test('fetch-models still reports an ordinary sampled model list', () => {
  const run = runWithResponse(['vendor/beta', 'vendor/alpha']);
  assert.equal(run.status, 0);
  assert.match(run.stdout, /groq: 2 models — vendor\/alpha, vendor\/beta/);
});

test('fetch-models refuses a keyed extractor whose env var drifted from the dataset', () => {
  const root = makeTmpDir('flah-fetch-models-config-');
  mkdirSync(join(root, 'scripts', 'lib'), { recursive: true });
  mkdirSync(join(root, 'data'));
  for (const name of [
    'fetch-models.mjs', '_serialize.mjs', 'lib/key-hosts.mjs', 'lib/provider-output-safety.mjs',
  ]) cpSync(new URL(name, import.meta.url), join(root, 'scripts', name));
  const source = readFileSync(new URL('../data/providers.json', import.meta.url), 'utf8');
  writeFileSync(join(root, 'data', 'providers.json'), source.replace(
    '"env_key": "GROQ_API_KEY"', '"env_key": "OTHER_API_KEY"',
  ));
  const run = spawnSync(process.execPath, [join(root, 'scripts', 'fetch-models.mjs'), '--self-test'], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot },
  });
  assert.notEqual(run.status, 0);
  assert.match(`${run.stdout}${run.stderr}`, /groq.*GROQ_API_KEY.*OTHER_API_KEY/);
});

test('fetch-models validates the complete final summary before stdout', () => {
  const key = '1providerswouldchangeRerunwithwritetoapply';
  const run = runWithResponse(['vendor/alpha'], key);
  assert.notEqual(run.status, 0);
  assert.doesNotMatch(`${run.stdout}${run.stderr}`, /1 provider\(s\) would change/);
  assert.match(run.stderr, /Unsafe provider response metadata was rejected/);
});
