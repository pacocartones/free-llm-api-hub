// End to end: spawn the server over stdio with the SDK client, list the tools
// and call three of them against the fixtures (no network).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const SERVER = fileURLToPath(new URL('../src/index.js', import.meta.url));
const FIXTURE = fileURLToPath(new URL('./fixtures/providers.json', import.meta.url));
const CLIENTS = fileURLToPath(new URL('./fixtures/openai-clients.json', import.meta.url));

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
    'dataset_info', 'get_provider', 'openai_client_config', 'search_providers',
  ]);
  for (const tool of tools) {
    assert.match(tool.description, /terms change/, `${tool.name} description must warn that terms change`);
    assert.match(tool.description, /authoritative/, `${tool.name} description must say docs are authoritative`);
    assert.match(tool.description, /not confirmed/, `${tool.name} description must explain null`);
  }
  const search = tools.find((x) => x.name === 'search_providers');
  assert.ok(search.inputSchema.properties.no_card);

  const res = await client.callTool({ name: 'search_providers', arguments: { no_card: true } });
  assert.equal(res.isError, undefined);
  const body = JSON.parse(res.content[0].text);
  assert.deepEqual(body.providers.map((p) => p.slug).sort(), ['alpha-ai', 'delta-free']);

  const cfg = await client.callTool({ name: 'openai_client_config', arguments: { slug: 'alpha-ai' } });
  assert.equal(cfg.isError, undefined);
  const cfgBody = JSON.parse(cfg.content[0].text);
  assert.equal(cfgBody.env_var, 'ALPHA_PUBLISHED_KEY');
  assert.equal(cfgBody.base_url, 'https://api.alpha.example/openai/v1');

  const bad = await client.callTool({ name: 'get_provider', arguments: { slug: 'nope' } });
  assert.equal(bad.isError, true);
  assert.match(bad.content[0].text, /Unknown provider slug "nope"/);
});
