import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { privateTree } from './lib/private-tree.mjs';
import { parseCitation, datasetJsonLd, datasetJsonLdErrors, datasetJsonLdScript } from './lib/dataset-jsonld.mjs';
import { datasetAsOf } from './lib/release-stamp.mjs';

// The home page's schema.org Dataset block (Google Dataset Search) and the ways in to the change history.
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://freellmapihub.com';

// A site URL exists in the build when its file does: "/" and "dir/" are index.html, other paths are files.
const siteFile = (root) => (url) => {
  const rel = url.slice(SITE.length + 1);
  return existsSync(join(root, 'site', rel === '' || rel.endsWith('/') ? `${rel}index.html` : rel));
};

test('CITATION.cff: the fields the Dataset block reads', () => {
  const c = parseCitation(readFileSync(join(REPO, 'CITATION.cff'), 'utf8'));
  assert.ok(c.title && c.abstract && c.license && c['repository-code']);
  assert.ok(c.abstract.length >= 50, 'the abstract is the description and must be at least 50 characters');
  assert.ok(c.keywords.length > 0);
  assert.ok(c.author?.alias || c.author?.name, 'the creator comes from authors');
});

test('parseCitation reads a folded abstract, quoted values and a list', () => {
  const c = parseCitation('title: "T"\nabstract: >-\n  one\n  two\nkeywords:\n  - a\n  - "b"\nauthors:\n  - alias: x\n    website: "https://e.x"\nlicense: MIT\n');
  assert.deepEqual(c, { title: 'T', abstract: 'one two', keywords: ['a', 'b'], author: { alias: 'x', website: 'https://e.x' }, license: 'MIT' });
});

test('datasetJsonLd: deterministic, from the data; the validator catches what Google requires', () => {
  const data = { version: '9.8.7', generated: '2026-01-01', providers: [{ last_verified: '2026-01-05' }, { last_verified: '2025-12-30' }, { last_verified: null }] };
  const citation = parseCitation(readFileSync(join(REPO, 'CITATION.cff'), 'utf8'));
  const a = datasetJsonLd({ data, citation, site: SITE, asOf: datasetAsOf(data) });
  assert.deepEqual(a, datasetJsonLd({ data, citation, site: SITE, asOf: datasetAsOf(data) }));
  assert.equal(a.version, '9.8.7');
  assert.equal(a.dateModified, '2026-01-05');
  assert.equal(a.temporalCoverage, '2025-12-30/2026-01-05');
  assert.equal(a.citation, undefined, 'Google: citation is for related articles, not the dataset itself');
  assert.deepEqual(datasetJsonLdErrors(a, { site: SITE, siteFile: () => true }), []);
  assert.ok(datasetJsonLdErrors({ ...a, description: 'short' }, { site: SITE, siteFile: () => true }).some((e) => /description/.test(e)));
  assert.ok(datasetJsonLdErrors({ ...a, name: '' }, { site: SITE, siteFile: () => true }).some((e) => /name/.test(e)));
  assert.ok(datasetJsonLdErrors(a, { site: SITE, siteFile: () => false }).some((e) => /not in the build/.test(e)));
  assert.ok(!datasetJsonLdScript({ x: '</script>' }).includes('</script>"'), 'a "<" in the data cannot close the block');
});

let ROOT;
before(() => {
  ROOT = privateTree(REPO);
  execFileSync(process.execPath, [join(ROOT, 'scripts/build.mjs')], { cwd: ROOT, stdio: 'pipe' });
});

test('the home page carries one Dataset block that parses, is valid and points at files in the build', () => {
  const html = readFileSync(join(ROOT, 'site/index.html'), 'utf8');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.equal(blocks.length, 1, 'one JSON-LD block on the home page');
  const ld = JSON.parse(blocks[0][1]);
  assert.deepEqual(datasetJsonLdErrors(ld, { site: SITE, siteFile: siteFile(ROOT) }), []);
  const data = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8'));
  assert.equal(ld.version, data.version);
  assert.equal(ld.dateModified, datasetAsOf(data));
  const formats = Object.fromEntries(ld.distribution.map((d) => [d.contentUrl.slice(SITE.length), d.encodingFormat]));
  assert.equal(formats['/api/v1/providers.json'], 'application/json');
  assert.equal(formats['/providers.csv'], 'text/csv');
  assert.equal(ld.sameAs, 'https://github.com/pacocartones/free-llm-api-hub');
});

test('home and /changes/ advertise the change feed; both link to the change history', () => {
  const home = readFileSync(join(ROOT, 'site/index.html'), 'utf8');
  const changes = readFileSync(join(ROOT, 'site/changes/index.html'), 'utf8');
  const head = (html) => html.slice(0, html.indexOf('</head>'));
  for (const [name, html] of [['home', home], ['changes', changes]]) {
    assert.match(head(html), /<link rel="alternate" type="application\/rss\+xml" title="[^"]+" href="(\.\.\/)?changes\.xml">/, `${name}: the change feed in <head>`);
  }
  const start = home.match(/<nav\b[^>]*aria-label="Get started"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
  assert.match(start, /<a href="changes\/">See what changed<\/a>/, 'home: a visible link to /changes/');
  assert.match(home.slice(home.indexOf('<footer')), /<a href="changes\/">What changed<\/a>/, 'home footer: What changed');
  const hero = changes.match(/<section class="page-hero[^"]*">([\s\S]*?)<\/section>/)?.[1];
  assert.match(hero, /<a class="btn primary" href="\.\.\/changes\.xml" type="application\/rss\+xml">Subscribe via RSS<\/a>/, '/changes/: a Subscribe button');
  assert.ok(existsSync(join(ROOT, 'site/changes.xml')) && existsSync(join(ROOT, 'site/api/v1/changes.json')), 'the feed and the JSON exist');
});
