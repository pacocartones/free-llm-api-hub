#!/usr/bin/env node
// stdio entry point. Usage: free-llm-api-hub-mcp [--data <path/to/providers.json>]
// FLAH_DATA=<path> does the same as --data. Without either, the dataset is
// fetched once from the static API and cached in memory.

import { parseArgs } from 'node:util';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createLoader, DEFAULT_URL } from './data.js';
import { createServer } from './server.js';

const { values } = parseArgs({
  options: {
    data: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  },
});

if (values.help) {
  process.stderr.write(
    'free-llm-api-hub-mcp: MCP server (stdio) over the free-llm-api-hub dataset.\n' +
      '  --data <path>   read a local providers.json instead of fetching\n' +
      `                  ${DEFAULT_URL}\n` +
      '  FLAH_DATA=<path> same as --data\n',
  );
  process.exit(0);
}

const dataPath = values.data ?? process.env.FLAH_DATA ?? undefined;
const server = createServer(createLoader({ dataPath }));
await server.connect(new StdioServerTransport());
