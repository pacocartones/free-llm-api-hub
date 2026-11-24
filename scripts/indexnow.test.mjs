import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { INDEXNOW_KEY, INDEXNOW_ENDPOINT, URL_CAP, changedUrls, describeStatus, indexNowBody, ownUrl, parseSitemap } from './lib/indexnow.mjs';
import { plan, submit } from './indexnow.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const S = 'https://freellmapihub.com';
const sm = (entries) => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.map(([l, d]) => `  <url><loc>${l}</loc>${d ? `<lastmod>${d}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`;
const quiet = () => {};

test('the key file is served from the site root and holds exactly the key', () => {
  assert.match(INDEXNOW_KEY, /^[0-9a-f]{32}$/);
  const f = join(ROOT, 'site', `${INDEXNOW_KEY}.txt`);
  assert.ok(existsSync(f), 'site/<key>.txt is committed');
  assert.equal(readFileSync(f, 'utf8'), INDEXNOW_KEY);
});

test('parseSitemap reads loc and lastmod, and unescapes entities', () => {
  const m = parseSitemap(sm([[`${S}/`, '2026-11-24'], [`${S}/p/a?x=1&amp;y=2`, ''], [`${S}/p/b`, '2026-11-01']]));
  assert.deepEqual([...m], [[`${S}/`, '2026-11-24'], [`${S}/p/a?x=1&y=2`, ''], [`${S}/p/b`, '2026-11-01']]);
  assert.equal(parseSitemap('').size, 0);
  assert.equal(parseSitemap('<html>not a sitemap</html>').size, 0);
});

test('the real built sitemap parses to canonical URLs only', () => {
  const m = parseSitemap(readFileSync(join(ROOT, 'site/sitemap.xml'), 'utf8'));
  assert.ok(m.size > 10);
  for (const loc of m.keys()) assert.ok(ownUrl(loc), loc);
});

test('changedUrls: new and re-dated URLs, newest first, other hosts and removals left out, capped', () => {
  const prev = new Map([[`${S}/a`, '2026-11-01'], [`${S}/b`, '2026-11-01'], [`${S}/gone`, '2026-10-01']]);
  const next = new Map([[`${S}/a`, '2026-11-01'], [`${S}/b`, '2026-11-20'], [`${S}/c`, '2026-11-24'], [`${S}/d`, '2026-11-24'], ['https://evil.example/x', '2026-11-24'], [`http://freellmapihub.com/e`, '2026-11-24']]);
  assert.deepEqual(changedUrls(prev, next), { urls: [`${S}/c`, `${S}/d`, `${S}/b`], total: 3, truncated: false });
  assert.deepEqual(changedUrls(prev, next, { cap: 2 }), { urls: [`${S}/c`, `${S}/d`], total: 3, truncated: true });
  assert.deepEqual(changedUrls(next, next).urls, [], 'an unchanged sitemap announces nothing (the daily scheduled deploy)');
  assert.ok(URL_CAP > 0 && URL_CAP <= 10000, 'within the protocol limit');
});

test('indexNowBody: host, key, key location and only own URLs', () => {
  assert.deepEqual(indexNowBody([`${S}/a`, 'https://other.example/b']), {
    host: 'freellmapihub.com', key: INDEXNOW_KEY, keyLocation: `${S}/${INDEXNOW_KEY}.txt`, urlList: [`${S}/a`],
  });
  assert.match(describeStatus(403), /key/);
  assert.equal(describeStatus(500), 'HTTP 500');
});

// A fake fetch keyed by URL: a value is [status, body], an Error is thrown.
const fakeFetch = (routes, calls = []) => async (url, init = {}) => {
  calls.push({ url, init });
  const r = routes[url];
  if (r instanceof Error) throw r;
  if (!r) return new Response('', { status: 404 });
  return new Response(r[1], { status: r[0] });
};

test('plan: diffs each built sitemap against the live one; an unreadable live sitemap sends nothing, a 404 counts as empty', async () => {
  const local = { 'sitemap.xml': sm([[`${S}/`, '2026-11-24'], [`${S}/p/a`, '2026-11-20']]), 'sitemap-state.xml': sm([[`${S}/changes/`, '2026-11-24']]) };
  const live = fakeFetch({ [`${S}/sitemap.xml`]: [200, sm([[`${S}/`, '2026-11-23'], [`${S}/p/a`, '2026-11-20']])] });
  assert.deepEqual(await plan({ fetchFn: live, readLocal: (n) => local[n], log: quiet }), [`${S}/`, `${S}/changes/`]);
  const down = fakeFetch({ [`${S}/sitemap.xml`]: new Error('ECONNRESET'), [`${S}/sitemap-state.xml`]: [500, ''] });
  assert.deepEqual(await plan({ fetchFn: down, readLocal: (n) => local[n], log: quiet }), []);
  assert.deepEqual(await plan({ fetchFn: live, readLocal: () => null, log: quiet }), [], 'nothing built, nothing sent');
});

test('submit: checks the live key file, then POSTs JSON to the IndexNow endpoint; never throws', async () => {
  const urls = [`${S}/p/a`, 'https://other.example/x'];
  const calls = [];
  const ok = fakeFetch({ [`${S}/${INDEXNOW_KEY}.txt`]: [200, `${INDEXNOW_KEY}\n`], [INDEXNOW_ENDPOINT]: [200, ''] }, calls);
  assert.equal(await submit(urls, { fetchFn: ok, log: quiet }), 200);
  const post = calls.find((c) => c.url === INDEXNOW_ENDPOINT);
  assert.equal(post.init.method, 'POST');
  assert.match(post.init.headers['content-type'], /^application\/json/);
  assert.deepEqual(JSON.parse(post.init.body).urlList, [`${S}/p/a`]);
  assert.ok(post.init.signal, 'the request has a timeout signal');

  const noKey = [];
  assert.equal(await submit(urls, { fetchFn: fakeFetch({}, noKey), log: quiet }), null, 'no key file live, nothing sent');
  assert.ok(!noKey.some((c) => c.url === INDEXNOW_ENDPOINT));
  const failing = fakeFetch({ [`${S}/${INDEXNOW_KEY}.txt`]: [200, INDEXNOW_KEY], [INDEXNOW_ENDPOINT]: new Error('network down') });
  assert.equal(await submit(urls, { fetchFn: failing, log: quiet }), null);
  assert.equal(await submit([], { fetchFn: () => { throw new Error('must not fetch'); }, log: quiet }), null);
  assert.equal(await submit('not an array', { fetchFn: () => { throw new Error('must not fetch'); }, log: quiet }), null);
});

test('the CLI always exits 0, even with bad input', () => {
  const run = (args, env = {}) => execFileSync(process.execPath, [join(ROOT, 'scripts/indexnow.mjs'), ...args], { env: { ...process.env, ...env }, encoding: 'utf8' });
  assert.match(run(['--submit'], { INDEXNOW_URLS: 'not json' }), /not a JSON array/);
  assert.match(run(['--submit'], { INDEXNOW_URLS: '[]' }), /nothing to submit/);
  assert.match(run([]), /usage/);
});

test('pages.yml: plan before the upload, submit after the live check, best effort, least privilege, pinned actions', () => {
  const wf = readFileSync(join(ROOT, '.github/workflows/pages.yml'), 'utf8').replace(/\r\n/g, '\n');
  const plan = wf.indexOf('node scripts/indexnow.mjs --plan');
  assert.ok(plan > wf.indexOf('node scripts/build.mjs') && plan < wf.indexOf('actions/upload-pages-artifact'), 'the plan runs on the built site, before it is uploaded');
  const planStep = wf.slice(wf.lastIndexOf('- name:', plan), plan);
  assert.match(planStep, /id: indexnow/);
  assert.match(planStep, /continue-on-error: true/);
  assert.match(planStep, /timeout-minutes: \d+/);
  assert.match(wf, /indexnow_urls: \$\{\{ steps\.indexnow\.outputs\.urls \}\}/);

  const job = wf.slice(wf.indexOf('\n  indexnow:'));
  assert.ok(job.length > 20, 'there is an indexnow job');
  assert.match(job, /needs: \[build, verify-live\]/, 'it waits for the deploy to be verified live');
  assert.match(job, /continue-on-error: true/);
  assert.match(job, /timeout-minutes: \d+/);
  assert.match(job, /permissions:\n {6}contents: read\n {4}steps:/, 'read-only token');
  assert.doesNotMatch(job, /secrets\./, 'no secret is used');
  assert.match(job, /INDEXNOW_URLS: \$\{\{ needs\.build\.outputs\.indexnow_urls \}\}/);
  assert.doesNotMatch(job.split('\n').filter((l) => /^\s*run:/.test(l)).join('\n'), /\$\{\{/, 'no expression is interpolated into a run line');
  for (const m of job.matchAll(/uses: ([^\s@]+)@(\S+)/g)) assert.match(m[2], /^[0-9a-f]{40}$/, `${m[1]} is pinned by SHA`);
});
