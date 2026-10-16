import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { privateTree } from './lib/private-tree.mjs';
import { stripTags } from './lib/escape.mjs';

// The guides under /guides/: what a search result and an assistant quote must say, and that it is true of the page.
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = privateTree(REPO);
const providers = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8'));
const list = Array.isArray(providers) ? providers : providers.providers;
const generated = Array.isArray(providers) ? null : providers.generated;

const read = (slug) => readFileSync(join(ROOT, 'site/guides', `${slug}.html`), 'utf8');
const guides = () => readdirSync(join(ROOT, 'site/guides')).filter((f) => f.endsWith('.html') && f !== 'index.html').map((f) => f.replace(/\.html$/, ''));
const jsonld = (html) => JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
const words = (t) => t.trim().split(/\s+/).length;

before(() => { execFileSync(process.execPath, [join(ROOT, 'scripts/build.mjs')], { cwd: ROOT, stdio: 'pipe' }); });

test('every guide opens with a direct answer of 40 to 55 words that states its own count', () => {
  const slugs = guides();
  assert.equal(slugs.length, 7);
  for (const slug of slugs) {
    const html = read(slug);
    const a = html.match(/<p class="answer"><strong>([^<]*)<\/strong><\/p>/);
    assert.ok(a, `${slug}: no direct answer`);
    const text = stripTags(a[1]);
    assert.ok(words(text) >= 40 && words(text) <= 55, `${slug}: ${words(text)} words`);
    const n = Number(html.match(/<p class="count"><strong>(\d+)<\/strong> verified providers/)[1]);
    assert.ok(text.includes(String(n)), `${slug}: the answer must carry the count the table has (${n})`);
    assert.doesNotMatch(text, /\{n\}|\{date\}/);
  }
});

test('every guide has a meta description of at most 155 characters with the live count and no placeholder left', () => {
  for (const slug of guides()) {
    const html = read(slug);
    const meta = html.match(/<meta name="description" content="([^"]*)"/)[1];
    assert.ok(meta.length <= 155, `${slug}: ${meta.length} characters`);
    assert.doesNotMatch(meta, /\{n\}|\{date\}/);
    const n = html.match(/<p class="count"><strong>(\d+)<\/strong>/)[1];
    assert.ok(meta.startsWith(n), `${slug}: the description starts with the count (${n})`);
  }
});

test('every guide declares Article, BreadcrumbList and FAQPage, and the FAQ text is the visible text', () => {
  for (const slug of guides()) {
    const html = read(slug);
    const graph = jsonld(html)['@graph'];
    const types = graph.map((g) => g['@type']);
    for (const t of ['Article', 'BreadcrumbList', 'FAQPage']) assert.ok(types.includes(t), `${slug}: no ${t}`);
    const crumbs = graph.find((g) => g['@type'] === 'BreadcrumbList').itemListElement;
    assert.equal(crumbs.length, 3);
    assert.equal(crumbs[2].item, `https://freellmapihub.com/guides/${slug}`);
    const visible = html.replace(/<script[\s\S]*?<\/script>/g, '');
    for (const q of graph.find((g) => g['@type'] === 'FAQPage').mainEntity) {
      assert.ok(visible.includes(q.name), `${slug}: question "${q.name}" is not on the page`);
      assert.ok(stripTags(visible).replace(/\s+/g, ' ').includes(q.acceptedAnswer.text.replace(/\s+/g, ' ')), `${slug}: answer to "${q.name}" differs from the visible text`);
    }
    assert.ok(graph.find((g) => g['@type'] === 'Article').dateModified, `${slug}: no dateModified`);
  }
});

test('a provider named in a guide FAQ or intro is a row of that guide table, so the text cannot outlive the data', () => {
  for (const slug of guides()) {
    const html = read(slug);
    const table = html.match(/<tbody>([\s\S]*?)<\/tbody>/)[1];
    const prose = stripTags(html.match(/<div class="wrap prose">([\s\S]*?)<table/)[1] + (html.match(/<h2>FAQ<\/h2>([\s\S]*?)<h2>More guides/) || ['', ''])[1]);
    for (const p of list) {
      const name = p.name;
      if (name.length < 4) continue;
      if (new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(prose)) {
        assert.ok(table.includes(`>${name}<`), `${slug}: the text names ${name} but it is not in the table`);
      }
    }
  }
});

test('every guide links to its twin collection when a collection points to it', () => {
  const html = read('free-llm-api-without-credit-card');
  assert.match(html, /<h2>Related collections<\/h2>[\s\S]*href="..\/collections\/no-credit-card"/);
  assert.ok(generated === null || /^\d{4}-\d{2}-\d{2}$/.test(generated));
});
