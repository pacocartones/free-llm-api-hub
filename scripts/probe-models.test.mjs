import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeTmpDir } from './lib/tmp.mjs';
import { serialize } from './_serialize.mjs';

const data = JSON.parse(readFileSync(new URL('../data/providers.json', import.meta.url), 'utf8'));
const provider = data.providers.find((p) => p.slug === 'iteracompute');

for (const mode of ['auth-only', 'success', 'failure']) {
  test(`write-enabled ${mode} probes preserve curated free models`, () => {
    const root = makeTmpDir('flah-probe-models-');
    for (const name of ['probe.mjs', '_serialize.mjs', 'lib/key-hosts.mjs'])
      cpSync(new URL(name, import.meta.url), join(root, 'scripts', name));
    mkdirSync(join(root, 'data'));
    const file = join(root, 'data/providers.json');
    writeFileSync(file, serialize({ ...data, providers: [provider] }));
    const requests = join(root, 'requests.jsonl');
    const mock = join(root, 'mock.mjs');
    writeFileSync(mock, `import { appendFileSync } from 'node:fs';
globalThis.fetch = async (url, options) => {
  if (String(url).endsWith('/models'))
    return Response.json({ data: [{ id: 'aaa/paid-model' }, { id: 'qwen/qwen3.8-27b' }] });
  const body = JSON.parse(options.body);
  appendFileSync(${JSON.stringify(requests)}, JSON.stringify(body.model) + '\\n');
  return Response.json(${mode === 'failure' ? "{ error: { message: 'invalid request' } }" : '{ usage: { completion_tokens: 1 } }'}, { status: ${mode === 'failure' ? 400 : 200} });
};
`);
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = spawnSync(process.execPath, [
        '--import', pathToFileURL(mock).href, join(root, 'scripts/probe.mjs'),
        '--write', '--only=iteracompute', ...(mode === 'auth-only' ? ['--auth-only'] : []),
      ], { env: { PATH: process.env.PATH, ITERACOMPUTE_API_KEY: 'fake-test-key' }, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      const updated = JSON.parse(readFileSync(file, 'utf8')).providers[0];
      assert.deepEqual(updated.models_free, provider.models_free);
      assert.equal(updated.probe_status, mode === 'auth-only' ? 'auth-ok' : mode === 'failure' ? 'error' : 'live');
    }
    if (mode !== 'auth-only')
      assert.deepEqual(readFileSync(requests, 'utf8').trim().split('\n').map(JSON.parse), [provider.models_free[0], provider.models_free[0]]);
  });
}
