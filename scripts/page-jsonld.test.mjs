import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { privateTree } from './lib/private-tree.mjs';
import { breadcrumbList, collectionPageJsonLd, comparePageJsonLd } from './lib/page-jsonld.mjs';
import { SECTION_OGS } from './lib/og.mjs';

// Structured data on the index pages, sitemap pages reachable by a link, noindex on the updates pagination, the
// change feed advertised everywhere and the section social images (web plan of 24-11, SEO-2/3/5/6/8, UX-3, UX-7).
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = privateTree(REPO);
const SITE = 'https://freellmapihub.com';
const read = (rel) => readFileSync(join(ROOT, 'site', rel), 'utf8');
const jsonld = (html) => JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
const graphTypes = (data) => (data['@graph'] || [data]).map((n) => n['@type']);

before(() => { execFileSync(process.execPath, [join(ROOT, 'scripts/build.mjs')], { cwd: ROOT, stdio: 'pipe' }); });

test('breadcrumbs start at the home page and number every step', () => {
  const b = breadcrumbList(SITE, [['Compare', `${SITE}/compare/`]]);
  assert.deepEqual(b.itemListElement.map((i) => [i.position, i.name, i.item]), [[1, 'Free LLM API Hub', `${SITE}/`], [2, 'Compare', `${SITE}/compare/`]]);
});

test('a collection page lists only the items it is given, and leaves mainEntity out when there are none', () => {
  const withItems = JSON.parse(collectionPageJsonLd({ site: SITE, name: 'X', url: `${SITE}/x/`, crumbs: [['X', `${SITE}/x/`]], items: [{ name: 'a', url: `${SITE}/a` }] }));
  assert.equal(withItems['@graph'][0].mainEntity.numberOfItems, 1);
  const without = JSON.parse(collectionPageJsonLd({ site: SITE, name: 'X', url: `${SITE}/x/`, crumbs: [] }));
  assert.equal(without['@graph'][0].mainEntity, undefined);
});

test('a comparison lists the two provider pages of this site', () => {
  const d = JSON.parse(comparePageJsonLd({ site: SITE, path: 'a-vs-b', a: { name: 'A', slug: 'a' }, b: { name: 'B', slug: 'b' } }));
  assert.deepEqual(d['@graph'][0].itemListElement.map((i) => i.url), [`${SITE}/p/a`, `${SITE}/p/b`]);
  assert.equal(d['@graph'][1].itemListElement.at(-1).item, `${SITE}/compare/a-vs-b/`);
});

test('the index pages that had no structured data now carry a page type and a breadcrumb', () => {
  const pages = {
    'models/index.html': 'CollectionPage', 'changes/index.html': 'CollectionPage', 'api/index.html': 'WebPage',
    'updates.html': 'CollectionPage', 'programs/index.html': 'CollectionPage', 'programs/startups.html': 'WebPage',
    'programs/research.html': 'WebPage', 'compare/index.html': 'CollectionPage',
  };
  for (const [rel, type] of Object.entries(pages)) {
    const types = graphTypes(jsonld(read(rel)));
    assert.ok(types.includes(type) && types.includes('BreadcrumbList'), `${rel}: ${types}`);
  }
  for (const d of readdirSync(join(ROOT, 'site/compare'), { withFileTypes: true }).filter((e) => e.isDirectory())) {
    assert.deepEqual(graphTypes(jsonld(read(`compare/${d.name}/index.html`))), ['ItemList', 'BreadcrumbList'], d.name);
  }
});

test('every list item in structured data points to a page of this site that the build wrote', () => {
  const fileFor = (url) => {
    let p = url.slice(SITE.length + 1);
    if (p === '' || p.endsWith('/')) p += 'index.html'; else if (!extname(p)) p += '.html';
    return join(ROOT, 'site', p);
  };
  const lists = ['models/index.html', 'compare/index.html', 'programs/index.html', ...readdirSync(join(ROOT, 'site/collections')).filter((f) => f.endsWith('.html') && f !== 'index.html').map((f) => `collections/${f}`)];
  for (const rel of lists) {
    const nodes = jsonld(read(rel))['@graph'];
    const list = nodes.find((n) => n['@type'] === 'ItemList') || nodes.find((n) => n.mainEntity)?.mainEntity;
    assert.ok(list && list.itemListElement.length, `${rel}: no ItemList`);
    for (const it of list.itemListElement) {
      assert.ok(it.url.startsWith(`${SITE}/`), `${rel}: ${it.url} is not on this site`);
      assert.ok(existsSync(fileFor(it.url)), `${rel}: ${it.url} was not built`);
    }
  }
});

test('every page in the sitemap is reachable by links from the home page', () => {
  const seen = new Set();
  const queue = [`${SITE}/`];
  const fileFor = (u) => {
    let p = u.slice(SITE.length + 1);
    if (p === '' || p.endsWith('/')) p += 'index.html'; else if (!extname(p)) p += '.html';
    return join(ROOT, 'site', p);
  };
  while (queue.length) {
    const u = queue.shift();
    if (seen.has(u)) continue;
    seen.add(u);
    const f = fileFor(u);
    if (!existsSync(f)) continue;
    for (const m of readFileSync(f, 'utf8').matchAll(/href="([^"#]+)/g)) {
      let abs;
      try { abs = new URL(m[1], u).href.split('#')[0].split('?')[0]; } catch { continue; }
      if (!abs.startsWith(`${SITE}/`) || /\.(json|csv|txt|xml|svg|png|css|js|ico|webmanifest|woff2)$/.test(abs)) continue;
      queue.push(abs.replace(/\.html$/, '').replace(/\/index$/, '/'));
    }
  }
  const sitemap = [...read('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.deepEqual(sitemap.filter((u) => !seen.has(u)), []);
});

test('updates pages after the first are noindex,follow; the first stays indexable', () => {
  assert.doesNotMatch(read('updates.html'), /name="robots"/);
  const dir = join(ROOT, 'site/updates/page');
  if (!existsSync(dir)) return; // fewer commits than one page (shallow clone)
  for (const n of readdirSync(dir)) assert.match(read(`updates/page/${n}/index.html`), /<meta name="robots" content="noindex,follow">/, `page ${n}`);
});

test('both feeds carry their own URL, and every generated page advertises the change feed', () => {
  assert.match(read('changes.xml'), /<atom:link href="https:\/\/freellmapihub\.com\/changes\.xml" rel="self" type="application\/rss\+xml"\/>/);
  if (existsSync(join(ROOT, 'site/feed.xml'))) assert.match(read('feed.xml'), /<atom:link href="https:\/\/freellmapihub\.com\/feed\.xml" rel="self"/);
  for (const rel of ['p/groq.html', 'models/index.html', 'api/index.html', 'changes/index.html', 'compare/index.html']) {
    const html = read(rel);
    assert.equal((html.match(/href="[./]*changes\.xml"/g) || []).length >= 1, true, rel);
    assert.equal((html.match(/<link rel="alternate"[^>]*changes\.xml"/g) || []).length, 1, `${rel}: one rel=alternate for changes.xml`);
  }
});

test('comparisons, coding tools and the API use their own social image, and each image exists', () => {
  for (const o of SECTION_OGS) assert.ok(existsSync(join(ROOT, 'site/og', o.file)), o.file);
  assert.match(read('compare/index.html'), /og:image" content="https:\/\/freellmapihub\.com\/og\/compare\.png"/);
  const pair = readdirSync(join(ROOT, 'site/compare'), { withFileTypes: true }).find((e) => e.isDirectory()).name;
  assert.match(read(`compare/${pair}/index.html`), /og:image" content="https:\/\/freellmapihub\.com\/og\/compare\.png"/);
  assert.match(read('coding-tools/index.html'), /og\/coding-tools\.png"/);
  assert.match(read('api/index.html'), /og\/api\.png"/);
});

test('no internal link points to the .html variant of a collection', () => {
  for (const d of readdirSync(join(ROOT, 'site/coding-tools'), { withFileTypes: true }).filter((e) => e.isDirectory())) {
    assert.doesNotMatch(read(`coding-tools/${d.name}/index.html`), /href="[^"]*collections\/[a-z-]+\.html"/, d.name);
  }
});
