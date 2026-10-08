// MCP wiring: registers the four tools on an McpServer.

import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import {
  CATEGORIES,
  MODALITIES,
  ToolError,
  datasetInfo,
  getProvider,
  openaiClientConfig,
  searchProviders,
} from './tools.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const TERMS =
  "Free-tier terms change without notice: the provider's own docs (docs_url, returned with every result) " +
  'are authoritative, and last_verified says when the entry was last checked against them. ' +
  'Tri-state fields are true / false / null, and null means "not confirmed", never "no".';

const READ_ONLY = { readOnlyHint: true, openWorldHint: false, idempotentHint: true };

function ok(value) {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

function fail(err) {
  const message = err instanceof ToolError ? err.message : `Could not load the dataset: ${err.message}`;
  return { isError: true, content: [{ type: 'text', text: message }] };
}

export function createServer(load, loadClients) {
  const server = new McpServer({ name: pkg.name, version: pkg.version });

  const run = (fn) => async (args) => {
    try {
      return ok(fn(await load(), args ?? {}));
    } catch (err) {
      return fail(err);
    }
  };

  server.registerTool(
    'search_providers',
    {
      title: 'Search free LLM API providers',
      description:
        'Search the free-llm-api-hub dataset of free-tier and trial-credit LLM API providers. ' +
        'All filters are optional and combine with AND. Returns a compact list ' +
        '(slug, name, category, free_tier, rate_limits, docs_url, last_verified, verified). ' +
        'The flag filters match only explicitly confirmed values: providers whose value is null ' +
        '(not confirmed) are left out and counted in excluded_unconfirmed. ' +
        TERMS,
      inputSchema: {
        query: z.string().optional().describe('Words to match in name, slug, free tier, rate limits, notes or sampled model IDs (all words must match, case-insensitive).'),
        modality: z.enum(MODALITIES).optional().describe('Only providers offering this modality on the free tier.'),
        category: z.enum(CATEGORIES).optional().describe('"ongoing" (free tier that keeps going) or "trial" (one-off credit).'),
        no_card: z.boolean().optional().describe('true: only providers confirmed NOT to require a credit card. false: only providers confirmed to require one.'),
        no_phone: z.boolean().optional().describe('true: only providers confirmed NOT to require a phone number. false: only those confirmed to require one.'),
        commercial_ok: z.boolean().optional().describe('true: only providers whose free tier is confirmed to allow commercial use. false: only those confirmed not to.'),
        openai_compatible: z.boolean().optional().describe('true: only providers confirmed OpenAI-compatible. false: only those confirmed not to be.'),
      },
      annotations: READ_ONLY,
    },
    run((data, args) => searchProviders(data, args)),
  );

  server.registerTool(
    'get_provider',
    {
      title: 'Get one provider entry',
      description:
        'Return the full dataset entry for one provider by slug, with its tri-state flags spelled out ' +
        '(yes / no / not confirmed) and the list of unconfirmed fields. An unknown slug is an error. ' +
        TERMS,
      inputSchema: {
        slug: z.string().describe('Provider slug, e.g. "groq" (see search_providers).'),
      },
      annotations: READ_ONLY,
    },
    run((data, args) => getProvider(data, args)),
  );

  server.registerTool(
    'openai_client_config',
    {
      title: 'OpenAI client config for a provider',
      description:
        'For a provider listed in the published openai-clients.json (verified, OpenAI-compatible, with a base URL): ' +
        'return its base_url, the API-key environment variable name published there (env_key), and Python and ' +
        'JavaScript snippets using the official openai SDK. For any other provider, explains why no drop-in config ' +
        'is offered (not verified, not OpenAI-compatible or not confirmed, or no base URL). ' +
        TERMS,
      inputSchema: {
        slug: z.string().describe('Provider slug.'),
        model: z.string().optional().describe('Model ID to put in the snippet. Defaults to the first sampled free model, which may be out of date.'),
      },
      annotations: READ_ONLY,
    },
    async (args) => {
      try {
        const [data, clients] = await Promise.all([load(), loadClients()]);
        return ok(openaiClientConfig(data, clients, args ?? {}));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    'dataset_info',
    {
      title: 'Dataset version and freshness',
      description:
        'Version and generation date of the dataset, provider counts, and freshness ' +
        '(oldest, median and newest last_verified, never-verified count, and the oldest entries with their docs_url). ' +
        TERMS,
      inputSchema: {},
      annotations: READ_ONLY,
    },
    run((data) => datasetInfo(data)),
  );

  return server;
}
