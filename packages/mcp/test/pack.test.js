// Distribution boundary: install the actual npm archive outside the checkout and
// speak MCP to its installed CLI. Dependency installation needs registry access;
// all tool calls use local fixtures and never call a provider API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const pkg = read(join(root, 'package.json'));
const manifest = read(join(root, 'server.json'));
const lock = read(join(root, 'package-lock.json'));
const npm = (args, cwd) => execFileSync('npm', args, { cwd, encoding: 'utf8', timeout: 120_000, stdio: ['ignore', 'pipe', 'pipe'] });

test('public npm metadata agrees with the lockfile and Registry manifest', () => {
  assert.notEqual(pkg.private, true, 'the release package must be publishable');
  assert.equal(pkg.publishConfig.access, 'public');
  assert.equal(pkg.publishConfig.provenance, true);
  assert.equal(pkg.version, lock.version);
  assert.equal(pkg.version, lock.packages[''].version);
  assert.equal(pkg.name, lock.packages[''].name);
  assert.equal(pkg.mcpName, manifest.name);
  assert.equal(pkg.version, manifest.version);
  assert.equal(pkg.name, manifest.packages[0].identifier);
  assert.equal(pkg.version, manifest.packages[0].version);
});

test('npm tarball installs a working read-only stdio CLI outside the checkout', { timeout: 150_000 }, async () => {
  const temp = mkdtempSync(join(tmpdir(), 'flah-npm-'));
  let client;
  try {
    const destination = process.env.MCP_PACK_DIR ? resolve(process.env.MCP_PACK_DIR) : join(temp, 'archive');
    mkdirSync(destination, { recursive: true });
    const [packed] = JSON.parse(npm(['pack', '--ignore-scripts', '--json', '--pack-destination', destination], root));
    assert.deepEqual(packed.files.map((f) => f.path).sort(), [
      'LICENSE', 'README.md', 'package.json', 'server.json',
      'src/data.js', 'src/index.js', 'src/server.js', 'src/tools.js',
    ]);
    const consumer = join(temp, 'consumer');
    mkdirSync(consumer);
    npm(['install', '--prefix', consumer, '--ignore-scripts', '--omit=dev', '--no-audit', '--no-fund', join(destination, packed.filename)], consumer);
    const installed = join(consumer, 'node_modules', pkg.name);
    assert.equal(read(join(installed, 'package.json')).mcpName, 'io.github.pacocartones/free-llm-api-hub');
    assert.equal(read(join(installed, 'server.json')).name, pkg.mcpName);
    // Resolve the installed executable as npm would, without importing checkout source.
    const bin = join(consumer, 'node_modules', '.bin', 'free-llm-api-hub-mcp');
    const help = execFileSync(bin, ['--help'], { cwd: consumer, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    assert.equal(help, '', 'stdio stdout is reserved for protocol messages');
    client = new Client({ name: 'installed-package-test', version: '1.0.0' });
    await client.connect(new StdioClientTransport({ command: bin, cwd: consumer,
      args: ['--data', join(root, 'test/fixtures/providers.json'), '--clients', join(root, 'test/fixtures/openai-clients.json')], stderr: 'pipe' }));
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), ['dataset_info', 'get_provider', 'openai_client_config', 'search_providers']);
    for (const tool of tools) {
      assert.equal(tool.annotations.readOnlyHint, true);
      assert.equal(tool.annotations.openWorldHint, true);
    }
    const info = await client.callTool({ name: 'dataset_info', arguments: {} });
    assert.equal(info.isError, undefined);
    assert.equal(JSON.parse(info.content[0].text).source, 'local_override');
    const config = await client.callTool({ name: 'openai_client_config', arguments: { slug: 'alpha-ai' } });
    assert.equal(config.isError, undefined);
    assert.equal(JSON.parse(config.content[0].text).env_var, 'ALPHA_PUBLISHED_KEY');
  } finally {
    if (client) await client.close();
    rmSync(temp, { recursive: true, force: true });
  }
});
