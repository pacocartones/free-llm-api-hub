// Source-link checking with the network injected, so tests never need a connection.

import { fetchPublicUrl } from './public-fetch.mjs';

export const USER_AGENT = 'free-llm-api-hub-source-check/1.0 (+https://github.com/pacocartones/free-llm-api-hub)';
export const TIMEOUT_MS = 15000;
export const MAX_RESPONSE_BYTES = 64 * 1024;
export const WAYBACK_MAX_BYTES = 64 * 1024;
export const REQUEST_GAP_MS = 500; // sequential requests, at most 2 per second

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const cleanUrl = (url) => url.trim().replace(/[.,;:]+$/, '');

/** Collect provider docs and claim evidence plus external links in docs/sources.md, deduplicated by URL. */
export function collectSources(providers, sourcesMarkdown) {
  const byUrl = new Map();
  const add = (url, source) => {
    const cleaned = cleanUrl(url || '');
    if (!/^https?:\/\//.test(cleaned)) return;
    if (!byUrl.has(cleaned)) byUrl.set(cleaned, { url: cleaned, sources: [] });
    const sources = byUrl.get(cleaned).sources;
    if (!sources.includes(source)) sources.push(source);
  };
  for (const p of providers) {
    const source = `data/providers.json:${p.slug}`;
    add(p.docs_url, source);
    for (const [field, url] of [
      ['free_limits.source', p.free_limits?.source],
      ['data_policy.source', p.data_policy?.source],
      ['no_expiry.source', p.no_expiry?.source],
      ['model_tier_source.url', p.model_tier_source?.url],
    ]) add(url, `${source}.${field}`);
  }
  const patterns = [
    /\[[^\]]*\]\((https?:\/\/[^)\s]+)[^)]*\)/g, // Markdown links
    /<(https?:\/\/[^>\s]+)>/g, // autolinks
    /\b(https?:\/\/[^\s)<>"']+)/g, // bare URLs
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(sourcesMarkdown))) add(m[1], 'docs/sources.md');
  }
  return [...byUrl.values()];
}

const errorText = (error) => (
  error?.name === 'AbortError' || error?.name === 'TimeoutError'
    ? 'timeout'
    : String(error?.message || error || 'fetch error')
);

const throwIfAborted = (signal) => {
  if (signal?.aborted) throw signal.reason || new DOMException('source sweep aborted', 'AbortError');
};

const cancelBody = (body, reason) => {
  try {
    const cancellation = body?.cancel(reason);
    cancellation?.catch(() => {});
  } catch { /* the response is already being abandoned */ }
};

const readBoundedText = async (response, maxBytes) => {
  const declared = response.headers?.get?.('content-length')?.trim() || '';
  if (/^\d+$/.test(declared) && BigInt(declared) > BigInt(maxBytes)) {
    cancelBody(response.body);
    throw new Error(`response exceeds ${maxBytes}-byte limit`);
  }
  if (!response.body) throw new Error('response body is not a readable stream');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks = [];
  let bytesRead = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.byteLength > maxBytes - bytesRead) {
        try {
          const cancellation = reader.cancel(new Error(`response exceeds ${maxBytes}-byte limit`));
          cancellation?.catch(() => {});
        } catch { /* preserve the size error */ }
        throw new Error(`response exceeds ${maxBytes}-byte limit`);
      }
      bytesRead += value.byteLength;
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return chunks.join('');
  } finally {
    reader.releaseLock();
  }
};

async function fetchOnce(fetchImpl, url, { timeoutMs, maxBytes, pace, signal, accept }) {
  throwIfAborted(signal);
  await pace();
  throwIfAborted(signal);
  return fetchImpl(url, {
    signal,
    timeoutMs,
    maxBytes,
    headers: { 'User-Agent': USER_AGENT, Accept: accept },
  });
}

/** Check a URL with one bounded GET. The body is not needed and is cancelled immediately. */
export async function checkOne(url, {
  fetchImpl = fetchPublicUrl,
  timeoutMs = TIMEOUT_MS,
  maxBytes = MAX_RESPONSE_BYTES,
  pace = async () => {},
  signal,
} = {}) {
  try {
    const response = await fetchOnce(fetchImpl, url, {
      timeoutMs,
      maxBytes,
      pace,
      signal,
      accept: 'text/html,application/xhtml+xml,text/plain,*/*;q=0.8',
    });
    cancelBody(response.body);
    if (response.ok) return { url, ok: true, status: response.status || 0 };
    return { url, ok: false, status: response.status || 0, error: `HTTP ${response.status || 0}` };
  } catch (error) {
    throwIfAborted(signal);
    return { url, ok: false, status: 0, error: errorText(error) };
  }
}

/** Ask the Wayback availability API for the closest snapshot of a dead URL. */
export async function waybackSnapshot(url, {
  fetchImpl = fetchPublicUrl,
  timeoutMs = TIMEOUT_MS,
  maxBytes = WAYBACK_MAX_BYTES,
  pace = async () => {},
  signal,
} = {}) {
  const api = `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`;
  try {
    const response = await fetchOnce(fetchImpl, api, {
      timeoutMs,
      maxBytes,
      pace,
      signal,
      accept: 'application/json',
    });
    if (!response.ok) {
      cancelBody(response.body);
      return null;
    }
    const data = JSON.parse(await readBoundedText(response, maxBytes));
    const closest = data?.archived_snapshots?.closest;
    return closest?.available && typeof closest.url === 'string' ? closest.url : null;
  } catch (error) {
    throwIfAborted(signal);
    return null;
  }
}

/** Check every URL sequentially, pacing every network request to at most two per second. */
export async function checkSources(entries, {
  fetchImpl = fetchPublicUrl,
  timeoutMs = TIMEOUT_MS,
  maxBytes = MAX_RESPONSE_BYTES,
  waybackMaxBytes = WAYBACK_MAX_BYTES,
  requestGapMs = REQUEST_GAP_MS,
  sleepImpl = sleep,
  signal,
} = {}) {
  let requests = 0;
  const pace = async () => {
    if (requests++ > 0) await sleepImpl(requestGapMs);
  };
  const results = [];
  for (const entry of entries) {
    throwIfAborted(signal);
    const result = {
      ...entry,
      ...(await checkOne(entry.url, { fetchImpl, timeoutMs, maxBytes, pace, signal })),
    };
    if (!result.ok) {
      result.wayback = await waybackSnapshot(entry.url, {
        fetchImpl,
        timeoutMs,
        maxBytes: waybackMaxBytes,
        pace,
        signal,
      });
    }
    results.push(result);
  }
  return results;
}

export function formatReport(results) {
  const dead = results.filter((r) => !r.ok);
  const lines = [`Checked ${results.length} source URL${results.length === 1 ? '' : 's'}.`];
  if (!dead.length) lines.push('✓ no dead or unreachable sources found.');
  else {
    lines.push(`✗ ${dead.length} dead or unreachable source${dead.length === 1 ? '' : 's'}:`, '');
    lines.push('| status | source | url | wayback |', '| --- | --- | --- | --- |');
    for (const r of dead) lines.push(`| ${r.error} | ${r.sources.join('<br>')} | ${r.url} | ${r.wayback || '-'} |`);
  }
  return lines.join('\n');
}
