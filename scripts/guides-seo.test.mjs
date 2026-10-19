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
  assert.equal(slugs.length, 9);
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

// ---- the seven collections and the hub ----
const readColl = (slug) => readFileSync(join(ROOT, 'site/collections', `${slug}.html`), 'utf8');
const colls = () => readdirSync(join(ROOT, 'site/collections')).filter((f) => f.endsWith('.html') && f !== 'index.html').map((f) => f.replace(/\.html$/, ''));

test('every collection opens with a direct answer of 40 to 55 words and a meta description that start from its live count', () => {
  const slugs = colls();
  assert.equal(slugs.length, 9);
  for (const slug of slugs) {
    const html = readColl(slug);
    const a = html.match(/<p class="answer"><strong>([^<]*)<\/strong><\/p>/);
    assert.ok(a, `${slug}: no direct answer`);
    const text = stripTags(a[1]);
    assert.ok(words(text) >= 40 && words(text) <= 55, `${slug}: ${words(text)} words`);
    const n = html.match(/<p class="count"><strong>(\d+) of (\d+)<\/strong> tracked providers match/);
    assert.ok(text.includes(n[1]), `${slug}: the answer must carry the count the table has (${n[1]})`);
    assert.doesNotMatch(text, /\{n\}|\{total\}|\{date\}/);
    const meta = html.match(/<meta name="description" content="([^"]*)"/)[1];
    assert.ok(meta.length <= 155, `${slug}: meta ${meta.length} characters`);
    assert.ok(meta.startsWith(n[1]), `${slug}: the description starts with the count`);
    assert.doesNotMatch(meta, /\{n\}|\{total\}|\{date\}/);
  }
});

test('every collection declares ItemList, BreadcrumbList and a FAQPage whose text is the visible text, with at least two questions', () => {
  for (const slug of colls()) {
    const html = readColl(slug);
    const graph = jsonld(html)['@graph'];
    const types = graph.map((g) => g['@type']);
    for (const t of ['ItemList', 'BreadcrumbList', 'FAQPage']) assert.ok(types.includes(t), `${slug}: no ${t}`);
    const qs = graph.find((g) => g['@type'] === 'FAQPage').mainEntity;
    assert.ok(qs.length >= 2, `${slug}: ${qs.length} questions`);
    const visible = stripTags(html.replace(/<script[\s\S]*?<\/script>/g, '')).replace(/\s+/g, ' ');
    for (const q of qs) {
      assert.ok(visible.includes(q.name), `${slug}: question "${q.name}" is not on the page`);
      assert.ok(visible.includes(q.acceptedAnswer.text.replace(/\s+/g, ' ')), `${slug}: answer to "${q.name}" differs from the visible text`);
    }
  }
});

test('a provider named in a collection text is a row of that collection table', () => {
  for (const slug of colls()) {
    const html = readColl(slug);
    const table = html.match(/<tbody>([\s\S]*?)<\/tbody>/)[1];
    const prose = stripTags(html.match(/<div class="wrap prose">([\s\S]*?)<table/)[1] + (html.match(/<h2>FAQ<\/h2>([\s\S]*?)(<h2>|<\/div>)/) || ['', ''])[1]);
    for (const p of list) {
      if (p.name.length < 4) continue;
      if (new RegExp(`\\b${p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(prose)) {
        assert.ok(table.includes(`>${p.name}<`), `${slug}: the text names ${p.name} but it is not in the table`);
      }
    }
  }
});

test('the hub has a direct answer, a title and a description from its live counts, and CollectionPage, BreadcrumbList and FAQPage that list all eighteen pages', () => {
  const html = readFileSync(join(ROOT, 'site/guides-and-collections/index.html'), 'utf8');
  const a = stripTags(html.match(/<p class="answer"><strong>([^<]*)<\/strong><\/p>/)[1]);
  assert.ok(words(a) >= 40 && words(a) <= 55, `${words(a)} words`);
  assert.ok(a.includes(`${guides().length} guides`) && a.includes(`${colls().length} collections`));
  const meta = html.match(/<meta name="description" content="([^"]*)"/)[1];
  assert.ok(meta.length <= 155 && meta.startsWith(`${guides().length} guides and ${colls().length} collections`));
  const title = html.match(/<title>([^<]*)<\/title>/)[1];
  assert.ok(title.length <= 60, `title ${title.length} characters`);
  const graph = jsonld(html)['@graph'];
  const page = graph.find((g) => g['@type'] === 'CollectionPage');
  assert.equal(page.mainEntity.itemListElement.length, 18);
  for (const e of page.mainEntity.itemListElement) {
    const path = e.url.replace('https://freellmapihub.com/', '');
    const file = path.startsWith('guides/') ? `site/${path}.html` : `site/${path}.html`;
    assert.ok(readFileSync(join(ROOT, file), 'utf8').length > 0, `${e.url} has no page`);
  }
  for (const t of ['BreadcrumbList', 'FAQPage']) assert.ok(graph.some((g) => g['@type'] === t), t);
  const visible = stripTags(html.replace(/<script[\s\S]*?<\/script>/g, '')).replace(/\s+/g, ' ');
  for (const q of graph.find((g) => g['@type'] === 'FAQPage').mainEntity) assert.ok(visible.includes(q.acceptedAnswer.text), q.name);
});
