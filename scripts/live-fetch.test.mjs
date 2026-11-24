// The post-deploy checks read the live site past the CDN cache (scripts/lib/live-fetch.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { deployToken, bustUrl, makeLiveFetch, NO_CACHE_HEADERS } from './lib/live-fetch.mjs';

const SCRIPTS = fileURLToPath(new URL('.', import.meta.url));

test('the token is the short commit plus the run, so the daily rebuild of one commit still gets a new key', () => {
  assert.equal(deployToken({ GITHUB_SHA: 'ABCDEF0123456789abcdef0123456789abcdef01', GITHUB_RUN_ID: '42', GITHUB_RUN_ATTEMPT: '2' }), 'abcdef0-42.2');
  assert.equal(deployToken({ GITHUB_SHA: 'abcdef0123456789abcdef0123456789abcdef01' }), 'abcdef0');
  assert.equal(deployToken({ GITHUB_RUN_ID: '42' }), 'run-42');
  const a = deployToken({});
  assert.match(a, /^local-[0-9a-f]{8}$/, 'by hand: random per process');
  assert.notEqual(a, deployToken({}));
  assert.match(deployToken({ GITHUB_SHA: 'x&y=1', GITHUB_RUN_ID: '1;2' }), /^local-/, 'odd values are not copied into the URL');
});

test('bustUrl adds deploy=<token>, keeps the path and the existing query, and changes the key on every retry', () => {
  assert.equal(bustUrl('https://freellmapihub.com/sitemap.xml', 'abc1234-9'), 'https://freellmapihub.com/sitemap.xml?deploy=abc1234-9');
  assert.equal(bustUrl('https://freellmapihub.com/compare/?p=a&p=b', 't'), 'https://freellmapihub.com/compare/?p=a&p=b&deploy=t');
  assert.equal(bustUrl('https://freellmapihub.com/p/groq?deploy=old', 't', 2), 'https://freellmapihub.com/p/groq?deploy=t-r2');
});

test('makeLiveFetch sends no-cache, keeps the caller init, and gives a retry of the same URL a new cache key', async () => {
  const calls = [];
  const lf = makeLiveFetch({ token: 'tok', fetchImpl: async (url, init) => { calls.push([url, init]); return { ok: true }; } });
  const signal = new AbortController().signal;
  await lf('https://x.test/a', { signal });
  await lf('https://x.test/b');
  await lf('https://x.test/a');
  assert.deepEqual(calls.map(([u]) => u), ['https://x.test/a?deploy=tok', 'https://x.test/b?deploy=tok', 'https://x.test/a?deploy=tok-r1']);
  assert.equal(calls[0][1].signal, signal);
  for (const [, init] of calls) assert.deepEqual(init.headers, NO_CACHE_HEADERS);
});

// Runs a live check against a local server and returns every request it made.
async function requestsOf(script, routes) {
  const seen = [];
  const server = createServer((req, res) => {
    seen.push({ url: req.url, cacheControl: req.headers['cache-control'] });
    const path = new URL(req.url, 'http://x').pathname;
    const body = typeof routes[path] === 'function' ? routes[path](server.address().port) : routes[path];
    res.writeHead(body === undefined ? 404 : 200, { 'content-type': 'text/plain' });
    res.end(body ?? '');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const site = `http://127.0.0.1:${server.address().port}`;
  const env = { ...process.env, FLLM_SITE: site, GITHUB_SHA: '0123456789abcdef0123456789abcdef01234567', GITHUB_RUN_ID: '7', GITHUB_RUN_ATTEMPT: '1', FLLM_LIVE_ATTEMPTS: '2', FLLM_LIVE_RETRY_DELAY: '0' };
  await new Promise((resolve) => spawn(process.execPath, [script], { cwd: SCRIPTS + '..', env, stdio: 'ignore' }).on('exit', resolve));
  server.close();
  return seen;
}

test('smoke-live: the sitemap, every page it lists and the extra files are all requested past the cache', async () => {
  const seen = await requestsOf(`${SCRIPTS}smoke-live.mjs`, {
    '/sitemap.xml': (port) => `<urlset><url><loc>http://127.0.0.1:${port}/</loc></url><url><loc>http://127.0.0.1:${port}/gone</loc></url></urlset>`,
    '/': 'home', '/.well-known/security.txt': 'Contact: x', '/favicon.ico': 'ico',
  });
  const paths = seen.map((r) => new URL(r.url, 'http://x').pathname);
  for (const p of ['/sitemap.xml', '/', '/gone', '/.well-known/security.txt', '/favicon.ico']) assert.ok(paths.includes(p), `requested ${p}`);
  for (const r of seen) {
    assert.match(r.url, /[?&]deploy=0123456-7\.1(?:-r\d+)?$/, `${r.url} carries the deploy token`);
    assert.equal(r.cacheControl, 'no-cache', `${r.url} asks for no cache`);
  }
  const retried = seen.filter((r) => r.url.startsWith('/gone'));
  assert.deepEqual(retried.map((r) => r.url), ['/gone?deploy=0123456-7.1', '/gone?deploy=0123456-7.1-r1'], 'the retry of a failing page uses a new key');
});

test('check-sitemap-live: sitemap.xml, sitemap-state.xml, robots.txt and the sampled reports are requested past the cache', async () => {
  const seen = await requestsOf(`${SCRIPTS}check-sitemap-live.mjs`, {
    '/sitemap.xml': readFileSync(new URL('../site/sitemap.xml', import.meta.url), 'utf8'),
    '/sitemap-state.xml': '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://freellmapihub.com/state/2026-10/</loc></url></urlset>\n',
    '/robots.txt': 'Sitemap: https://freellmapihub.com/sitemap-state.xml\n',
    '/state/2026-10/': 'report',
  });
  const paths = seen.map((r) => new URL(r.url, 'http://x').pathname);
  for (const p of ['/sitemap.xml', '/sitemap-state.xml', '/robots.txt', '/state/2026-10/']) assert.ok(paths.includes(p), `requested ${p}`);
  for (const r of seen) {
    assert.match(r.url, /[?&]deploy=0123456-7\.1(?:-r\d+)?$/, `${r.url} carries the deploy token`);
    assert.equal(r.cacheControl, 'no-cache', `${r.url} asks for no cache`);
  }
});

test('neither live check calls fetch directly', () => {
  for (const f of ['smoke-live.mjs', 'check-sitemap-live.mjs']) {
    const src = readFileSync(new URL(`./${f}`, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /(?<![A-Za-z])fetch\(/, `${f} goes through makeLiveFetch`);
  }
});
