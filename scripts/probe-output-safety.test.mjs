import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeTmpDir } from './lib/tmp.mjs';

const SCRIPT = fileURLToPath(new URL('./probe.mjs', import.meta.url));

function runProbe(key, remaining) {
  const root = makeTmpDir('flah-probe-output-');
  const divert = join(root, 'divert.mjs');
  writeFileSync(divert, `
globalThis.fetch = async () => new Response(JSON.stringify({ data: [] }), {
  status: 200,
  headers: {
    'content-type': 'application/json',
    'x-ratelimit-remaining-requests': ${JSON.stringify(remaining)},
  },
});
`);
  return spawnSync(process.execPath, [
    '--import', pathToFileURL(divert).href, SCRIPT, '--auth-only', '--only=groq',
  ], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, GROQ_API_KEY: key },
  });
}

test('probe validates the complete rate-limit log payload before stdout', () => {
  const run = runProbe('remainingrequests30', '30');
  assert.notEqual(run.status, 0);
  assert.doesNotMatch(`${run.stdout}${run.stderr}`, /remaining-requests=30/);
  assert.match(run.stderr, /Unsafe provider response metadata was rejected/);
});

test('probe still reports an ordinary allowlisted rate-limit value', () => {
  const run = runProbe('sk-SYNTHETIC1234567890z', '30');
  assert.equal(run.status, 0);
  assert.match(run.stdout, /remaining-requests=30/);
});

test('probe validates the complete final summary before stdout', () => {
  const key = '0live0nokey0noadapterof1Rerunwithwritetopersist';
  const run = runProbe(key, '30');
  assert.notEqual(run.status, 0);
  assert.doesNotMatch(`${run.stdout}${run.stderr}`, /0 live · 0 no-key · 0 no-adapter/);
  assert.match(run.stderr, /Unsafe provider response metadata was rejected/);
});
