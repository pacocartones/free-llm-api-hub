#!/usr/bin/env node
// parity-crawl.mjs — does origin B serve the site exactly as origin A does? Zero dependencies, Node 24.
//
//   node scripts/parity-crawl.mjs --a https://freellmapihub.com --b https://<staging host> --host-map \
//     [--allow scripts/parity-allow.json] [--redirects data/redirects.json] --out <dir>
//
// Built for the move of freellmapihub.com from GitHub Pages to a Cloudflare Worker with static assets
// (docs/architecture.md, "Hosting cutover"): before the DNS switch, A is the live site and B the Worker on its own
// host; after it, both can be the production host. The web-watch workflow runs it in `parity` mode.
//
// URL set: every <loc> of A's /sitemap.xml and /sitemap-state.xml, every source of data/redirects.json and the fixed
// paths in FIXED_PATHS (extension and trailing-slash variants, files outside the sitemap, a random path that must be a
// 404), plus http:// for the apex (and www, when the side is the production host). Each path is requested from both
// origins with redirects followed by hand, so the whole chain is compared.
//
// Compared per URL (FIELDS): status, redirect chain (every hop and its code), final URL, canonical, meta robots,
// x-robots-tag, content-type, access-control-allow-origin, strict-transport-security, content-security-policy,
// cache-control, the Google Analytics measurement ID in HTML, and a SHA-256 of the body with build stamps removed
// (STAMP_PATTERNS, plus the allow file's body_ignore). Both sitemaps are also compared in full (<loc> and <lastmod>).
// --host-map counts B's host as freellmapihub.com in URLs (canonical, redirect targets, final URL, sitemap <loc>s), and
// A's too when A is not the production host itself (the tests run both sides on 127.0.0.1).
//
// Hard checks, which no allow-list entry can excuse: A never sends `x-robots-tag: noindex`; B sends it on every
// response unless B is the production host (B's noindex is then left out of the x-robots-tag comparison); the random
// path is a 404 and /googlee1498fc573a3811d.html a 200 without redirect, on both sides; every URL answers (a network
// error, a timeout or a redirect loop on either side fails, so two origins that are both down never look equal).
//
// At most RATE requests per second across both origins. Writes report.json and report.md to --out and exits 1 when
// a check fails or a difference is not in the allow file (every entry there needs a `reason`), 2 on a usage error.
// Exit codes are set through process.exitCode, never process.exit() (libuv assert crash on Windows).

import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const PROD = 'https://freellmapihub.com';
export const PROD_HOST = 'freellmapihub.com';
export const RATE = 4;
const TIMEOUT_MS = 20000;
const MAX_HOPS = 10;
const CONCURRENCY = 6;
const UA = 'free-llm-api-hub-parity-crawl';

export const GUIDE = '/guides/free-llm-api-without-credit-card';
export const GOOGLE_VERIFICATION = '/googlee1498fc573a3811d.html';
export const FIXED_PATHS = Object.freeze([
  '/', '/p/groq', '/p/groq.html', '/p/groq.md', GUIDE, `${GUIDE}/`,
  '/api/v1/providers.json', '/providers.csv', '/llms.txt', '/llms-full.txt', '/robots.txt', '/sitemap.xml',
  '/feed.xml', '/changes.atom', '/changes.xml', '/96087c6012c181da7cf7f9dcc88f9996.txt', GOOGLE_VERIFICATION,
  '/widget.js', '/embed.js', '/site.webmanifest', '/.well-known/security.txt', '/badge-verified.json',
]);
export const SITEMAPS = Object.freeze(['/sitemap.xml', '/sitemap-state.xml']);
export const FIELDS = Object.freeze(['status', 'chain', 'final_url', 'canonical', 'meta_robots', 'x_robots_tag', 'content_type',
  'acao', 'hsts', 'csp', 'cache_control', 'ga_id', 'body_sha256']);

// What changes from one build to the next without the page changing: removed before the body is hashed.
export const STAMP_PATTERNS = Object.freeze([
  /\/build\.json(?:\?[^"'\s<>)]*)?/g,
  /<meta\s+name=["']?(?:build|build-[\w-]+|generator)["']?[^>]*>/gi,
  /\sdata-build(?:-[\w-]+)?=(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,
  /"(?:build_?(?:sha|id|time|stamp|at)|built_?at|public_sha|deployed_?at)"\s*:\s*"[^"]*"/gi,
]);

// --- arguments ---------------------------------------------------------------------------------------------------

export function parseArgs(argv) {
  const opts = { hostMap: false, allow: null, redirects: join(ROOT, 'data/redirects.json') };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new Error(`${arg} needs a value`);
      return v;
    };
    if (arg === '--a') opts.a = origin(value(), '--a');
    else if (arg === '--b') opts.b = origin(value(), '--b');
    else if (arg === '--host-map') opts.hostMap = true;
    else if (arg === '--allow') opts.allow = value();
    else if (arg === '--redirects') opts.redirects = value();
    else if (arg === '--out') opts.out = value();
    else throw new Error(`unknown argument ${arg}`);
  }
  for (const k of ['a', 'b', 'out']) if (!opts[k]) throw new Error(`--${k} is required`);
  return opts;
}

/** An http(s) origin with no path, query or trailing slash. */
export function origin(value, name = 'origin') {
  let u;
  try { u = new URL(value); } catch { throw new Error(`${name}: not a URL: ${value}`); }
  if (!/^https?:$/.test(u.protocol) || (u.pathname !== '/' && u.pathname !== '') || u.search || u.hash) {
    throw new Error(`${name}: give an http(s) origin with no path, got ${value}`);
  }
  return u.origin;
}

/** The allow file: { allow: [{ path, field, reason, a?, b? }], body_ignore: [{ pattern, reason }] }. Throws on a bad entry. */
export function loadAllow(text) {
  const data = text == null ? {} : JSON.parse(text);
  const allow = Array.isArray(data.allow) ? data.allow : [];
  const bodyIgnore = Array.isArray(data.body_ignore) ? data.body_ignore : [];
  const bad = [];
  allow.forEach((e, i) => {
    if (!e || typeof e.reason !== 'string' || !e.reason.trim()) bad.push(`allow[${i}] has no reason`);
    if (!e || typeof e.path !== 'string' || !e.path) bad.push(`allow[${i}] has no path`);
    if (!e || (e.field !== '*' && !FIELDS.includes(e.field) && !['loc', 'lastmod'].includes(e.field))) bad.push(`allow[${i}] has an unknown field ${JSON.stringify(e?.field)}`);
  });
  const patterns = [];
  bodyIgnore.forEach((e, i) => {
    if (!e || typeof e.reason !== 'string' || !e.reason.trim()) bad.push(`body_ignore[${i}] has no reason`);
    try { patterns.push(new RegExp(e.pattern, 'g')); } catch { bad.push(`body_ignore[${i}] is not a valid pattern`); }
  });
  if (bad.length) throw new Error(`allow file: ${bad.join('; ')}`);
  return { allow, patterns };
}

// --- parsing -----------------------------------------------------------------------------------------------------

const xmlUnesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** The <url> entries of a sitemap, in order: [{ loc, lastmod }] (lastmod '' when absent). */
export function parseSitemap(xml) {
  const out = [];
  for (const m of String(xml || '').matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = /<loc>\s*([^<]+?)\s*<\/loc>/.exec(m[1]);
    if (!loc) continue;
    const lastmod = /<lastmod>\s*([^<]+?)\s*<\/lastmod>/.exec(m[1]);
    out.push({ loc: xmlUnesc(loc[1]), lastmod: lastmod ? lastmod[1] : '' });
  }
  return out;
}

/** The path (with query) of a URL, or null when it is not an absolute http(s) URL. */
export function pathOf(url) {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) ? u.pathname + u.search : null;
  } catch { return null; }
}

const attr = (tag, name) => {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  return m ? (m[1] ?? m[2] ?? m[3]) : null;
};

/** canonical, meta robots and GA measurement ID of an HTML body (null when absent). */
export function htmlFacts(html) {
  let canonical = null;
  let robots = null;
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    if ((attr(tag, 'rel') || '').toLowerCase().split(/\s+/).includes('canonical')) { canonical = attr(tag, 'href'); break; }
  }
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    if ((attr(tag, 'name') || '').toLowerCase() === 'robots') { robots = attr(tag, 'content'); break; }
  }
  const ga = [...new Set([...html.matchAll(/\bG-[A-Z0-9]{6,12}\b/g)].map((m) => m[0]))].sort();
  return { canonical, robots, ga: ga.length ? ga.join(',') : null };
}

export function stripStamps(body, extra = []) {
  let out = body;
  for (const re of [...STAMP_PATTERNS, ...extra]) out = out.replace(new RegExp(re.source, re.flags), '');
  return out;
}

const hasNoindex = (v) => typeof v === 'string' && /(^|[\s,:])noindex\b/i.test(v);
const withoutNoindex = (v) => {
  if (v == null) return v;
  const rest = v.split(',').map((s) => s.trim()).filter((s) => s && !/^noindex$/i.test(s));
  return rest.length ? rest.join(', ') : null;
};

// --- fetching ----------------------------------------------------------------------------------------------------

/** A shared throttle: each call resolves at least 1000/rps ms after the previous one. */
export function makeLimiter(rps = RATE, { now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const gap = 1000 / rps;
  let next = 0;
  return async () => {
    const t = now();
    const at = Math.max(t, next);
    next = at + gap;
    if (at > t) await sleep(at - t);
  };
}

/**
 * GET `url` and follow redirects by hand. Every hop counts against the limiter.
 * @returns {{ hops: {url, status, location}[], final: { url, status, headers, body } | null, error?: string }}
 */
export async function fetchChain(url, { fetchFn = fetch, limiter = async () => {}, maxHops = MAX_HOPS, timeoutMs = TIMEOUT_MS } = {}) {
  const hops = [];
  let current = url;
  for (let i = 0; i <= maxHops; i++) {
    await limiter();
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    let res;
    let body;
    try {
      res = await fetchFn(current, { redirect: 'manual', signal: ctrl.signal, headers: { 'user-agent': UA, 'cache-control': 'no-cache' } });
      body = await res.text();
    } catch (e) {
      clearTimeout(t);
      const msg = e?.name === 'AbortError' ? 'timeout' : String(e?.cause?.code || e?.message || e);
      hops.push({ url: current, status: 0, location: null });
      return { hops, final: null, error: msg };
    }
    clearTimeout(t);
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      let target;
      try { target = new URL(location, current).href; } catch { target = location; }
      hops.push({ url: current, status: res.status, location: target });
      current = target;
      continue;
    }
    hops.push({ url: current, status: res.status, location: null });
    const headers = {};
    for (const [k, v] of res.headers) headers[k.toLowerCase()] = v;
    return { hops, final: { url: current, status: res.status, headers, body } };
  }
  return { hops, final: null, error: `more than ${maxHops} redirects` };
}

// --- comparing ---------------------------------------------------------------------------------------------------

/** Rewrites a URL on `fromOrigin`'s host (http or https) to the production host, keeping the scheme. */
export function mapHost(url, fromOrigin) {
  if (typeof url !== 'string' || !fromOrigin) return url;
  const host = new URL(fromOrigin).host;
  try {
    const u = new URL(url);
    if (u.host !== host) return url;
    return `${u.protocol}//${PROD_HOST}${u.pathname}${u.search}${u.hash}`;
  } catch { return url; }
}

/** The compared fields of one fetched URL. `mapFrom` is the origin to map to the production host, or null. */
export function record(result, { mapFrom = null, bodyIgnore = [], dropNoindex = false } = {}) {
  const m = (u) => (mapFrom ? mapHost(u, mapFrom) : u);
  const f = result.final;
  const h = f?.headers || {};
  const type = h['content-type'] || null;
  const isHtml = !!f && /text\/html/i.test(type || '');
  const facts = isHtml ? htmlFacts(f.body) : { canonical: null, robots: null, ga: null };
  return {
    status: f ? f.status : 0,
    chain: result.hops.slice(0, -1).map((hop) => `${hop.status} ${m(hop.url)} -> ${m(hop.location)}`).join(' | ') || null,
    final_url: f ? m(f.url) : null,
    canonical: facts.canonical == null ? null : m(facts.canonical),
    meta_robots: facts.robots,
    x_robots_tag: dropNoindex ? withoutNoindex(h['x-robots-tag'] ?? null) : (h['x-robots-tag'] ?? null),
    content_type: type,
    acao: h['access-control-allow-origin'] ?? null,
    hsts: h['strict-transport-security'] ?? null,
    csp: h['content-security-policy'] ?? null,
    cache_control: h['cache-control'] ?? null,
    ga_id: facts.ga,
    body_sha256: f ? createHash('sha256').update(stripStamps(f.body, bodyIgnore)).digest('hex') : null,
    ...(result.error ? { error: result.error } : {}),
  };
}

export function diffRecords(ra, rb) {
  return FIELDS.filter((k) => ra[k] !== rb[k]).map((field) => ({ field, a: ra[field], b: rb[field] }));
}

/** Differences between two sitemaps' entries, with each side's locs mapped to the production host when asked. */
export function diffSitemaps(entriesA, entriesB, { mapFromA = null, mapFromB = null } = {}) {
  const A = new Map(entriesA.map((e) => [mapFromA ? mapHost(e.loc, mapFromA) : e.loc, e.lastmod]));
  const B = new Map(entriesB.map((e) => [mapFromB ? mapHost(e.loc, mapFromB) : e.loc, e.lastmod]));
  const out = [];
  for (const [loc, lastmod] of A) {
    if (!B.has(loc)) out.push({ loc, field: 'loc', a: loc, b: null });
    else if (B.get(loc) !== lastmod) out.push({ loc, field: 'lastmod', a: lastmod, b: B.get(loc) });
  }
  for (const loc of B.keys()) if (!A.has(loc)) out.push({ loc, field: 'loc', a: null, b: loc });
  return out;
}

const pathMatches = (pattern, path) => pattern === '*' || (pattern.endsWith('*') ? path.startsWith(pattern.slice(0, -1)) : pattern === path);

/** The allow entry that excuses a difference, or null. An entry with `a` or `b` also needs that exact value. */
export function allowedBy(diff, allow) {
  return allow.find((e) => pathMatches(e.path, diff.path) && (e.field === '*' || e.field === diff.field)
    && (!('a' in e) || e.a === diff.a) && (!('b' in e) || e.b === diff.b)) || null;
}

// --- the crawl ---------------------------------------------------------------------------------------------------

/** The paths to compare: A's sitemaps, the redirect sources and FIXED_PATHS, deduplicated in that order. */
export function pathSet({ sitemapEntries = [], redirects = {}, random }) {
  const seen = new Set();
  const out = [];
  const add = (p) => { if (p && !seen.has(p)) { seen.add(p); out.push(p); } };
  for (const e of sitemapEntries) add(pathOf(e.loc));
  for (const from of Object.keys(redirects)) add(from.startsWith('/') ? from : `/${from}`);
  for (const p of FIXED_PATHS) add(p);
  add(random);
  return out;
}

const isProd = (o) => new URL(o).host === PROD_HOST;

const loopback = (o) => ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(o).hostname);

/** RATE, or PARITY_RATE when both origins are on this machine (the fixture servers of the tests). */
export function rateFor(a, b, env = process.env) {
  const n = Number(env.PARITY_RATE);
  return loopback(a) && loopback(b) && Number.isFinite(n) && n > 0 ? n : RATE;
}

export async function crawl({ a, b, hostMap = false, allow = [], bodyIgnore = [], redirects = {}, fetchFn = fetch, limiter = makeLimiter(rateFor(a, b)), log = () => {} }) {
  const random = `/no-such-page-${randomBytes(6).toString('hex')}`;
  const bProd = isProd(b);
  // --host-map: each side's own host counts as the production host (a no-op for a side that is production already).
  const mapA = hostMap ? a : null;
  const mapB = hostMap ? b : null;
  const get = (url) => fetchChain(url, { fetchFn, limiter });

  // Sitemaps first: their <loc>s are part of the URL set, and they are compared in full.
  const sitemaps = {};
  for (const sm of SITEMAPS) {
    const [ra, rb] = await Promise.all([get(a + sm), get(b + sm)]);
    const entries = (r) => (r.final && r.final.status === 200 ? parseSitemap(r.final.body) : []);
    sitemaps[sm] = { a: entries(ra), b: entries(rb), statusA: ra.final?.status ?? 0, statusB: rb.final?.status ?? 0 };
  }
  const paths = pathSet({ sitemapEntries: SITEMAPS.flatMap((sm) => sitemaps[sm].a), redirects, random });

  // http:// for the apex of each side, and for www when both sides are the production host.
  const items = paths.map((p) => ({ id: p, a: a + p, b: b + p }));
  const http = (o) => `http://${new URL(o).host}/`;
  items.push({ id: 'http://<apex>/', a: http(a), b: http(b) });
  if (isProd(a) && bProd) items.push({ id: 'http://www.<apex>/', a: `http://www.${PROD_HOST}/`, b: `http://www.${PROD_HOST}/` });

  const results = new Array(items.length);
  let cursor = 0;
  let done = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      const [ra, rb] = await Promise.all([get(items[i].a), get(items[i].b)]);
      results[i] = { ...items[i], ra, rb };
      if (++done % 50 === 0) log(`parity: ${done}/${items.length} URLs`);
    }
  }));

  const urls = [];
  const differences = [];
  const failures = [];
  for (const { id, a: ua, b: ub, ra, rb } of results) {
    const recA = record(ra, { bodyIgnore, mapFrom: mapA });
    const recB = record(rb, { bodyIgnore, mapFrom: mapB, dropNoindex: !bProd });
    const diffs = diffRecords(recA, recB);
    urls.push({ path: id, a_url: ua, b_url: ub, a: recA, b: recB, differences: diffs.map((d) => d.field) });
    for (const d of diffs) differences.push({ path: id, ...d });

    for (const [side, r] of [['A', ra], ['B', rb]]) if (!r.final) failures.push({ path: id, check: 'unreachable', detail: `${side}: ${r.error}` });
    if (hasNoindex(ra.final?.headers?.['x-robots-tag'])) failures.push({ path: id, check: 'a-noindex', detail: `A sends x-robots-tag: ${ra.final.headers['x-robots-tag']}` });
    if (!bProd && rb.final && !hasNoindex(rb.final.headers['x-robots-tag'])) {
      failures.push({ path: id, check: 'b-indexable', detail: `B is not ${PROD_HOST} and does not send x-robots-tag: noindex` });
    }
    if (id === random) {
      for (const [side, r] of [['A', ra], ['B', rb]]) {
        if (!(r.hops.length === 1 && r.final?.status === 404)) failures.push({ path: id, check: 'random-404', detail: `${side}: ${describe(r)} (want a direct 404)` });
      }
    }
    if (id === GOOGLE_VERIFICATION) {
      for (const [side, r] of [['A', ra], ['B', rb]]) {
        if (!(r.hops.length === 1 && r.final?.status === 200)) failures.push({ path: id, check: 'google-verification', detail: `${side}: ${describe(r)} (want 200 without redirect)` });
      }
    }
  }
  for (const sm of SITEMAPS) {
    const s = sitemaps[sm];
    if (s.statusA !== s.statusB) differences.push({ path: `sitemap:${sm}`, field: 'status', a: s.statusA, b: s.statusB });
    for (const d of diffSitemaps(s.a, s.b, { mapFromA: mapA, mapFromB: mapB })) differences.push({ path: `sitemap:${sm}`, field: d.field, a: d.a, b: d.b, loc: d.loc });
  }

  const unexpected = [];
  const allowed = [];
  for (const d of differences) {
    const by = allowedBy(d, allow);
    if (by) allowed.push({ ...d, reason: by.reason });
    else unexpected.push(d);
  }
  return {
    a, b, host_map: hostMap, b_is_production: bProd, random_path: random, generated: new Date().toISOString(),
    counts: { urls: items.length, requests_rate_limit_per_s: RATE, sitemap_entries: Object.fromEntries(SITEMAPS.map((sm) => [sm, { a: sitemaps[sm].a.length, b: sitemaps[sm].b.length }])) },
    ok: !failures.length && !unexpected.length,
    failures, unexpected, allowed, urls,
  };
}

function describe(r) {
  if (!r.final) return r.error || 'no answer';
  return r.hops.length > 1 ? `${r.hops.map((h) => h.status).join(' -> ')} ending at ${r.final.url}` : `HTTP ${r.final.status}`;
}

const cell = (v) => (v == null ? '—' : `\`${String(v).replace(/`/g, "'").replace(/\|/g, '\\|').slice(0, 160)}\``);

export function renderMarkdown(report) {
  const lines = [];
  lines.push(`# Parity report: ${report.ok ? 'PASS' : 'FAIL'}`, '');
  lines.push(`- A: ${report.a}`, `- B: ${report.b}${report.host_map ? ` (host-mapped to ${PROD_HOST})` : ''}${report.b_is_production ? '' : ' — not the production host, so it must send `x-robots-tag: noindex`'}`);
  lines.push(`- URLs compared: ${report.counts.urls} (each requested from both origins, redirects followed by hand, at most ${report.counts.requests_rate_limit_per_s} requests/s)`);
  for (const [sm, c] of Object.entries(report.counts.sitemap_entries)) lines.push(`- ${sm}: ${c.a} entries on A, ${c.b} on B`);
  lines.push(`- Random path: \`${report.random_path}\``, `- Generated: ${report.generated}`, '');
  lines.push(`## Failed checks (${report.failures.length})`, '');
  if (!report.failures.length) lines.push('None.', '');
  else { lines.push('| Path | Check | Detail |', '| --- | --- | --- |'); for (const f of report.failures) lines.push(`| ${cell(f.path)} | ${f.check} | ${cell(f.detail)} |`); lines.push(''); }
  lines.push(`## Differences not in the allow-list (${report.unexpected.length})`, '');
  if (!report.unexpected.length) lines.push('None.', '');
  else {
    lines.push('| Path | Field | A | B |', '| --- | --- | --- | --- |');
    for (const d of report.unexpected.slice(0, 200)) lines.push(`| ${cell(d.loc ? `${d.path} ${d.loc}` : d.path)} | ${d.field} | ${cell(d.a)} | ${cell(d.b)} |`);
    if (report.unexpected.length > 200) lines.push('', `… and ${report.unexpected.length - 200} more in report.json.`);
    lines.push('');
  }
  lines.push(`## Allowed differences (${report.allowed.length})`, '');
  if (!report.allowed.length) lines.push('None.', '');
  else {
    const groups = new Map();
    for (const d of report.allowed) { const k = `${d.field}\u0000${d.reason}`; groups.set(k, (groups.get(k) || 0) + 1); }
    lines.push('| Field | URLs | Reason |', '| --- | --- | --- |');
    for (const [k, n] of groups) { const [field, reason] = k.split('\u0000'); lines.push(`| ${field} | ${n} | ${reason.replace(/\|/g, '\\|')} |`); }
    lines.push('');
  }
  return lines.join('\n');
}

// --- CLI ---------------------------------------------------------------------------------------------------------

async function main(argv) {
  let opts;
  let allowFile;
  let redirects;
  try {
    opts = parseArgs(argv);
    allowFile = loadAllow(opts.allow ? readFileSync(resolve(opts.allow), 'utf8') : null);
    redirects = JSON.parse(readFileSync(resolve(opts.redirects), 'utf8')).redirects || {};
  } catch (e) {
    console.error(`parity-crawl: ${e.message}`);
    console.error('usage: node scripts/parity-crawl.mjs --a <origin> --b <origin> [--host-map] [--allow scripts/parity-allow.json] --out <dir>');
    process.exitCode = 2;
    return;
  }
  const report = await crawl({ ...opts, allow: allowFile.allow, bodyIgnore: allowFile.patterns, redirects, log: (l) => console.log(l) });
  mkdirSync(opts.out, { recursive: true });
  writeFileSync(join(opts.out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(opts.out, 'report.md'), `${renderMarkdown(report)}\n`);
  console.log(`parity: ${report.ok ? 'PASS' : 'FAIL'} — ${report.counts.urls} URLs, ${report.failures.length} failed check(s), ${report.unexpected.length} unexpected and ${report.allowed.length} allowed difference(s). Report: ${join(opts.out, 'report.md')}`);
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
