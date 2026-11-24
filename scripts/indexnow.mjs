#!/usr/bin/env node
// indexnow.mjs — announce the URLs a deploy adds or changes to IndexNow (Bing, Yandex and the other participating
// engines). Best effort by design: every path ends with exit code 0, so it can never fail the deploy.
//
//   node scripts/indexnow.mjs --plan     before the deploy (pages.yml build job, after the build): compare the built
//                                        site/sitemap*.xml with the copies still live, print the changed URLs and,
//                                        under GitHub Actions, write them to the step output `urls` (a JSON array)
//   node scripts/indexnow.mjs --submit   after the deploy is verified (pages.yml indexnow job): read that array
//                                        from INDEXNOW_URLS, check the key file is live, POST it to api.indexnow.org
//
// A sitemap that cannot be fetched is skipped (nothing from it is sent); one that answers 404 counts as empty, so
// a sitemap published for the first time announces all of its URLs. The pure logic is in lib/indexnow.mjs.

import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { INDEXNOW_ENDPOINT, INDEXNOW_KEY, SITE, SITEMAPS, URL_CAP, changedUrls, describeStatus, indexNowBody, ownUrl, parseSitemap } from './lib/indexnow.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TIMEOUT_MS = 15000;

async function fetchText(url, { fetchFn = fetch, init = {} } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetchFn(url, { ...init, signal: ctrl.signal, redirect: 'follow' });
    return { status: res.status, text: await res.text() };
  } catch (e) {
    return { error: e?.name === 'AbortError' ? 'timeout' : String(e?.message || e) };
  } finally {
    clearTimeout(t);
  }
}

/** The changed URLs across the sitemaps, capped. `readLocal(name)` returns the built sitemap or null. */
export async function plan({ fetchFn = fetch, readLocal, log = console.log, cap = URL_CAP } = {}) {
  const prev = new Map();
  const next = new Map();
  for (const name of SITEMAPS) {
    const local = readLocal(name);
    if (local == null) { log(`indexnow: ${name} was not built, skipped`); continue; }
    const live = await fetchText(`${SITE}/${name}`, { fetchFn });
    if (live.error || (live.status !== 200 && live.status !== 404)) {
      log(`indexnow: the live ${name} could not be read (${live.error || `HTTP ${live.status}`}), so none of its URLs are sent`);
      continue;
    }
    for (const [k, v] of parseSitemap(local)) next.set(k, v);
    if (live.status === 200) for (const [k, v] of parseSitemap(live.text)) prev.set(k, v);
  }
  const result = changedUrls(prev, next, { cap });
  log(`indexnow: ${result.total} URL(s) added or changed${result.truncated ? `, sending the newest ${cap}` : ''}`);
  for (const u of result.urls) log(`  ${u}`);
  return result.urls;
}

/** POST the URLs; returns the HTTP status, or null when nothing was sent. Never throws. */
export async function submit(urls, { fetchFn = fetch, log = console.log } = {}) {
  const list = (Array.isArray(urls) ? urls : []).filter((u) => typeof u === 'string' && ownUrl(u));
  if (!list.length) { log('indexnow: nothing to submit'); return null; }
  const keyFile = await fetchText(`${SITE}/${INDEXNOW_KEY}.txt`, { fetchFn });
  if (keyFile.error || keyFile.status !== 200 || keyFile.text.trim() !== INDEXNOW_KEY) {
    log(`indexnow: the key file is not live yet (${keyFile.error || `HTTP ${keyFile.status}`}), nothing submitted`);
    return null;
  }
  const res = await fetchText(INDEXNOW_ENDPOINT, {
    fetchFn,
    init: { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify(indexNowBody(list)) },
  });
  if (res.error) { log(`indexnow: the request failed (${res.error}); the deploy is not affected`); return null; }
  log(`indexnow: ${list.length} URL(s) → ${res.status} ${describeStatus(res.status)}`);
  return res.status;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2];
  try {
    if (mode === '--plan') {
      const urls = await plan({ readLocal: (name) => { const f = join(ROOT, 'site', name); return existsSync(f) ? readFileSync(f, 'utf8') : null; } });
      if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `urls=${JSON.stringify(urls)}\n`);
    } else if (mode === '--submit') {
      let urls = [];
      try { urls = JSON.parse(process.env.INDEXNOW_URLS || '[]'); } catch { console.log('indexnow: INDEXNOW_URLS is not a JSON array, nothing submitted'); }
      await submit(urls);
    } else {
      console.log('usage: node scripts/indexnow.mjs --plan | --submit');
    }
  } catch (e) {
    console.log(`indexnow: unexpected error (${e?.message || e}); the deploy is not affected`);
  }
  process.exit(0);
}
