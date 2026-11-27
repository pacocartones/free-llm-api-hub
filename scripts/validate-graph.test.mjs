// validate.mjs is the data validator: it checks data/ and the prose that quotes it, and it must stay runnable without the
// website. The site is moving to its own repository, so validate.mjs may not reach a module that renders HTML or read site/.
// This test walks the static import graph of scripts/validate.mjs and fails on any module listed below.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const VALIDATE = join(ROOT, 'scripts/validate.mjs');

// The modules that write HTML (pages, page fragments, JSON-LD, SVG, the client bundles), by file name under scripts/ or
// scripts/lib/. Listed by hand on purpose: a new renderer is added here when it is written.
const HTML_MODULES = [
  'build.mjs', 'icons.mjs', 'schema-docs.mjs',
  'aura.mjs', 'flags.mjs', 'stamp.mjs', 'rows.mjs',
  'provider-faq.mjs', 'structured-data.mjs', 'page-jsonld.mjs', 'dataset-jsonld.mjs', 'site-entity.mjs',
  'analytics.mjs', 'assets.mjs', 'csp.mjs', 'links.mjs', 'tables.mjs', 'markdown.mjs', 'expiry.mjs',
  'compare.mjs', 'compare-faq.mjs', 'not-free.mjs', 'stale-claims.mjs', 'long-guides.mjs',
  'model-pages.mjs', 'model-families.mjs', 'model-index.mjs', 'provider-sections.mjs', 'provider-badges.mjs',
  'score-bar.mjs', 'coverage.mjs', 'quality.mjs', 'free-gpu.mjs', 'free-coding-tools.mjs', 'data-policy-page.mjs',
  'contributors-page.mjs', 'find-page.mjs', 'home-faq.mjs', 'home-first-use.mjs', 'best-facts.mjs',
  'report-mistake.mjs', 'embed-page.mjs', 'claims-table.mjs', 'badge-svg.mjs', 'og.mjs', 'og-art.mjs', 'wordmark.mjs',
];
// Every page-* module is a page renderer, except page-text.mjs: it turns a fetched source page into text for the quote
// register (data/quotes.json) and writes no HTML.
const isPageModule = (name) => /^page-/.test(name) && name !== 'page-text.mjs';

/** The modules validate.mjs reaches through static and dynamic imports, as paths relative to the repository root. */
function importGraph(entry) {
  const seen = new Map(); // file -> the file that imported it first
  const queue = [[entry, null]];
  while (queue.length) {
    const [file, from] = queue.shift();
    if (seen.has(file)) continue;
    seen.set(file, from);
    const src = readFileSync(file, 'utf8');
    const specs = [
      ...src.matchAll(/^\s*(?:import|export)\s[^;]*?\bfrom\s*['"]([^'"]+)['"]/gm),
      ...src.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm),
      ...src.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
    ].map((m) => m[1]);
    assert.doesNotMatch(src, /\bimport\s*\(\s*[^'"\s]/, `${relative(ROOT, file)}: a dynamic import with a computed path cannot be checked`);
    for (const spec of specs) if (spec.startsWith('.')) queue.push([resolve(dirname(file), spec), file]);
  }
  return [...seen].map(([file, from]) => ({ file: relative(ROOT, file).split('\\').join('/'), from: from && relative(ROOT, from).split('\\').join('/') }));
}

test('the forbidden list names modules that exist', () => {
  for (const name of HTML_MODULES) {
    assert.ok(existsSync(join(ROOT, 'scripts', name)) || existsSync(join(ROOT, 'scripts/lib', name)), `${name} is listed but not found`);
  }
});

test('validate.mjs reaches no module that writes HTML', () => {
  const graph = importGraph(VALIDATE);
  assert.ok(graph.some((m) => m.file === 'scripts/lib/slug.mjs'), 'the walk should reach scripts/lib/slug.mjs');
  const bad = graph.filter(({ file }) => {
    const name = basename(file);
    return HTML_MODULES.includes(name) || isPageModule(name);
  });
  assert.deepEqual(bad.map(({ file, from }) => `${file} (imported by ${from})`), []);
});

test('validate.mjs does not read site/', () => {
  const src = readFileSync(VALIDATE, 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(src, /['"`]site\//, 'validate.mjs checks data/; checks of site/ belong to a test or the build');
});
