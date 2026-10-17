import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeTmpDir } from './lib/tmp.mjs';
import { publishableClientConfigs, openaiClients, litellmYaml } from './lib/client-config.mjs';
import { serialize } from './_serialize.mjs';
import { KEY_HOSTS, keyHostError } from './lib/key-hosts.mjs';

const data = JSON.parse(readFileSync(new URL('../data/providers.json', import.meta.url), 'utf8'));

test('every provider with a key and a base URL in the dataset is pinned to its own host', () => {
  const keyed = data.providers.filter((p) => p.env_key && p.openai_base_url);
  assert.ok(keyed.length > 0);
  for (const p of keyed) assert.equal(keyHostError(p), null, p.slug);
});

test('an entry that reuses a pinned env_key with another host is refused', () => {
  const [key, host] = Object.entries(KEY_HOSTS)[0];
  assert.match(keyHostError({ env_key: key, openai_base_url: 'https://collector.example/v1' }), /may only be sent to/);
  assert.equal(keyHostError({ env_key: key, openai_base_url: `https://${host}/v1` }), null);
});

test('a lookalike host is refused: the match is exact, never by prefix or suffix', () => {
  const [key, host] = Object.entries(KEY_HOSTS)[0];
  for (const bad of [`https://${host}.collector.example/v1`, `https://x${host}/v1`, `https://${host.split('.').slice(1).join('.')}/v1`])
    assert.notEqual(keyHostError({ env_key: key, openai_base_url: bad }), null, bad);
});

test('a key that is not pinned, plain http and credentials in the URL are refused', () => {
  const [key, host] = Object.entries(KEY_HOSTS)[0];
  assert.match(keyHostError({ env_key: 'NEW_PROVIDER_API_KEY', openai_base_url: 'https://api.new.example/v1' }), /not pinned/);
  assert.match(keyHostError({ env_key: key, openai_base_url: `http://${host}/v1` }), /not https/);
  assert.match(keyHostError({ env_key: key, openai_base_url: `https://u:p@${host}/v1` }), /credentials/);
});

// Behaviour, not text: run each script that sends a key against a copy of the repository whose dataset points a pinned key at another
// host, with every fetch of the child diverted to a local listener (nothing leaves the machine), and count the requests that arrive
// with an Authorization header. A script that calls the check and ignores it fails here.
async function keysSentToACollector(script, provider, { moveHost = true } = {}) {
  let withAuth = 0;
  const server = http.createServer((req, res) => {
    if (req.headers.authorization) withAuth++;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"data":[]}');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const root = makeTmpDir('flah-keyhost-');
  for (const name of ['probe.mjs', 'fetch-models.mjs', '_serialize.mjs', 'lib/key-hosts.mjs'])
    cpSync(new URL(name, import.meta.url), join(root, 'scripts', name));
  mkdirSync(join(root, 'data'));
  const providers = moveHost ? data.providers.map((p) => (p.slug === provider.slug ? { ...p, openai_base_url: 'https://collector.example/v1' } : p)) : data.providers;
  writeFileSync(join(root, 'data', 'providers.json'), serialize({ ...data, providers }));
  const divert = join(root, 'divert.mjs');
  writeFileSync(divert, `const real = globalThis.fetch;\nglobalThis.fetch = (url, opts) => real('http://127.0.0.1:${server.address().port}/', opts);\n`);
  const child = spawn(process.execPath, ['--import', pathToFileURL(divert).href, join(root, 'scripts', script), '--auth-only', `--only=${provider.slug}`],
    { env: { PATH: process.env.PATH, [provider.env_key]: 'fake-key-for-the-test' }, stdio: 'ignore' });
  await new Promise((resolve) => child.on('exit', resolve));
  await new Promise((resolve) => server.close(resolve));
  return withAuth;
}

test('the probe does not send a pinned key to a host read from the dataset', async () => {
  const groq = data.providers.find((p) => p.slug === 'groq');
  assert.equal(await keysSentToACollector('probe.mjs', groq), 0);
});

test('the harness sees the key when the host is the pinned one, so a 0 above is never a silent harness', async () => {
  const groq = data.providers.find((p) => p.slug === 'groq');
  assert.ok(await keysSentToACollector('probe.mjs', groq, { moveHost: false }) >= 1);
  assert.ok(await keysSentToACollector('fetch-models.mjs', groq, { moveHost: false }) >= 1);
});

test('fetch-models does not send a pinned key to a host read from the dataset', async () => {
  const groq = data.providers.find((p) => p.slug === 'groq');
  assert.equal(await keysSentToACollector('fetch-models.mjs', groq), 0);
});

// The dataset gate: a data change that moves a pinned key's base URL to another host fails the required check, so it cannot be merged;
// that is what keeps such a host out of the client configs that tell users where to send their own key.
test('the dataset check fails when a pinned key points at another host', () => {
  const root = makeTmpDir('flah-keyhost-validate-');
  const moved = { ...data, providers: data.providers.map((p) => (p.slug === 'groq' ? { ...p, openai_base_url: 'https://collector.example/v1' } : p)) };
  const file = join(root, 'providers.json');
  writeFileSync(file, serialize(moved));
  const run = spawnSync(process.execPath, [new URL('./validate.mjs', import.meta.url).pathname, file], { encoding: 'utf8' });
  assert.notEqual(run.status, 0);
  assert.ok(`${run.stdout}${run.stderr}`.includes('groq: GROQ_API_KEY may only be sent to'), 'the failure names the provider and the pinned host');
  const clean = spawnSync(process.execPath, [new URL('./validate.mjs', import.meta.url).pathname], { encoding: 'utf8' });
  assert.equal(clean.status, 0, 'the committed dataset passes');
});

// The build publishes the client configs only through publishableClientConfigs: with a key moved to another host it refuses,
// and with the committed dataset it returns exactly what openaiClients and litellmYaml produce.
test('the published client configs refuse a key that points at a host that is not pinned', () => {
  const moved = data.providers.map((p) => (p.slug === 'groq' ? { ...p, openai_base_url: 'https://collector.example/v1' } : p));
  assert.throws(() => publishableClientConfigs({ version: data.version, generated: data.generated, providers: moved }), /groq: GROQ_API_KEY may only be sent to/);
});

test('with the committed dataset the published client configs are unchanged', () => {
  const args = { version: data.version, generated: data.generated, providers: data.providers };
  const out = publishableClientConfigs(args);
  assert.deepEqual(out.clients, openaiClients(data.providers));
  assert.equal(out.yaml, litellmYaml(args));
});
