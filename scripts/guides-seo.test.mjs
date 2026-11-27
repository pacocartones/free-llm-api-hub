import { test, before } from 'node:test';
import { humanDate } from './lib/dates.mjs';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { privateTree } from './lib/private-tree.mjs';
import { stripTags } from './lib/escape.mjs';
import { LONG_GUIDES } from './lib/long-guides.mjs';

// The guides under /guides/: what a search result and an assistant quote must say, and that it is true of the page.
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = privateTree(REPO);
const providers = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8'));
const list = Array.isArray(providers) ? providers : providers.providers;
const generated = Array.isArray(providers) ? null : providers.generated;

const read = (slug) => readFileSync(join(ROOT, 'site/guides', `${slug}.html`), 'utf8');
// The list guides (a direct answer and one table). The long-form guides share /guides/ and have their own tests
// (long-guides.test.mjs); the hub and the metadata checks below cover both.
const LONG = new Set(LONG_GUIDES.map((g) => g.slug));
const allGuides = () => readdirSync(join(ROOT, 'site/guides')).filter((f) => f.endsWith('.html') && f !== 'index.html').map((f) => f.replace(/\.html$/, ''));
const guides = () => allGuides().filter((s) => !LONG.has(s));
const jsonld = (html) => JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
const words = (t) => t.trim().split(/\s+/).length;

before(() => { execFileSync(process.execPath, [join(ROOT, 'scripts/build.mjs')], { cwd: ROOT, stdio: 'pipe' }); });

test('every guide opens with a direct answer of 40 to 55 words that states its own count', () => {
  const slugs = guides();
  assert.equal(slugs.length, 5);
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
        // The table is HTML: a name with an ampersand (W&B Inference) is written escaped in the cell.
        assert.ok(table.includes(`>${name}<`) || table.includes(`>${name.replace(/&/g, '&amp;')}<`), `${slug}: the text names ${name} but it is not in the table`);
      }
    }
  }
});

test('every guide links to its twin collection when a collection points to it', () => {
  const html = read('free-llm-api-without-credit-card');
  assert.match(html, /<h2>Related collections<\/h2>[\s\S]*href="..\/collections\/no-credit-card"/);
  assert.ok(generated === null || /^\d{4}-\d{2}-\d{2}$/.test(generated));
});

// ---- the ten collections and the hub ----
const readColl = (slug) => readFileSync(join(ROOT, 'site/collections', `${slug}.html`), 'utf8');
const colls = () => readdirSync(join(ROOT, 'site/collections')).filter((f) => f.endsWith('.html') && f !== 'index.html').map((f) => f.replace(/\.html$/, ''));

test('every collection opens with a direct answer of 40 to 55 words and a meta description that start from its live count', () => {
  const slugs = colls();
  assert.equal(slugs.length, 10);
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

test('the hub has a direct answer, a title and a description from its live counts, and CollectionPage, BreadcrumbList and FAQPage that list every guide and collection page', () => {
  const html = readFileSync(join(ROOT, 'site/guides-and-collections/index.html'), 'utf8');
  const a = stripTags(html.match(/<p class="answer"><strong>([^<]*)<\/strong><\/p>/)[1]);
  assert.ok(words(a) >= 40 && words(a) <= 55, `${words(a)} words`);
  assert.ok(a.includes(`${guides().length} guides`) && a.includes(`${colls().length} collections`));
  const meta = html.match(/<meta name="description" content="([^"]*)"/)[1];
  assert.ok(meta.length <= 155 && meta.startsWith(`${allGuides().length} guides and ${colls().length} collections`));
  const title = html.match(/<title>([^<]*)<\/title>/)[1];
  assert.ok(title.length <= 60, `title ${title.length} characters`);
  const graph = jsonld(html)['@graph'];
  const page = graph.find((g) => g['@type'] === 'CollectionPage');
  assert.equal(page.mainEntity.itemListElement.length, allGuides().length + colls().length);
  assert.equal(allGuides().length, guides().length + LONG_GUIDES.length);
  for (const e of page.mainEntity.itemListElement) {
    const path = e.url.replace('https://freellmapihub.com/', '');
    const file = path.startsWith('guides/') ? `site/${path}.html` : `site/${path}.html`;
    assert.ok(readFileSync(join(ROOT, file), 'utf8').length > 0, `${e.url} has no page`);
  }
  for (const t of ['BreadcrumbList', 'FAQPage']) assert.ok(graph.some((g) => g['@type'] === t), t);
  const visible = stripTags(html.replace(/<script[\s\S]*?<\/script>/g, '')).replace(/\s+/g, ' ');
  for (const q of graph.find((g) => g['@type'] === 'FAQPage').mainEntity) assert.ok(visible.includes(q.acceptedAnswer.text), q.name);
});

test('/coding-tools/ has a CollectionPage whose ItemList names every tool of both data files, a BreadcrumbList, and no Product or Offer', () => {
  const html = readFileSync(join(ROOT, 'site/coding-tools/index.html'), 'utf8');
  const graph = jsonld(html)['@graph'];
  for (const t of ['CollectionPage', 'BreadcrumbList']) assert.ok(graph.some((g) => g['@type'] === t), t);
  const page = graph.find((g) => g['@type'] === 'CollectionPage');
  assert.equal(page.mainEntity['@type'], 'ItemList');
  const tools = [
    ...JSON.parse(readFileSync(join(ROOT, 'data/coding-tools.json'), 'utf8')).entries,
    ...JSON.parse(readFileSync(join(ROOT, 'data/coding-tools-own-key.json'), 'utf8')).entries,
  ];
  assert.equal(page.mainEntity.numberOfItems, tools.length);
  assert.deepEqual(page.mainEntity.itemListElement.map((e) => [e.position, e.name]), tools.map((t, i) => [i + 1, t.name]), 'every tool, in the order the page shows them');
  for (const e of page.mainEntity.itemListElement) {
    const path = e.url.replace('https://freellmapihub.com/', '');
    assert.match(path, /^coding-tools\/[a-z0-9-]+\/$/);
    assert.ok(readFileSync(join(ROOT, 'site', path, 'index.html'), 'utf8').length > 0, `${e.url} has no page`);
  }
  assert.doesNotMatch(JSON.stringify(graph), /"(Product|Offer|AggregateOffer|SoftwareApplication)"/, 'a free plan is a quoted claim, not a price the dataset verifies');
});

test('image guide lists the image APIs that don’t generate images in their own table, matching the broad image modality', () => {
  const html = read('free-image-generation-apis');
  assert.match(html, /<h1>Free image generation APIs<\/h1>/);
  assert.match(html, /aria-label="Other free image APIs"/);
  assert.match(html, /their entries don’t name image generation/);
});

// Answer engines cite titles with a count and a date (#911): every list-type long guide states "({n}, Checked)". The
// production checklist is not a list of providers, and the rankings and model families sit with it among the "how to
// choose" guides, each with its own count wording ("tiers ranked", "Rated", "Providers").
const HOW_TO_CHOOSE = new Set(['choose-free-llm-api-for-production', 'free-llm-api-highest-limits', 'strongest-free-llm-api', 'free-open-source-llm-api']);
test('every list-type long guide has its count and ", Checked)" in its title', () => {
  // The titles #911 rewrote, held to 60 characters at the counts the data gives.
  const SHORT = new Set(['openai-api-alternatives', 'free-llm-api-for-coding', 'free-api-for-rag', 'free-llm-api-for-ai-agents', 'free-chatbot-api']);
  for (const g of LONG_GUIDES) {
    if (HOW_TO_CHOOSE.has(g.slug)) continue;
    assert.ok(g.title.includes('({n}, Checked)'), `${g.slug}: ${g.title}`);
    const title = read(g.slug).match(/<title>([^<]*)<\/title>/)[1];
    assert.match(title, /\(\d+, Checked\)/, `${g.slug}: ${title}`);
    if (SHORT.has(g.slug)) assert.ok(title.length <= 60, `${g.slug}: title ${title.length} characters`);
  }
});

test('discovery pages have unique metadata, self canonicals and exactly one sitemap entry', () => {
  const sitemap = readFileSync(join(ROOT, 'site/sitemap.xml'), 'utf8');
  const titles = new Set(), descriptions = new Set();
  for (const [section, slugs] of [['guides', allGuides()], ['collections', colls()]]) {
    for (const slug of slugs) {
      const html = section === 'guides' ? read(slug) : readColl(slug);
      const url = `https://freellmapihub.com/${section}/${slug}`;
      assert.equal((html.match(/<link rel="canonical"/g) || []).length, 1, url);
      assert.ok(html.includes(`<link rel="canonical" href="${url}"`), url);
      assert.equal(sitemap.split(`<loc>${url}</loc>`).length - 1, 1, url);
      assert.doesNotMatch(html, /<meta name="robots" content="noindex/);
      for (const [pattern, seen] of [[/<title>([^<]*)<\/title>/, titles], [/<meta name="description" content="([^"]*)"/, descriptions]]) {
        const value = html.match(pattern)[1];
        assert.ok(!seen.has(value), `duplicate metadata: ${value}`);
        seen.add(value);
      }
    }
  }
});

test('guides claiming verified providers exclude unverified dataset rows', () => {
  for (const slug of guides()) {
    const table = read(slug).match(/<tbody>([\s\S]*?)<\/tbody>/)[1];
    for (const p of list.filter((p) => !p.verified)) {
      assert.ok(!table.includes(`../p/${p.slug}`), `${slug} presents ${p.name} as verified`);
    }
  }
});

test('guide social-preview counts agree with the visible verified-provider tables', async () => {
  const { GUIDES } = await import('./lib/og.mjs');
  for (const g of GUIDES) {
    const count = Number(read(g.slug).match(/<p class="count"><strong>(\d+)<\/strong>/)[1]);
    assert.equal(list.filter(g.filter).length, count, g.slug);
  }
});

test('each verified guide row displays its actual source-verification date', () => {
  for (const slug of guides()) {
    const table = read(slug).match(/<tbody>([\s\S]*?)<\/tbody>/)[1];
    for (const row of table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
      const provider = list.find((p) => row[1].includes(`../p/${p.slug}\"`));
      assert.ok(provider, `${slug}: unknown provider row`);
      assert.ok(row[1].includes(`<time datetime="${provider.last_verified}">${humanDate(provider.last_verified)}</time>`), `${slug}: missing date for ${provider.name}`);
    }
  }
});
