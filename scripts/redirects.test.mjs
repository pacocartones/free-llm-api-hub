import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { redirectErrors, redirectEntries, redirectFile } from './lib/redirects.mjs';
import { resolveBestEntries } from './lib/best.mjs';
import { selectComparePairs } from './lib/compare.mjs';

const read = (rel) => JSON.parse(readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8'));
const REDIRECTS = read('data/redirects.json');
const providers = read('data/providers.json').providers;
const notFree = read('data/not-free.json');
// The static compare pages, chosen exactly as build.mjs chooses them.
const comparePaths = selectComparePairs(resolveBestEntries(read('data/best.json'), providers).map((e) => e.p)).map((cp) => cp.path);
const ctx = { providerSlugs: providers.map((p) => p.slug), comparePaths, notFree };

test('data/redirects.json: no source is built as a real page and every target exists', () => {
  assert.ok(redirectEntries(REDIRECTS).length > 0);
  assert.deepEqual(redirectErrors(REDIRECTS, ctx), []);
});

test('retired provider pages go to their /not-free/ section', () => {
  const ids = new Set(notFree.entries.map((e) => e.id));
  for (const [from, to] of redirectEntries(REDIRECTS).filter(([f]) => f.startsWith('/p/'))) {
    const anchor = to.match(/^\/not-free\/#(.+)$/)?.[1];
    assert.ok(anchor, `${from} → ${to}`);
    assert.ok(ids.has(anchor) || anchor === 'removed', `${from} → ${to}`);
  }
});

test('the sitemap lists no redirect source', () => {
  const sitemap = readFileSync(new URL('../site/sitemap.xml', import.meta.url), 'utf8');
  for (const [from] of redirectEntries(REDIRECTS)) assert.ok(!sitemap.includes(`.com${from}<`), `${from} is in site/sitemap.xml`);
});

test('a built site serves a noindex stub at every source', { skip: !existsSync(new URL('../site/p/', import.meta.url)) && 'site not built' }, () => {
  for (const [from, to] of redirectEntries(REDIRECTS)) {
    const file = new URL(`../site/${redirectFile(from)}`, import.meta.url);
    assert.ok(existsSync(file), `${from}: no stub (run npm run build)`);
    const html = readFileSync(file, 'utf8');
    assert.match(html, /<meta name="robots" content="noindex">/);
    assert.ok(html.includes(`<meta http-equiv="refresh" content="0; url=${to}">`), `${from}: refresh to ${to}`);
    assert.match(html, /<link rel="canonical" href="https:\/\/[^"#]+">/);
  }
});

test('redirectFile maps a site path to the file Pages serves', () => {
  assert.equal(redirectFile('/p/mistral'), 'p/mistral.html');
  assert.equal(redirectFile('/compare/a-vs-b/'), 'compare/a-vs-b/index.html');
});

test('redirectErrors rejects live sources, missing targets and bad paths', () => {
  const c = { providerSlugs: ['groq', 'ai-horde'], comparePaths: ['ai-horde-vs-groq'], notFree: { entries: [{ id: 'mistral' }], groups: [{ id: 'removed' }] } };
  const errs = (redirects) => redirectErrors({ redirects }, c);
  assert.deepEqual(errs({ '/p/mistral': '/not-free/#mistral', '/p/x': '/not-free/#removed', '/compare/x-vs-groq/': '/compare/?compare=ai-horde,groq' }), []);
  assert.equal(errs({ '/p/groq': '/' }).length, 1, 'provider still listed');
  assert.equal(errs({ '/compare/ai-horde-vs-groq/': '/compare/' }).length, 1, 'pair still has a page');
  assert.equal(errs({ '/p/x': '/not-free/#nope' }).length, 1, 'unknown anchor');
  assert.equal(errs({ '/p/x': '/compare/?compare=groq,gone' }).length, 1, 'unlisted provider in the compare target');
  assert.equal(errs({ '/p/x': '/p/gone' }).length, 1, 'retired provider page as target');
  assert.equal(errs({ '/guides/x': '/' }).length, 1, 'unsupported source');
  assert.equal(redirectErrors({ redirects: [] }, c).length, 1);
});
