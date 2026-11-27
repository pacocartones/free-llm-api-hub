// parity-crawl.mjs against two local fixture servers: identical origins pass, a difference fails unless the allow file
// names it with a reason, and the hard checks (noindex on A, no noindex on a non-production B, the random 404, the
// Google verification file) fail whatever the allow file says.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTmpDir } from './lib/tmp.mjs';
import {
  FIXED_PATHS, GOOGLE_VERIFICATION, allowedBy, crawl, diffSitemaps, fetchChain, htmlFacts, loadAllow, makeLimiter,
  mapHost, origin, parseArgs, parseSitemap, pathSet, renderMarkdown, stripStamps,
} from './parity-crawl.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(ROOT, 'scripts/parity-crawl.mjs');
const noLimit = async () => {};

const page = (path, extra = '') => `<!doctype html><html><head><link rel="canonical" href="https://freellmapihub.com${path}">`
  + `<meta name="robots" content="index,follow"><meta name="build" content="${Math.random()}">${extra}</head><body>${path}</body></html>`;
const sitemap = (paths, lastmod = '2026-11-01') => `<?xml version="1.0"?><urlset>${paths.map((p) => `<url><loc>https://freellmapihub.com${p}</loc><lastmod>${lastmod}</lastmod></url>`).join('')}</urlset>`;

/** A fixture site. `tweak(req, res, ctx)` may answer first (return true) or change the context. */
function fixture({ noindex = false, tweak = () => false, lastmod } = {}) {
  const server = createServer((req, res) => {
    const path = req.url.split('?')[0];
    const ctx = { headers: { 'cache-control': 'max-age=600', 'access-control-allow-origin': '*' } };
    if (noindex) ctx.headers['x-robots-tag'] = 'noindex';
    if (tweak(req, res, ctx)) return;
    const send = (status, type, body) => { res.writeHead(status, { 'content-type': type, ...ctx.headers }); res.end(body); };
    if (path === '/sitemap.xml') return send(200, 'application/xml', sitemap(['/', '/p/groq', '/guides/free-llm-api-without-credit-card'], lastmod));
    if (path === '/sitemap-state.xml') return send(404, 'text/plain', 'nope');
    if (path === '/guides/free-llm-api-without-credit-card/') { res.writeHead(301, { location: '/guides/free-llm-api-without-credit-card', ...ctx.headers }); return res.end(); }
    if (path === GOOGLE_VERIFICATION) return send(200, 'text/html', 'google-site-verification: googlee1498fc573a3811d.html');
    if (path.startsWith('/no-such-page-')) return send(404, 'text/html', page('/404'));
    if (path.endsWith('.json')) return send(200, 'application/json', '{"ok":true,"built_at":"' + Date.now() + '"}');
    if (path === '/' || path.startsWith('/p/') || path.startsWith('/guides/') || path.startsWith('/old')) return send(200, 'text/html; charset=utf-8', page(path));
    return send(200, 'text/plain', `file ${path}`);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` })));
}

async function withSites(optsA, optsB, fn) {
  const A = await fixture(optsA);
  const B = await fixture(optsB);
  try { return await fn(A.origin, B.origin); } finally { A.server.close(); B.server.close(); }
}

const REDIRECTS = { '/old-page': '/p/groq' };

test('identical origins pass, with every fixed path, the sitemap URLs and the redirect sources compared', async () => {
  await withSites({}, { noindex: true }, async (a, b) => {
    const report = await crawl({ a, b, hostMap: true, redirects: REDIRECTS, limiter: noLimit });
    assert.deepEqual(report.failures, []);
    assert.deepEqual(report.unexpected, [], JSON.stringify(report.unexpected.slice(0, 3)));
    assert.equal(report.ok, true);
    const paths = report.urls.map((u) => u.path);
    for (const p of [...FIXED_PATHS, '/old-page', '/guides/free-llm-api-without-credit-card', 'http://<apex>/']) assert.ok(paths.includes(p), p);
    assert.ok(paths.some((p) => /^\/no-such-page-[0-9a-f]{12}$/.test(p)), 'a random path');
    const slash = report.urls.find((u) => u.path === '/guides/free-llm-api-without-credit-card/');
    assert.equal(slash.b.chain, '301 http://freellmapihub.com/guides/free-llm-api-without-credit-card/ -> http://freellmapihub.com/guides/free-llm-api-without-credit-card',
      "the chain keeps each hop and code, with the host mapped by --host-map");
    assert.equal(report.counts.sitemap_entries['/sitemap.xml'].a, 3);
  });
});

test('without --host-map the hosts differ in redirect chains; a body or header difference fails; the allow file excuses it', async () => {
  const tweak = (req, res, ctx) => {
    if (req.url.startsWith('/p/groq.html')) { res.writeHead(307, { location: '/p/groq', ...ctx.headers }); res.end(); return true; }
    if (req.url.startsWith('/api/v1/providers.json')) delete ctx.headers['access-control-allow-origin'];
    return false;
  };
  await withSites({}, { noindex: true, tweak, lastmod: '2026-11-02' }, async (a, b) => {
    const plain = await crawl({ a, b, redirects: REDIRECTS, limiter: noLimit });
    const slash = plain.urls.find((u) => u.path === '/guides/free-llm-api-without-credit-card/');
    assert.match(slash.a.chain, /^301 http:\/\/127\.0\.0\.1:\d+\/guides\/free-llm-api-without-credit-card\/ -> /);
    assert.ok(plain.unexpected.some((d) => d.path === slash.path && d.field === 'chain'), 'the hosts differ in the chain without --host-map');

    const report = await crawl({ a, b, hostMap: true, redirects: REDIRECTS, limiter: noLimit });
    const key = (d) => `${d.path} ${d.field}`;
    const got = report.unexpected.map(key).sort();
    assert.ok(got.includes('/p/groq.html chain') && got.includes('/p/groq.html status') === false, got.join('\n'));
    assert.ok(got.includes('/api/v1/providers.json acao'));
    assert.ok(report.unexpected.some((d) => d.path === 'sitemap:/sitemap.xml' && d.field === 'lastmod' && d.a === '2026-11-01' && d.b === '2026-11-02'));
    assert.equal(report.ok, false);

    const allow = [
      { path: '/p/*', field: '*', reason: 'the Worker drops .html' },
      { path: '/api/v1/providers.json', field: 'acao', b: null, reason: 'test' },
      { path: '*', field: 'lastmod', reason: 'B was built a day later' },
      { path: '/sitemap.xml', field: 'body_sha256', reason: 'the same lastmod change, in the body' },
    ];
    const excused = await crawl({ a, b, hostMap: true, redirects: REDIRECTS, allow, limiter: noLimit });
    assert.deepEqual(excused.unexpected, []);
    assert.equal(excused.ok, true);
    assert.ok(excused.allowed.every((d) => d.reason));
    assert.match(renderMarkdown(excused), /## Allowed differences \(\d+\)[\s\S]*the Worker drops \.html/);
  });
});

test('hard checks: noindex on A, an indexable non-production B, a random path that answers 200, a redirected verification file', async () => {
  const soft404 = (req, res, ctx) => {
    if (req.url.startsWith('/no-such-page-')) { res.writeHead(200, { 'content-type': 'text/html', ...ctx.headers }); res.end('soft'); return true; }
    if (req.url.startsWith(GOOGLE_VERIFICATION)) { res.writeHead(308, { location: '/googlee1498fc573a3811d', ...ctx.headers }); res.end(); return true; }
    return false;
  };
  await withSites({ noindex: true }, { tweak: soft404 }, async (a, b) => {
    const report = await crawl({ a, b, hostMap: true, redirects: {}, allow: [{ path: '*', field: '*', reason: 'excuses differences only' }], limiter: noLimit });
    const checks = new Set(report.failures.map((f) => f.check));
    for (const c of ['a-noindex', 'b-indexable', 'random-404', 'google-verification']) assert.ok(checks.has(c), c);
    assert.ok(!checks.has('unreachable'));
    assert.ok(report.failures.some((f) => f.check === 'random-404' && /^B:/.test(f.detail)));
    assert.ok(report.failures.some((f) => f.check === 'google-verification' && /^B: 308/.test(f.detail)));
    assert.equal(report.ok, false, 'the allow file cannot excuse a failed check');
    assert.match(renderMarkdown(report), /# Parity report: FAIL/);
  });
});

test('the CLI writes report.json and report.md, exits 0 on parity, 1 on a difference and 2 on a bad allow file', async () => {
  const run = (args) => new Promise((resolve) => execFile(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', env: { ...process.env, PARITY_RATE: '200' } }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr })));
  await withSites({}, { noindex: true }, async (a, b) => {
    const out = makeTmpDir('parity-');
    const ok = await run(['--a', a, '--b', b, '--host-map', '--allow', join(ROOT, 'scripts/parity-allow.json'), '--out', out]);
    assert.equal(ok.code, 0, ok.stderr + ok.stdout);
    assert.ok(existsSync(join(out, 'report.md')));
    const report = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8'));
    assert.equal(report.ok, true);
    assert.ok(report.urls.length > FIXED_PATHS.length);

    const differs = await run(['--a', a, '--b', b, '--out', makeTmpDir('parity-')]);
    assert.equal(differs.code, 1, 'without --host-map the hosts differ');

    const bad = join(makeTmpDir('parity-'), 'allow.json');
    writeFileSync(bad, JSON.stringify({ allow: [{ path: '*', field: 'chain' }] }));
    const usage = await run(['--a', a, '--b', b, '--allow', bad, '--out', makeTmpDir('parity-')]);
    assert.equal(usage.code, 2);
    assert.match(usage.stderr, /allow\[0\] has no reason/);
  });
});

test('a URL that does not answer on either side is a failed check, even when both sides fail alike', async () => {
  const fetchFn = async (url) => {
    if (url.startsWith('http://')) throw Object.assign(new Error('fetch failed'), { cause: { code: 'ENOTFOUND' } });
    return new Response('x', { status: url.includes('/no-such-page-') ? 404 : 200, headers: { 'content-type': 'text/plain' } });
  };
  const report = await crawl({ a: 'https://freellmapihub.com', b: 'https://freellmapihub.com', redirects: {}, fetchFn, limiter: noLimit });
  assert.deepEqual(report.unexpected, []);
  assert.deepEqual(report.failures.map((f) => `${f.path} ${f.check} ${f.detail}`).sort(), [
    'http://<apex>/ unreachable A: ENOTFOUND', 'http://<apex>/ unreachable B: ENOTFOUND',
    'http://www.<apex>/ unreachable A: ENOTFOUND', 'http://www.<apex>/ unreachable B: ENOTFOUND',
  ]);
  assert.equal(report.ok, false);
});

test('the committed allow file is valid and every entry has a reason', () => {
  const { allow } = loadAllow(readFileSync(join(ROOT, 'scripts/parity-allow.json'), 'utf8'));
  for (const e of allow) assert.ok(e.reason.trim());
});

test('arguments, origins, parsing and helpers', async () => {
  assert.deepEqual(Object.keys(parseArgs(['--a', 'https://x.test/', '--b', 'https://y.test', '--out', 'o'])).sort(), ['a', 'allow', 'b', 'hostMap', 'out', 'redirects']);
  assert.throws(() => parseArgs(['--a', 'https://x.test']), /--b is required/);
  assert.throws(() => parseArgs(['--a', 'https://x.test', '--b', 'https://y.test', '--out', 'o', '--bogus']), /unknown argument/);
  assert.equal(origin('https://x.test/'), 'https://x.test');
  assert.throws(() => origin('https://x.test/path'), /no path/);
  assert.throws(() => origin('ftp://x.test'), /origin/);

  assert.deepEqual(parseSitemap('<url><loc>https://a/x?a=1&amp;b=2</loc></url><url><loc>https://a/y</loc><lastmod>2026</lastmod></url>'),
    [{ loc: 'https://a/x?a=1&b=2', lastmod: '' }, { loc: 'https://a/y', lastmod: '2026' }]);
  assert.deepEqual(htmlFacts(`<link href='https://f/x' rel="canonical"><meta content="noindex" name="robots"><script>gtag('config','G-ABC1234XYZ')</script>`),
    { canonical: 'https://f/x', robots: 'noindex', ga: 'G-ABC1234XYZ' });
  assert.equal(stripStamps('<a href="/build.json?x=1">b</a><meta name="build" content="1"><p data-build="2">'), '<a href="">b</a><p>');
  assert.equal(stripStamps('x 2026 y', [/\d+/g]), 'x  y');
  assert.equal(mapHost('https://stage.example.workers.dev/a?b', 'https://stage.example.workers.dev'), 'https://freellmapihub.com/a?b');
  assert.equal(mapHost('http://stage.example.workers.dev/', 'https://stage.example.workers.dev'), 'http://freellmapihub.com/');
  assert.equal(mapHost('https://other.test/', 'https://stage.example.workers.dev'), 'https://other.test/');

  assert.deepEqual(diffSitemaps([{ loc: 'https://freellmapihub.com/a', lastmod: '1' }, { loc: 'https://freellmapihub.com/b', lastmod: '1' }],
    [{ loc: 'https://s.test/a', lastmod: '2' }, { loc: 'https://s.test/c', lastmod: '1' }], { mapFromB: 'https://s.test' }), [
    { loc: 'https://freellmapihub.com/a', field: 'lastmod', a: '1', b: '2' },
    { loc: 'https://freellmapihub.com/b', field: 'loc', a: 'https://freellmapihub.com/b', b: null },
    { loc: 'https://freellmapihub.com/c', field: 'loc', a: null, b: 'https://freellmapihub.com/c' },
  ]);
  assert.equal(allowedBy({ path: '/p/x', field: 'csp', a: '1', b: '2' }, [{ path: '/p/*', field: 'csp', b: '3', reason: 'r' }]), null, 'b must match when given');
  assert.ok(allowedBy({ path: '/p/x', field: 'csp', a: '1', b: '2' }, [{ path: '/p/*', field: 'csp', b: '2', reason: 'r' }]));
  assert.throws(() => loadAllow(JSON.stringify({ allow: [{ path: '*', field: 'colour', reason: 'r' }] })), /unknown field/);
  assert.throws(() => loadAllow(JSON.stringify({ body_ignore: [{ pattern: '(', reason: 'r' }] })), /not a valid pattern/);

  const paths = pathSet({ sitemapEntries: [{ loc: 'https://freellmapihub.com/' }, { loc: 'https://freellmapihub.com/p/groq' }], redirects: { '/old': '/new' }, random: '/no-such-page-1' });
  assert.equal(paths[0], '/'); assert.equal(paths[1], '/p/groq'); assert.equal(paths[2], '/old');
  assert.equal(new Set(paths).size, paths.length, 'no duplicates');

  // A redirect loop ends after MAX_HOPS instead of hanging, and a network error is recorded, not thrown.
  const loop = await fetchChain('https://x.test/a', { fetchFn: async (u) => new Response(null, { status: 301, headers: { location: u } }), maxHops: 3 });
  assert.equal(loop.final, null); assert.match(loop.error, /more than 3 redirects/); assert.equal(loop.hops.length, 4);
  const down = await fetchChain('https://x.test/a', { fetchFn: async () => { throw Object.assign(new Error('x'), { cause: { code: 'ECONNREFUSED' } }); } });
  assert.equal(down.error, 'ECONNREFUSED'); assert.equal(down.hops[0].status, 0);
});

test('PARITY_RATE only applies when both origins are on this machine', async () => {
  const { rateFor, RATE } = await import('./parity-crawl.mjs');
  assert.equal(rateFor('http://127.0.0.1:1', 'http://localhost:2', { PARITY_RATE: '100' }), 100);
  assert.equal(rateFor('https://freellmapihub.com', 'http://127.0.0.1:2', { PARITY_RATE: '100' }), RATE);
  assert.equal(RATE, 4);
});

test('the limiter spaces requests 1/rps apart, shared by every caller', async () => {
  let t = 0;
  const waits = [];
  const limiter = makeLimiter(4, { now: () => t, sleep: async (ms) => { waits.push(ms); } });
  await Promise.all([limiter(), limiter(), limiter(), limiter()]);
  assert.deepEqual(waits, [250, 500, 750]);
  t = 5000;
  waits.length = 0;
  await limiter();
  assert.deepEqual(waits, [], 'no wait after an idle period');
});

test('smoke-live --origin requests the canonical <loc>s of that origin\'s sitemap on that origin', async () => {
  const seen = [];
  const site = await fixture({ tweak: (req) => { seen.push(req.url.split('?')[0]); return false; } });
  try {
    const out = await new Promise((resolve) => execFile(process.execPath, [join(ROOT, 'scripts/smoke-live.mjs'), '--origin', site.origin], { encoding: 'utf8' },
      (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr })));
    assert.equal(out.code, 0, out.stderr + out.stdout);
    for (const p of ['/sitemap.xml', '/', '/p/groq', '/guides/free-llm-api-without-credit-card', '/.well-known/security.txt']) assert.ok(seen.includes(p), p);
    const bad = await new Promise((resolve) => execFile(process.execPath, [join(ROOT, 'scripts/smoke-live.mjs'), '--origin', 'not-a-url'], (err) => resolve(err ? err.code : 0)));
    assert.equal(bad, 2);
  } finally { site.server.close(); }
});
