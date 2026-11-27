// Dataset loading: the static API by default, or local files.
// Each file is read once per process and kept in memory.

import { readFile } from 'node:fs/promises';

export const API_BASE = 'https://freellmapihub.com/api/v1';
export const DEFAULT_URL = `${API_BASE}/providers.json`;
export const DEFAULT_CLIENTS_URL = `${API_BASE}/openai-clients.json`;
export const DEFAULT_STATUS_URL = `${API_BASE}/status.json`;
const LOCAL_SOURCE = 'local_override';
const DEFAULT_TIMEOUT_MS = 20_000;
// The published providers.json is a few hundred kilobytes; a body far beyond
// that is not the dataset and must not be buffered into memory.
export const MAX_REMOTE_BYTES = 8 * 1024 * 1024;

/** Reads a fetch Response as JSON, failing once its body exceeds maxBytes. */
export async function readBoundedJson(res, maxBytes = MAX_REMOTE_BYTES) {
  const tooLarge = () => new Error(`remote JSON exceeds the ${maxBytes}-byte limit`);
  const declared = res.headers?.get?.('content-length')?.trim() || '';
  if (/^\d+$/.test(declared) && Number(declared) > maxBytes) {
    try { res.body?.cancel()?.catch(() => {}); } catch { /* already abandoned */ }
    throw tooLarge();
  }
  // Responses without a readable stream (minimal fetch implementations) fall back to json().
  if (!res.body || typeof res.body.getReader !== 'function') return res.json();
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        try { reader.cancel()?.catch(() => {}); } catch { /* report the limit regardless */ }
        throw tooLarge();
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(text);
}

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
    return { ...rest, commercial_ok: rest.commercial_ok === 'conditional' ? null : rest.commercial_ok };
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

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const STATUS_FRESHNESS = ['fresh', 'due', 'stale', 'unverified'];
const isoOrNull = (v) => (typeof v === 'string' && ISO_DAY.test(v) ? v : null);

/**
 * Shape check for status.json (contract v1): { generated_at, sla, providers: { <slug>: {...} } }.
 * Only the documented fields are kept; fields added later within v1 are ignored, and an unknown
 * freshness value reads as null rather than being guessed.
 */
export function normalizeStatus(raw, origin) {
  if (!raw || typeof raw !== 'object' || !raw.providers || typeof raw.providers !== 'object' || Array.isArray(raw.providers)) {
    throw new Error(`${origin}: not a free-llm-api-hub status.json (no "providers" object)`);
  }
  const providers = {};
  for (const [slug, e] of Object.entries(raw.providers)) {
    if (!e || typeof e !== 'object') throw new Error(`${origin}: status entry "${slug}" is not an object`);
    providers[slug] = {
      last_verified: isoOrNull(e.last_verified),
      oldest_field_check: isoOrNull(e.oldest_field_check),
      freshness: STATUS_FRESHNESS.includes(e.freshness) ? e.freshness : null,
      free_now: typeof e.free_now === 'boolean' ? e.free_now : null,
      last_change: isoOrNull(e.last_change),
    };
  }
  const sla = raw.sla && typeof raw.sla === 'object' ? raw.sla : {};
  return {
    version: raw.version ?? null,
    generated_at: isoOrNull(raw.generated_at) ?? isoOrNull(raw.generated),
    schema_version: raw.schema_version ?? null,
    sla: {
      due_after_days: Number.isInteger(sla.due_after_days) ? sla.due_after_days : null,
      stale_after_days: Number.isInteger(sla.stale_after_days) ? sla.stale_after_days : null,
    },
    source: origin,
    providers,
  };
}

/**
 * Returns a loader that resolves one JSON file once and caches it, from a
 * local path when given, otherwise from the URL. A failed load is not
 * cached, so a later call can retry. Remote loads have one total deadline
 * covering both the request and the JSON body, including transports that ignore abort.
 */
export function createJsonLoader({ path, url, normalize, fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  let cached = null;
  return async function load() {
    if (cached) return cached;
    const pending = (async () => {
      if (path) {
        const text = await readFile(path, 'utf8');
        return normalize(JSON.parse(text), LOCAL_SOURCE);
      }
      const controller = new AbortController();
      let timer;
      const deadline = new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new DOMException(`Remote JSON load timed out after ${timeoutMs}ms`, 'TimeoutError');
          reject(error);
          controller.abort(error);
        }, timeoutMs);
      });
      try {
        const remote = (async () => {
          const res = await fetchImpl(url, { headers: { accept: 'application/json' }, signal: controller.signal });
          if (!res.ok) throw new Error(`GET ${url} answered HTTP ${res.status}`);
          return normalize(await readBoundedJson(res), url);
        })();
        // The race releases callers even if a transport fails to honor abort.
        return await Promise.race([remote, deadline]);
      } finally {
        clearTimeout(timer);
      }
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
export function createLoader({ dataPath, url = DEFAULT_URL, fetchImpl, timeoutMs } = {}) {
  return createJsonLoader({ path: dataPath, url, normalize: normalizeDataset, fetchImpl, timeoutMs });
}

/** openai-clients.json loader (--clients / FLAH_CLIENTS). */
export function createClientsLoader({ clientsPath, url = DEFAULT_CLIENTS_URL, fetchImpl, timeoutMs } = {}) {
  return createJsonLoader({ path: clientsPath, url, normalize: normalizeClients, fetchImpl, timeoutMs });
}

/** status.json loader (--status / FLAH_STATUS). */
export function createStatusLoader({ statusPath, url = DEFAULT_STATUS_URL, fetchImpl, timeoutMs } = {}) {
  return createJsonLoader({ path: statusPath, url, normalize: normalizeStatus, fetchImpl, timeoutMs });
}
