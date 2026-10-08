// Dataset loading: the static API by default, or a local providers.json.
// The dataset is read once per process and kept in memory.

import { readFile } from 'node:fs/promises';

export const DEFAULT_URL = 'https://freellmapihub.com/api/v1/providers.json';

/**
 * Validate the minimal shape the tools rely on and drop operational fields.
 * `env_key` is stripped from every public output of the project; a local copy
 * of data/providers.json still carries it, so it is removed here too.
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

/**
 * Returns a loader function that resolves the dataset once and caches it.
 * A failed load is not cached, so a later call can retry.
 */
export function createLoader({ dataPath, url = DEFAULT_URL, fetchImpl = globalThis.fetch } = {}) {
  let cached = null;
  return async function load() {
    if (cached) return cached;
    const pending = (async () => {
      if (dataPath) {
        const text = await readFile(dataPath, 'utf8');
        return normalizeDataset(JSON.parse(text), dataPath);
      }
      const res = await fetchImpl(url, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`GET ${url} answered HTTP ${res.status}`);
      return normalizeDataset(await res.json(), url);
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
