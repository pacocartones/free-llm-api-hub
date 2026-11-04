// Source-link checking with the network injected, so tests never need a connection.

export const USER_AGENT = 'free-llm-api-hub-source-check/1.0 (+https://github.com/pacocartones/free-llm-api-hub)';
export const TIMEOUT_MS = 15000;
export const REQUEST_GAP_MS = 500; // sequential requests, at most 2 per second

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const cleanUrl = (url) => url.trim().replace(/[.,;:]+$/, '');

/** Collect provider docs_url values and external links in docs/sources.md, deduplicated by URL. */
export function collectSources(providers, sourcesMarkdown) {
  const byUrl = new Map();
  const add = (url, source) => {
    const cleaned = cleanUrl(url || '');
    if (!/^https?:\/\//.test(cleaned)) return;
    if (!byUrl.has(cleaned)) byUrl.set(cleaned, { url: cleaned, sources: [] });
    const sources = byUrl.get(cleaned).sources;
    if (!sources.includes(source)) sources.push(source);
  };
  for (const p of providers) add(p.docs_url, `data/providers.json:${p.slug}`);
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

const errorText = (e) => (e && e.name === 'AbortError' ? 'timeout' : String((e && e.message) || e || 'fetch error'));

async function fetchOnce(fetchImpl, url, method, timeoutMs, pace, accept = 'text/html,application/xhtml+xml,text/plain,*/*;q=0.8') {
  await pace();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetchImpl(url, {
      method,
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: accept },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function request(fetchImpl, url, method, timeoutMs, pace) {
  const res = await fetchOnce(fetchImpl, url, method, timeoutMs, pace);
  if (method === 'GET' && typeof res.text === 'function') await res.text(); // let the connection finish cleanly
  return { ok: Boolean(res.ok), status: res.status || 0 };
}

/** HEAD first, with GET when HEAD cannot answer or gives a non-definitive response. */
export async function checkOne(url, { fetchImpl = fetch, timeoutMs = TIMEOUT_MS, pace = async () => {} } = {}) {
  let headError = null;
  try {
    const head = await request(fetchImpl, url, 'HEAD', timeoutMs, pace);
    if (head.ok) return { url, ok: true, status: head.status };
    if (head.status === 404 || head.status === 410) return { url, ok: false, status: head.status, error: `HTTP ${head.status}` };
  } catch (e) {
    headError = e;
  }
  try {
    const get = await request(fetchImpl, url, 'GET', timeoutMs, pace);
    if (get.ok) return { url, ok: true, status: get.status, note: 'HEAD failed; GET answered' };
    return { url, ok: false, status: get.status, error: `HTTP ${get.status}` };
  } catch (e) {
    return { url, ok: false, status: 0, error: errorText(e), headError: headError ? errorText(headError) : undefined };
  }
}

/** Ask the Wayback availability API for the closest snapshot of a dead URL. */
export async function waybackSnapshot(url, { fetchImpl = fetch, timeoutMs = TIMEOUT_MS, pace = async () => {} } = {}) {
  const api = `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`;
  try {
    const res = await fetchOnce(fetchImpl, api, 'GET', timeoutMs, pace, 'application/json');
    if (!res.ok) return null;
    const data = await res.json();
    const closest = data && data.archived_snapshots && data.archived_snapshots.closest;
    return closest && closest.available && closest.url ? closest.url : null;
  } catch (_) {
    return null;
  }
}

/** Check every URL sequentially, pacing every network request to at most two per second. */
export async function checkSources(entries, { fetchImpl = fetch, timeoutMs = TIMEOUT_MS, requestGapMs = REQUEST_GAP_MS, sleepImpl = sleep } = {}) {
  let requests = 0;
  const pace = async () => {
    if (requests++ > 0) await sleepImpl(requestGapMs);
  };
  const results = [];
  for (const entry of entries) {
    const result = { ...entry, ...(await checkOne(entry.url, { fetchImpl, timeoutMs, pace })) };
    if (!result.ok) result.wayback = await waybackSnapshot(entry.url, { fetchImpl, timeoutMs, pace });
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
