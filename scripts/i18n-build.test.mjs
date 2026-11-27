// The Spanish build (docs/i18n.md) must not change the English site.
//
//   1. A default build writes nothing under site/es/ and no hreflang anywhere.
//   2. A build with --locales=es leaves every English file byte-identical, except the English twins of the translated
//      pages (the home page and the provider pages) and the sitemap index, which gain exactly the documented lines: the
//      hreflang alternates, og:locale, the footer's language link and the Spanish sitemap. Remove those and the bytes
//      are the default build's again. derived-fingerprints.json does not move (the draft is not pinned).
//   3. A default build after it removes site/es/ and restores every English file, byte for byte.
// That English output is the same before and after the i18n refactor is the drift gate's job (`npm run check`:
// committed pages and derived-fingerprints.json), which this change passes without regenerating anything.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { privateTree } from './lib/private-tree.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = privateTree(REPO);
const OUTSIDE_SITE = ['README.md', 'CITATION.cff', 'badge-verified.json', 'derived-fingerprints.json', 'docs/api.md', 'docs/schema.md', 'docs/credit-programs.md', 'docs/comparison-dimensions.md'];

const build = (args = []) => execFileSync(process.execPath, ['scripts/build.mjs', ...args], { cwd: ROOT, stdio: 'pipe', encoding: 'utf8', env: { ...process.env, BUILD_LOCALES: '' } });

function snapshot() {
  const out = new Map();
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, e.name);
      if (e.isDirectory()) walk(abs);
      else out.set(relative(ROOT, abs).split('\\').join('/'), readFileSync(abs));
    }
  };
  walk(join(ROOT, 'site'));
  walk(join(ROOT, 'collections'));
  for (const f of OUTSIDE_SITE) if (existsSync(join(ROOT, f))) out.set(f, readFileSync(join(ROOT, f)));
  return out;
}
const sha = (b) => createHash('sha256').update(b).digest('hex');

// What --locales=es may add to an English page, and nothing else.
const stripAlternates = (s) => s
  .replace(/<link rel="alternate" hreflang="[^"]*" href="[^"]*">\n/g, '')
  .replace(/<meta property="og:locale" content="[^"]*">\n/g, '')
  .replace(/<p class="foot-lang">[\s\S]*?<\/p>/g, '')
  .replace(/\n {2}<sitemap><loc>[^<]*\/es\/sitemap\.xml<\/loc><\/sitemap>/g, '');

let base, withEs, after, esLog;
before(() => {
  build();
  base = snapshot();
  esLog = build(['--locales=es']);
  withEs = snapshot();
  build();
  after = snapshot();
});

test('a default build writes no Spanish page and no hreflang', () => {
  assert.ok(![...base.keys()].some((k) => k.startsWith('site/es/')), 'site/es/ written without --locales');
  for (const [k, v] of base) if (k.endsWith('.html')) assert.ok(!v.includes('hreflang='), `${k} has hreflang in a default build`);
});

test('--locales=es leaves every English file byte-identical, except the documented alternates', () => {
  const touched = [];
  for (const [k, v] of base) {
    assert.ok(withEs.has(k), `${k} disappeared with --locales=es`);
    if (sha(v) === sha(withEs.get(k))) continue;
    touched.push(k);
    assert.ok(k === 'site/index.html' || /^site\/p\/[^/]+\.html$/.test(k) || k === 'site/sitemap-index.xml', `${k} changed with --locales=es`);
    assert.equal(stripAlternates(withEs.get(k).toString('utf8')), v.toString('utf8'), `${k}: more than the alternates changed`);
  }
  assert.ok(touched.includes('site/index.html') && touched.includes('site/sitemap-index.xml'), 'the home page and the sitemap index link the Spanish site');
  assert.ok(!touched.includes('derived-fingerprints.json'));
});

test('a default build after a Spanish one restores the English site byte for byte and removes site/es/', () => {
  assert.deepEqual([...after.keys()].sort(), [...base.keys()].sort());
  for (const [k, v] of base) assert.equal(sha(after.get(k)), sha(v), `${k} differs after returning to a default build`);
});

test('the Spanish build reports no missing translation', () => {
  assert.doesNotMatch(esLog, /i18n: \d+ key/);
});

test('Spanish pages: lang="es", their own canonical, reciprocal hreflang with x-default', () => {
  const home = withEs.get('site/es/index.html').toString('utf8');
  assert.match(home, /<html lang="es"/);
  assert.match(home, /<link rel="canonical" href="https:\/\/freellmapihub\.com\/es\/">/);
  assert.match(home, /hreflang="en" href="https:\/\/freellmapihub\.com\/">/);
  assert.match(home, /hreflang="x-default" href="https:\/\/freellmapihub\.com\/">/);
  assert.match(withEs.get('site/index.html').toString('utf8'), /hreflang="es" href="https:\/\/freellmapihub\.com\/es\/">/);

  const slugs = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8')).providers.map((p) => p.slug);
  for (const slug of slugs) {
    const es = withEs.get(`site/es/p/${slug}.html`)?.toString('utf8');
    assert.ok(es, `site/es/p/${slug}.html`);
    assert.match(es, /<html lang="es"/);
    assert.ok(es.includes(`<link rel="canonical" href="https://freellmapihub.com/es/p/${slug}">`), `${slug}: canonical`);
    assert.ok(es.includes(`<link rel="alternate" hreflang="en" href="https://freellmapihub.com/p/${slug}">`), `${slug}: alternate en`);
    const en = withEs.get(`site/p/${slug}.html`).toString('utf8');
    assert.ok(en.includes(`<link rel="alternate" hreflang="es" href="https://freellmapihub.com/es/p/${slug}">`), `${slug}: the English page links back`);
    assert.doesNotMatch(es, /\(opens in a new tab\)/, `${slug}: English screen-reader note on a Spanish page`);
  }
});

test('the Spanish sitemap lists every Spanish page with its alternates, and the index names it', () => {
  const xml = withEs.get('site/es/sitemap.xml').toString('utf8');
  const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
  const slugs = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8')).providers.map((p) => p.slug);
  assert.deepEqual(locs, ['https://freellmapihub.com/es/', ...slugs.map((s) => `https://freellmapihub.com/es/p/${s}`)]);
  assert.equal((xml.match(/hreflang="x-default"/g) || []).length, locs.length);
  assert.match(withEs.get('site/sitemap-index.xml').toString('utf8'), /<loc>https:\/\/freellmapihub\.com\/es\/sitemap\.xml<\/loc>/);
});
