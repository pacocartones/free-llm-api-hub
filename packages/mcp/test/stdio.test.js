// End to end: spawn the server over stdio with the SDK client, list the tools
// and call them against the fixtures (no network).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const SERVER = fileURLToPath(new URL('../src/index.js', import.meta.url));
const FIXTURE = fileURLToPath(new URL('./fixtures/providers.json', import.meta.url));
const CLIENTS = fileURLToPath(new URL('./fixtures/openai-clients.json', import.meta.url));
const STATUS = fileURLToPath(new URL('./fixtures/status.json', import.meta.url));

test('stdio server lists its tools and answers calls', async (t) => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER, '--data', FIXTURE],
    // The clients file comes in through the environment variable, so both override paths are exercised.
    env: { ...process.env, FLAH_CLIENTS: CLIENTS },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'flah-mcp-test', version: '0.0.0' });
  await client.connect(transport);
  t.after(() => client.close());

  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((x) => x.name).sort(), [
    'dataset_info', 'get_provider', 'get_provider_status', 'is_free', 'openai_client_config', 'search_providers',
  ]);
  for (const tool of tools) {
    assert.equal(tool.annotations.openWorldHint, true, `${tool.name} can fetch external static JSON`);
    assert.equal(tool.annotations.readOnlyHint, true);
    assert.equal(tool.annotations.idempotentHint, true);
    assert.match(tool.description, /terms change/, `${tool.name} description must warn that terms change`);
    assert.match(tool.description, /authoritative/, `${tool.name} description must say docs are authoritative`);
    assert.match(tool.description, /not confirmed/, `${tool.name} description must explain null`);
  }
  const search = tools.find((x) => x.name === 'search_providers');
  assert.ok(search.inputSchema.properties.no_card);

  const info = await client.callTool({ name: 'dataset_info', arguments: {} });
  assert.equal(info.isError, undefined);
  const infoBody = JSON.parse(info.content[0].text);
  assert.equal(infoBody.source, 'local_override');
  assert.equal(info.content[0].text.includes(FIXTURE), false);

  const res = await client.callTool({ name: 'search_providers', arguments: { no_card: true } });
  assert.equal(res.isError, undefined);
  const body = JSON.parse(res.content[0].text);
  assert.deepEqual(body.providers.map((p) => p.slug).sort(), ['alpha-ai', 'delta-free']);

  const cfg = await client.callTool({ name: 'openai_client_config', arguments: { slug: 'alpha-ai' } });
  assert.equal(cfg.isError, undefined);
  const cfgBody = JSON.parse(cfg.content[0].text);
  assert.equal(cfgBody.env_var, 'ALPHA_PUBLISHED_KEY');
  assert.equal(cfgBody.base_url, 'https://api.alpha.example/openai/v1');

  const invalid = await client.callTool({ name: 'search_providers', arguments: { modality: 'unsupported' } });
  assert.equal(invalid.isError, true, 'invalid tool input is rejected by the MCP schema');

  const bad = await client.callTool({ name: 'get_provider', arguments: { slug: 'nope' } });
  assert.equal(bad.isError, true);
  assert.match(bad.content[0].text, /Unknown provider slug "nope"/);

  // A local providers.json without a local status.json is never graded with the published status.json.
  const plain = JSON.parse((await client.callTool({ name: 'get_provider', arguments: { slug: 'alpha-ai' } })).content[0].text);
  assert.equal('freshness' in plain, false);
  const free = JSON.parse((await client.callTool({ name: 'is_free', arguments: { slug: 'beta-cloud' } })).content[0].text);
  assert.match(free.answer, /^Not permanently\. Beta Cloud gives a one-time trial credit/);
  assert.equal('freshness' in free, false);
});

test('stdio server reads a local status.json for get_provider_status and the freshness field', async (t) => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER, '--data', FIXTURE, '--clients', CLIENTS],
    env: { ...process.env, FLAH_STATUS: STATUS },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'flah-mcp-test', version: '0.0.0' });
  await client.connect(transport);
  t.after(() => client.close());

  const all = await client.callTool({ name: 'get_provider_status', arguments: {} });
  assert.equal(all.isError, undefined);
  const allBody = JSON.parse(all.content[0].text);
  assert.equal(allBody.count, 4);
  assert.deepEqual(allBody.counts, { fresh: 2, due: 0, stale: 1, unverified: 1, free_now: 2 });

  const one = JSON.parse((await client.callTool({ name: 'get_provider_status', arguments: { slug: 'gamma-labs' } })).content[0].text);
  assert.equal(one.free_now, false);
  assert.equal(one.last_change, '2026-08-20');

  const search = JSON.parse((await client.callTool({ name: 'search_providers', arguments: { no_card: true } })).content[0].text);
  assert.deepEqual(search.providers.map((p) => [p.slug, p.freshness]).sort(), [['alpha-ai', 'fresh'], ['delta-free', 'unverified']]);
  assert.equal(search.freshness_source.generated_at, '2026-10-01');

  const unknown = await client.callTool({ name: 'get_provider_status', arguments: { slug: 'alpha' } });
  assert.equal(unknown.isError, true);
  assert.match(unknown.content[0].text, /Did you mean: alpha-ai/);
});

test('stdio server redacts local loader errors', async (t) => {
  const missingPath = fileURLToPath(new URL('./fixtures/private/missing-providers.json', import.meta.url));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER, '--data', missingPath],
    env: { ...process.env },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'flah-mcp-test', version: '0.0.0' });
  await client.connect(transport);
  t.after(() => client.close());

  const res = await client.callTool({ name: 'dataset_info', arguments: {} });
  assert.equal(res.isError, true);
  assert.equal(res.content[0].text, 'Could not load the dataset.');
  assert.doesNotMatch(res.content[0].text, /private|missing-providers/);
});
