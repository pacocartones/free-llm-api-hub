#!/usr/bin/env node
// stdio entry point. Usage:
//   free-llm-api-hub-mcp [--data <providers.json>] [--clients <openai-clients.json>] [--status <status.json>]
// FLAH_DATA / FLAH_CLIENTS / FLAH_STATUS do the same as the flags. Without them, each file
// is fetched once from the static API and cached in memory.

import { parseArgs } from 'node:util';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createClientsLoader, createLoader, createStatusLoader, DEFAULT_CLIENTS_URL, DEFAULT_STATUS_URL, DEFAULT_URL } from './data.js';
import { createServer } from './server.js';

const { values } = parseArgs({
  options: {
    data: { type: 'string' },
    clients: { type: 'string' },
    status: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  },
});

if (values.help) {
  process.stderr.write(
    'free-llm-api-hub-mcp: MCP server (stdio) over the free-llm-api-hub dataset.\n' +
      '  --data <path>   read a local providers.json instead of fetching\n' +
      `                  ${DEFAULT_URL}\n` +
      '  FLAH_DATA=<path> same as --data\n' +
      '  --clients <path> read a local openai-clients.json instead of fetching\n' +
      `                  ${DEFAULT_CLIENTS_URL}\n` +
      '  FLAH_CLIENTS=<path> same as --clients\n' +
      '  --status <path> read a local status.json instead of fetching\n' +
      `                  ${DEFAULT_STATUS_URL}\n` +
      '  FLAH_STATUS=<path> same as --status\n',
  );
  process.exit(0);
}

const dataPath = values.data ?? process.env.FLAH_DATA ?? undefined;
const clientsPath = values.clients ?? process.env.FLAH_CLIENTS ?? undefined;
const statusPath = values.status ?? process.env.FLAH_STATUS ?? undefined;
// A local providers.json is not graded with the published status.json: the two would come from different builds.
const freshness = !dataPath || !!statusPath;
const server = createServer(
  createLoader({ dataPath }),
  createClientsLoader({ clientsPath }),
  createStatusLoader({ statusPath }),
  { freshness },
);
await server.connect(new StdioServerTransport());
