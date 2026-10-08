// Dataset loading: the static API by default, or local files.
// Each file is read once per process and kept in memory.

import { readFile } from 'node:fs/promises';

export const API_BASE = 'https://freellmapihub.com/api/v1';
export const DEFAULT_URL = `${API_BASE}/providers.json`;
export const DEFAULT_CLIENTS_URL = `${API_BASE}/openai-clients.json`;

/**
 * Validate the minimal shape the tools rely on and drop operational fields.
 * The API strips `env_key` from providers.json; a local copy of the
 * repository's data/providers.json still carries it, so it is removed here
 * too. The key-variable NAME is taken from openai-clients.json instead, the
 * one file the project publishes it in.
 */
export function normalizeDataset(raw, origin) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.providers)) {
    throw new Error(`${origin}: not a free-llm-api-hub providers.json (no "providers" array)`);
  }
  const providers = raw.providers.map((p) => {
    if (!p || typeof p.slug !== 'string' || typeof p.name !== 'string') {
      throw new Error(`${origin}: provider entry without slug/name`);
    }
    const { env_key, ...rest } = p;
    return rest;
  });
  return {
    version: raw.version ?? null,
    generated: raw.generated ?? null,
    homepage: raw.homepage ?? 'https://freellmapihub.com/',
    source: origin,
    providers,
  };
}

/** Shape check for openai-clients.json: { version, generated, clients: [...] }. */
export function normalizeClients(raw, origin) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.clients)) {
    throw new Error(`${origin}: not a free-llm-api-hub openai-clients.json (no "clients" array)`);
  }
  for (const c of raw.clients) {
    if (!c || typeof c.slug !== 'string' || typeof c.base_url !== 'string' || typeof c.env_key !== 'string') {
      throw new Error(`${origin}: client entry without slug/base_url/env_key`);
    }
  }
  return {
    version: raw.version ?? null,
    generated: raw.generated ?? null,
    source: origin,
    clients: raw.clients,
  };
}

/**
 * Returns a loader that resolves one JSON file once and caches it, from a
 * local path when given, otherwise from the URL. A failed load is not
 * cached, so a later call can retry.
 */
export function createJsonLoader({ path, url, normalize, fetchImpl = globalThis.fetch }) {
  let cached = null;
  return async function load() {
    if (cached) return cached;
    const pending = (async () => {
      if (path) {
        const text = await readFile(path, 'utf8');
        return normalize(JSON.parse(text), path);
      }
      const res = await fetchImpl(url, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`GET ${url} answered HTTP ${res.status}`);
      return normalize(await res.json(), url);
    })();
    cached = pending;
    try {
      return await pending;
    } catch (err) {
      cached = null;
      throw err;
    }
  };
}

/** providers.json loader (--data / FLAH_DATA). */
export function createLoader({ dataPath, url = DEFAULT_URL, fetchImpl } = {}) {
  return createJsonLoader({ path: dataPath, url, normalize: normalizeDataset, fetchImpl });
}

/** openai-clients.json loader (--clients / FLAH_CLIENTS). */
export function createClientsLoader({ clientsPath, url = DEFAULT_CLIENTS_URL, fetchImpl } = {}) {
  return createJsonLoader({ path: clientsPath, url, normalize: normalizeClients, fetchImpl });
}
