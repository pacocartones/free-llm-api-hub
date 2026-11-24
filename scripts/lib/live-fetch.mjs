// live-fetch.mjs — how the post-deploy checks read the live site past the CDN cache.
//
// Cloudflare is going to keep HTML and JSON at the edge for a few minutes (a Cache Rule enabled after this change).
// A check right after a deploy would then read the copy cached before it and report a stale deploy. Its default
// cache key includes the query string, so every request gets `deploy=<token>`:
//   - the token is unique per deploy run: the short commit plus the workflow run (GITHUB_SHA, GITHUB_RUN_ID and
//     GITHUB_RUN_ATTEMPT, set by Actions; the daily deploy rebuilds the same commit, so the commit alone repeats).
//     By hand, without those variables, it is one random value per process;
//   - a retry of the same URL adds `-r<n>`: if the edge cached a pre-deploy answer under the first key while Pages was
//     still switching versions, the retry asks the origin again instead of reading that copy for ten minutes.
// Every request also sends `Cache-Control: no-cache`, for any cache on the way that honours it.
import { randomBytes } from 'node:crypto';

export function deployToken(env = process.env) {
  const sha = /^[0-9a-f]{7,40}$/i.test(env.GITHUB_SHA || '') ? env.GITHUB_SHA.slice(0, 7).toLowerCase() : '';
  const run = /^\d+$/.test(env.GITHUB_RUN_ID || '') ? `-${env.GITHUB_RUN_ID}${/^\d+$/.test(env.GITHUB_RUN_ATTEMPT || '') ? `.${env.GITHUB_RUN_ATTEMPT}` : ''}` : '';
  return sha || run ? `${sha || 'run'}${run}` : `local-${randomBytes(4).toString('hex')}`;
}

/** The URL with `deploy=<token>` (and `-r<n>` from the second request on) added to its query, keeping the rest. */
export function bustUrl(url, token, retry = 0) {
  const u = new URL(url);
  u.searchParams.set('deploy', retry > 0 ? `${token}-r${retry}` : token);
  return u.href;
}

export const NO_CACHE_HEADERS = Object.freeze({ 'cache-control': 'no-cache' });

/**
 * A fetch for the live checks: busts the edge cache and counts the requests per URL, so each retry gets a new key.
 * `fetchImpl` is injectable for the tests.
 */
export function makeLiveFetch({ token = deployToken(), fetchImpl = (...a) => fetch(...a) } = {}) {
  const seen = new Map();
  return (url, init = {}) => {
    const n = seen.get(url) ?? 0;
    seen.set(url, n + 1);
    return fetchImpl(bustUrl(url, token, n), { ...init, headers: { ...NO_CACHE_HEADERS, ...(init.headers || {}) } });
  };
}
