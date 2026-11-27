// MCP wiring: registers the six tools on an McpServer.

import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import {
  CATEGORIES,
  MODALITIES,
  ToolError,
  datasetInfo,
  getProviderStatus,
  getProviderWithStatus,
  isFree,
  openaiClientConfig,
  searchProvidersWithStatus,
} from './tools.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const TERMS =
  "Free-tier terms change without notice: the provider's own docs (docs_url, returned with every result) " +
  'are authoritative, and last_verified says when the entry was last checked against them. ' +
  'Tri-state fields are true / false / null, and null means "not confirmed", never "no".';

const READ_ONLY = { readOnlyHint: true, openWorldHint: true, idempotentHint: true };

function ok(value) {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

function fail(err) {
  const message = err instanceof ToolError ? err.message : 'Could not load the dataset.';
  return { isError: true, content: [{ type: 'text', text: message }] };
}

/**
 * `loadStatus` reads status.json. `freshness: false` keeps provider results free of the status.json freshness grade
 * (used when providers.json is a local file and status.json is not, so the two never mix builds);
 * get_provider_status still reads status.json.
 */
export function createServer(load, loadClients, loadStatus = null, { freshness = true } = {}) {
  const server = new McpServer({ name: pkg.name, version: pkg.version });

  // The freshness grade is optional enrichment: a missing or failing status.json never fails a provider tool.
  const optionalStatus = async () => {
    if (!freshness || !loadStatus) return null;
    try {
      return await loadStatus();
    } catch {
      return null;
    }
  };

  const run = (fn) => async (args) => {
    try {
      const [data, status] = await Promise.all([load(), optionalStatus()]);
      return ok(fn(data, args ?? {}, status));
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
        '(slug, name, category, free_tier, rate_limits, docs_url, last_verified, verified and, when status.json is available, ' +
        'freshness: fresh / due / stale / unverified against the 60/90-day SLA). ' +
        'The flag filters match only explicitly confirmed values: providers whose value is null ' +
        '(not confirmed) are left out and counted in excluded_unconfirmed, and in excluded_unconfirmed_by_reason by why the value is unknown. ' +
        TERMS,
      inputSchema: {
        query: z.string().max(200).optional().describe('Words to match in name, slug, free tier, rate limits, notes or sampled model IDs (all words must match, case-insensitive).'),
        modality: z.enum(MODALITIES).optional().describe('Only providers offering this modality on the free tier.'),
        category: z.enum(CATEGORIES).optional().describe('"ongoing" (free tier that keeps going) or "trial" (one-off credit).'),
        no_card: z.boolean().optional().describe('true: only providers confirmed NOT to require a credit card. false: only providers confirmed to require one.'),
        no_phone: z.boolean().optional().describe('true: only providers confirmed NOT to require a phone number. false: only those confirmed to require one.'),
        commercial_ok: z.boolean().optional().describe('true: only providers whose free tier is confirmed to allow commercial use. false: only those confirmed not to.'),
        openai_compatible: z.boolean().optional().describe('true: only providers confirmed OpenAI-compatible. false: only those confirmed not to be.'),
      },
      annotations: READ_ONLY,
    },
    run((data, args, status) => searchProvidersWithStatus(data, args, status)),
  );

  server.registerTool(
    'get_provider',
    {
      title: 'Get one provider entry',
      description:
        'Return the full dataset entry for one provider by slug, with its tri-state flags spelled out ' +
        '(yes / no / not confirmed), the list of unconfirmed fields and, in unconfirmed_reasons, why each is unknown, ' +
        'plus its freshness grade from status.json when available. An unknown slug is an error. ' +
        TERMS,
      inputSchema: {
        slug: z.string().max(100).describe('Provider slug, e.g. "groq" (see search_providers).'),
      },
      annotations: READ_ONLY,
    },
    run((data, args, status) => getProviderWithStatus(data, args, status)),
  );

  server.registerTool(
    'openai_client_config',
    {
      title: 'OpenAI client config for a provider',
      description:
        'For a provider listed in the published openai-clients.json (verified, OpenAI-compatible, with a base URL): ' +
        'return its base_url, the API-key environment variable name published there (env_key), and Python and ' +
        'JavaScript chat snippets only when free text/chat access is confirmed and modalities are limited to text/vision; otherwise returns configuration and official docs without guessing an endpoint. For any other provider, explains why no drop-in config ' +
        'is offered (not verified, not OpenAI-compatible or not confirmed, or no base URL). ' +
        TERMS,
      inputSchema: {
        slug: z.string().max(100).describe('Provider slug.'),
        model: z.string().max(200).optional().describe('Model ID to put in the snippet. Use a free chat model from the official docs. Defaults to a sampled model only for text/vision-only providers; mixed or unknown modalities receive no request snippet.'),
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

  server.registerTool(
    'get_provider_status',
    {
      title: 'Provider freshness status',
      description:
        'Freshness of one provider (by slug) or of every provider (no slug), from the published status.json: ' +
        'last_verified, oldest_field_check, freshness (fresh / due / stale / unverified against the 60/90-day SLA, graded at generated_at), ' +
        'free_now (true / false / null, where null means not confirmed; not a live check) and last_change. ' +
        'Without a slug it also counts providers per state. An unknown slug is an error. ' +
        TERMS,
      inputSchema: {
        slug: z.string().max(100).optional().describe('Provider slug, e.g. "groq". Omit for every provider.'),
      },
      annotations: READ_ONLY,
    },
    async (args) => {
      try {
        if (!loadStatus) throw new ToolError('status.json is not configured for this server.');
        return ok(getProviderStatus(await loadStatus(), args ?? {}));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    'is_free',
    {
      title: 'Is <provider> free?',
      description:
        'Answer "Is <provider> API free?" with the same sentence as the provider page on the site: ongoing free tier or one-time trial credit, ' +
        'the published limits (or the free-tier wording), credit card, phone verification, commercial use and the day the entry was verified. ' +
        'A field the dataset leaves null reads "not stated", never a guess. Each fact comes with source_date (the day its source was read) and source_url; ' +
        'freshness and free_now from status.json are added when available. An unknown slug is an error. ' +
        TERMS,
      inputSchema: {
        slug: z.string().max(100).describe('Provider slug, e.g. "groq" (see search_providers).'),
      },
      annotations: READ_ONLY,
    },
    run((data, args, status) => isFree(data, args, status)),
  );

  return server;
}
