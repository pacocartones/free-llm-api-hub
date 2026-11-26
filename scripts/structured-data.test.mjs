import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';
import { privateTree } from './lib/private-tree.mjs';
import { isoDateTime, datasetFacts, guideDates, guideArticle, jsonLdErrors, pageJsonLd, GUIDE_PUBLISHED, ISO_DATETIME_TZ } from './lib/structured-data.mjs';
import { datasetRef } from './lib/site-entity.mjs';

// Every JSON-LD block of the built site, against what Google's Rich Results Test flagged on 26-11: a Dataset without
// a description or licence, Articles without author or image, dates without a time and timezone, and an isPartOf
// that points at a type Google does not accept there.
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://freellmapihub.com';
let ROOT;

const walk = (d) => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  return statSync(p).isDirectory() ? walk(p) : p.endsWith('.html') ? [p] : [];
});
// Every node of a block, depth first.
function* nodes(v) {
  if (Array.isArray(v)) { for (const x of v) yield* nodes(x); return; }
  if (!v || typeof v !== 'object') return;
  yield v;
  for (const x of Object.values(v)) yield* nodes(x);
}
let pages; // [{ rel, blocks }]
const all = (type) => pages.flatMap(({ rel, blocks }) => blocks.flatMap((b) => [...nodes(b)].filter((n) => [].concat(n['@type'] ?? []).includes(type)).map((n) => ({ rel, n }))));

before(() => {
  ROOT = privateTree(REPO);
  execFileSync(process.execPath, [join(ROOT, 'scripts/build.mjs')], { cwd: ROOT, stdio: 'pipe' });
  pages = walk(join(ROOT, 'site')).map((f) => ({ rel: relative(join(ROOT, 'site'), f).split(sep).join('/'), blocks: pageJsonLd(readFileSync(f, 'utf8')) }));
});

test('isoDateTime: a recorded day becomes midnight UTC; a datetime with a timezone passes; anything else throws', () => {
  assert.equal(isoDateTime('2026-11-24'), '2026-11-24T00:00:00Z');
  assert.equal(isoDateTime('2026-11-24T10:00:00+01:00'), '2026-11-24T10:00:00+01:00');
  for (const bad of ['2026-11-24T10:00:00', '24/11/2026', '', null, undefined]) assert.throws(() => isoDateTime(bad), String(bad));
});

test('datasetRef refuses to emit a Dataset without a description and a licence', () => {
  assert.throws(() => datasetRef(SITE));
  const facts = datasetFacts({ verified: 3, asOf: '2026-11-24', license: 'https://opensource.org/licenses/MIT' });
  const d = datasetRef(SITE, facts);
  assert.ok(d.description.length >= 50 && d.description.includes('2026-11-24') && d.description.includes('3 verified'));
  assert.equal(d.license, 'https://opensource.org/licenses/MIT');
});

test('guide dates: published from the record, modified with the data and never before publication', () => {
  assert.deepEqual(guideDates('free-vision-apis', '2026-11-26'), { datePublished: '2026-10-20T00:00:00Z', dateModified: '2026-11-26T00:00:00Z' });
  assert.deepEqual(guideDates('free-chatbot-api', '2026-11-20'), { datePublished: '2026-11-26T00:00:00Z', dateModified: '2026-11-26T00:00:00Z' });
  assert.deepEqual(guideDates('not-yet-recorded', '2026-11-20'), { datePublished: '2026-11-20T00:00:00Z', dateModified: '2026-11-20T00:00:00Z' });
  const a = guideArticle({ site: SITE, slug: 'free-vision-apis', headline: 'H', description: 'D', asOf: '2026-11-26' });
  assert.equal(a.image, `${SITE}/og/guides/free-vision-apis.png`);
  assert.deepEqual([a.author['@type'], a.author['@id'], a.publisher['@type'], a.publisher['@id']], ['Person', `${SITE}/#creator`, 'Organization', `${SITE}/#publisher`]);
});

test('jsonLdErrors catches each problem the Rich Results Test reported', () => {
  const graph = (...n) => ({ '@context': 'https://schema.org', '@graph': n });
  const has = (ld, re) => assert.ok(jsonLdErrors(ld).some((e) => re.test(e)), `${re} in ${JSON.stringify(jsonLdErrors(ld))}`);
  has(graph({ '@type': 'WebPage', isPartOf: { '@type': 'Dataset', '@id': 'x', name: 'n' } }), /Dataset x has no description/);
  has(graph({ '@type': 'WebPage', about: { '@type': 'Dataset', name: 'n', description: 'd'.repeat(60) } }), /has no license/);
  has(graph({ '@type': 'Article', headline: 'h', datePublished: '2026-11-24T00:00:00Z', dateModified: '2026-11-24T00:00:00Z' }), /has no author/);
  has(graph({ '@type': 'Article', headline: 'h', author: {}, datePublished: '2026-11-24T00:00:00Z', dateModified: '2026-11-24T00:00:00Z' }), /has no image/);
  has(graph({ '@type': 'WebPage', dateModified: '2026-11-24' }), /not an ISO 8601 datetime with a timezone/);
  has(graph({ '@type': 'WebPage', dateModified: '2026-11-24T00:00:00' }), /not an ISO 8601 datetime with a timezone/);
  // The home block as it was: the Dataset isPartOf the WebSite.
  has(graph({ '@type': 'Dataset', name: 'n', description: 'd'.repeat(60), license: 'l', isPartOf: { '@id': 'w' } }, { '@type': 'WebSite', '@id': 'w' }), /Dataset\.isPartOf points at a WebSite/);
  has(graph({ '@type': 'WebPage', isPartOf: { '@id': 'nowhere' } }), /does not resolve/);
  assert.deepEqual(jsonLdErrors(graph({ '@type': 'WebPage', isPartOf: { '@type': 'WebSite' }, dateModified: '2026-11-24T00:00:00Z' })), []);
});

test('every built page: JSON-LD parses and passes the checks', () => {
  assert.ok(pages.filter((p) => p.blocks.length).length > 100, 'the walk found the pages');
  const errors = pages.flatMap(({ rel, blocks }) => blocks.flatMap((b) => jsonLdErrors(b, rel)));
  assert.deepEqual(errors, []);
});

test('every Dataset node has a name, a description and a licence', () => {
  const ds = all('Dataset');
  for (const p of ['index.html', 'not-free/index.html']) assert.ok(ds.some((d) => d.rel === p), `${p} names the dataset`);
  assert.ok(ds.some((d) => d.rel.startsWith('p/')), 'provider pages name the dataset');
  for (const { rel, n } of ds) {
    for (const k of ['name', 'description', 'license']) assert.ok(typeof n[k] === 'string' && n[k].trim(), `${rel}: Dataset without ${k}`);
  }
});

test('every Article has an author, an image that exists, and both dates', () => {
  const arts = all('Article');
  assert.equal(new Set(arts.map((a) => a.rel)).size, Object.keys(GUIDE_PUBLISHED).length, 'one Article per guide, and every guide has a recorded publication date');
  for (const { rel, n } of arts) {
    assert.ok(n.author?.name, `${rel}: author`);
    assert.ok(n.publisher?.name, `${rel}: publisher`);
    assert.ok(n.image?.startsWith(`${SITE}/`) && existsSync(join(ROOT, 'site', n.image.slice(SITE.length))), `${rel}: image ${n.image}`);
    for (const k of ['datePublished', 'dateModified']) assert.match(n[k] ?? '', ISO_DATETIME_TZ, `${rel}: ${k}`);
  }
});

test('every date in the JSON-LD is an ISO 8601 datetime with a timezone', () => {
  let seen = 0;
  for (const { rel, blocks } of pages) {
    for (const n of blocks.flatMap((b) => [...nodes(b)])) {
      for (const k of ['datePublished', 'dateModified', 'dateCreated', 'uploadDate']) {
        if (n[k] === undefined) continue;
        seen++;
        assert.match(n[k], ISO_DATETIME_TZ, `${rel}: ${k} ${n[k]}`);
        assert.ok(!Number.isNaN(Date.parse(n[k])), `${rel}: ${k} ${n[k]}`);
      }
    }
  }
  assert.ok(seen > 100, `dates found: ${seen}`);
});

test('no isPartOf points at an invalid type', () => {
  for (const { rel, blocks } of pages) {
    const errs = blocks.flatMap((b) => jsonLdErrors(b, rel)).filter((e) => /isPartOf/.test(e));
    assert.deepEqual(errs, []);
  }
  const home = pages.find((p) => p.rel === 'index.html').blocks[0]['@graph'];
  assert.equal(home.find((n) => n['@type'] === 'Dataset').isPartOf, undefined, 'the home Dataset is not "part of" the WebSite');
});
