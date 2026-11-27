import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { privateTree } from './lib/private-tree.mjs';
import { escapeHtml as htmlEsc } from './lib/html.mjs';
import { stripTags } from './lib/escape.mjs';
import { MODEL_SAMPLE_CAVEAT } from './lib/model-pages.mjs';
import {
  MODEL_FAMILIES, FAMILY_PATH, familyOf, familyGroup, familyGroups, isFamilyIndexable, familyAnswer, familyH1,
  familyPageTitle, familyPageDescription, familyPageMainHtml,
} from './lib/model-families.mjs';

// ---------- the pure functions, on fixtures ----------
const base = {
  category: 'ongoing', free_type: 'renewing-quota', free_tier: 'Free tier text', rate_limits: '30 RPM', notes: null,
  card_required: false, phone_required: false, commercial_ok: true, verified: true, last_verified: '2026-11-01',
  openai_compatible: true, openai_base_url: 'https://api.alpha.test/v1', modalities: ['text'],
};
const alpha = { ...base, slug: 'alpha', name: 'Alpha', models_free: ['meta-llama/Llama-3.3-70B-Instruct', 'meta-llama/Llama-3.1-8B-Instruct'], free_limits: { requests_per_minute: 30, source: 'https://alpha.test/limits' } };
const beta = { ...base, slug: 'beta', name: 'Beta <b>', category: 'trial', card_required: null, phone_required: null, commercial_ok: null, last_verified: null, rate_limits: null,
  field_checks: { card_required: { status: 'needs_account', checked: '2026-11-01' } }, models_free: ['@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', 'llama-3.3-70b-instruct'] };
const gamma = { ...base, slug: 'gamma', name: 'Gamma', commercial_ok: 'conditional', commercial_ok_condition: 'Per-model licence', models_free: ['Qwen/Qwen3-4B'] };
const ghost = { ...base, slug: 'ghost', name: 'Ghost', verified: false, models_free: ['llama-3.3-70b-instruct'] };
const fam = (slug) => MODEL_FAMILIES.find((f) => f.slug === slug);
const page = (g, others = []) => familyPageMainHtml(g, { asOf: '2026-11-26', others });

test('six fixed families with stable, URL-safe slugs', () => {
  assert.deepEqual(MODEL_FAMILIES.map((f) => f.slug), ['qwen', 'gemma', 'deepseek', 'llama', 'gpt-oss', 'glm']);
  for (const f of MODEL_FAMILIES) assert.match(f.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/);
  assert.equal(FAMILY_PATH, 'free-api/');
});

test('an ID belongs to the family it names first; the organisation prefix never decides', () => {
  assert.equal(familyOf('@cf/deepseek-ai/deepseek-r1-distill-qwen-32b').slug, 'deepseek');
  assert.equal(familyOf('aisingapore/Qwen-SEA-LION-v4.5-27B-IT').slug, 'qwen');
  assert.equal(familyOf('aisingapore/Gemma-SEA-LION-v4-27B-IT').slug, 'gemma');
  assert.equal(familyOf('accounts/fireworks/models/glm-5p3').slug, 'glm');
  assert.equal(familyOf('openai/gpt-oss-120b').slug, 'gpt-oss');
  assert.equal(familyOf('google/gemma-4-26b-a4b-it:free').slug, 'gemma');
  assert.equal(familyOf('meta-llama/mistral-small'), null, 'an org called meta-llama does not make a model Llama');
  assert.equal(familyOf('ollama-like-model'), null, 'the token must start the ID or follow a non-letter');
  assert.equal(familyOf('mistral-small-3.1-24b'), null);
});

test('only verified providers, each once with all its IDs of the family, in the recommended order', () => {
  const g = familyGroup(fam('llama'), [ghost, beta, alpha]);
  assert.deepEqual(g.entries.map((e) => e.p.slug).sort(), ['alpha', 'beta']);
  assert.deepEqual(g.entries.find((e) => e.p.slug === 'alpha').ids, alpha.models_free);
  assert.deepEqual(g.entries.find((e) => e.p.slug === 'beta').ids, ['llama-3.3-70b-instruct'], 'the distill counts as DeepSeek, not Llama');
  const again = familyGroup(fam('llama'), [alpha, beta, ghost]);
  assert.deepEqual(again.entries.map((e) => e.p.slug), g.entries.map((e) => e.p.slug), 'order does not depend on the input order');
  assert.equal(page(g), page(again), 'same input, same bytes');
});

test('the answer comes first and carries the count, the split and the top options', () => {
  const g = familyGroup(fam('llama'), [alpha, beta]);
  const a = familyAnswer(g, '2026-11-26');
  assert.match(a, /^As of 26 Nov 2026, 2 providers in the dataset, all verified, list a Llama model in their free-model sample: 1 with an ongoing free tier and 1 with one-time trial credit\./);
  assert.match(a, /top options, in the hub's recommended order, are (Alpha and Beta <b>|Beta <b> and Alpha)\.$/);
  const html = page(g);
  assert.ok(html.indexOf('<p class="answer">') < html.indexOf('<table'), 'the answer is above the table');
  assert.ok(html.includes(htmlEsc(a)), 'the answer is escaped');
  assert.doesNotMatch(html, /<b>/, 'provider names are escaped');
  assert.equal(familyAnswer(familyGroup(fam('glm'), [alpha]), '2026-11-26'), 'As of 26 Nov 2026, no verified provider in the dataset lists a GLM model in its free-model sample.');
});

test('the table shows data only: limits, flags, date; a null reads "Not stated"', () => {
  const html = page(familyGroup(fam('llama'), [alpha, beta]));
  assert.ok(html.includes(htmlEsc(MODEL_SAMPLE_CAVEAT)), 'the sample caveat, word for word');
  assert.ok(html.includes('href="../../p/alpha"') && html.includes('href="../../p/beta"'), 'links the provider pages');
  assert.match(html, /30 requests per minute<br><span class="notes">30 RPM<\/span>/);
  const row = html.match(/<tr><td class="name"><a href="\.\.\/\.\.\/p\/beta">[\s\S]*?<\/tr>/)[0];
  const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
  assert.equal(cells.length, 7);
  assert.equal(cells[2], 'Not stated', 'limits');
  assert.match(cells[3], /^Not stated<br><span class="notes">needs an account to check<\/span>$/, 'card, with its recorded reason');
  assert.equal(cells[4], 'Not stated', 'phone');
  assert.equal(cells[5], 'Not stated', 'commercial use');
  // The date, then the row's "Report a mistake" link (lib/report-mistake.mjs; without a repo it points to /contributing/).
  assert.equal(cells[6], 'Not stated<br><small><a class="report-link" href="../../contributing/" aria-label="Report a mistake about Beta &lt;b&gt;">Report a mistake</a></small>', 'last verified');
  assert.match(html, /<time datetime="2026-11-01">1 Nov 2026<\/time>/);
  assert.doesNotMatch(html, /available on|free forever|best|fastest/i);
  const cond = page(familyGroup(fam('qwen'), [gamma]));
  assert.match(cond, /Conditional<br><span class="notes">Per-model licence<\/span>/);
});

test('model IDs link to their model page when one exists', () => {
  const g = familyGroup(fam('llama'), [alpha]);
  const html = familyPageMainHtml(g, { asOf: '2026-11-26', modelHref: (id) => (id.includes('70B') ? '../../models/llama-3.3-70b-instruct/' : '') });
  assert.ok(html.includes('<a href="../../models/llama-3.3-70b-instruct/"><code>meta-llama/<wbr>Llama-3.3-70B-Instruct</code></a>'));
  assert.ok(html.includes('<code>meta-llama/<wbr>Llama-3.1-8B-Instruct</code>') && !html.includes('href="../../models/llama-3.1'));
});

test('title, description and indexing', () => {
  const g = familyGroup(fam('llama'), [alpha, beta]);
  assert.equal(familyH1(g), 'Where can I use Llama for free via API?');
  assert.equal(familyPageTitle(g), 'Free Llama API: 2 providers with free access · Free LLM API Hub');
  const many = familyGroup(fam('llama'), Array.from({ length: 14 }, (_, i) => ({ ...alpha, slug: `p${i}`, name: `Provider Number ${i}` })));
  for (const x of [g, many, familyGroup(fam('glm'), [])]) assert.ok(familyPageDescription(x).length <= 155, familyPageDescription(x));
  assert.match(familyPageDescription(many), /…/);
  assert.equal(isFamilyIndexable(g), true);
  assert.equal(isFamilyIndexable(familyGroup(fam('llama'), [alpha, ghost])), false, 'an unverified provider never counts');
  const others = page(g, familyGroups([alpha]));
  assert.ok(others.includes('href="../../free-api/qwen/"') && !others.includes('href="../../free-api/llama/"'), 'links the other families, not itself');
});

// ---------- the built site ----------
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = privateTree(REPO);
const SITE = 'https://freellmapihub.com';
const providers = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8')).providers;
const groups = familyGroups(providers);
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const jsonld = (html) => JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);

before(() => { execFileSync(process.execPath, [join(ROOT, 'scripts/build.mjs')], { cwd: ROOT, stdio: 'pipe' }); });

test('built: one page per family, with canonical, title, description, breadcrumb and noindex rule', () => {
  assert.deepEqual(readdirSync(join(ROOT, 'site/free-api')).sort(), MODEL_FAMILIES.map((f) => f.slug).sort());
  for (const g of groups) {
    const url = `${SITE}/free-api/${g.slug}/`;
    const html = read(`site/free-api/${g.slug}/index.html`);
    assert.ok(html.includes(`<link rel="canonical" href="${url}">`), `${g.slug}: canonical`);
    assert.match(html, new RegExp(`<title>Free ${g.name} API: \\d+ providers? with free access \\(`), `${g.slug}: dated title`);
    const desc = html.match(/<meta name="description" content="([^"]*)">/)[1].replace(/&amp;/g, '&');
    assert.ok(desc.length >= 40 && desc.length <= 155, `${g.slug}: description of ${desc.length} characters`);
    assert.equal(/<meta name="robots" content="noindex">/.test(html), !isFamilyIndexable(g), `${g.slug}: noindex follows the rule`);
    const ld = jsonld(html)['@graph'];
    const crumbs = ld.find((n) => n['@type'] === 'BreadcrumbList').itemListElement.map((i) => i.item);
    assert.deepEqual(crumbs, [`${SITE}/`, `${SITE}/models/`, url], `${g.slug}: breadcrumb`);
    const answer = stripTags(html.match(/<p class="answer"><strong>([^<]*)<\/strong><\/p>/)[1]);
    assert.ok(answer.includes(`${g.entries.length} provider`), `${g.slug}: the answer carries the count`);
    for (const { p } of g.entries) assert.ok(html.includes(`href="../../p/${p.slug}"`), `${g.slug}: links ${p.slug}`);
  }
});

test('built: sitemap, llms.txt and /models/ list the family pages', () => {
  const sitemap = read('site/sitemap.xml');
  const llms = read('site/llms.txt');
  const index = read('site/models/index.html');
  const listed = [...sitemap.matchAll(/<loc>https:\/\/freellmapihub\.com\/free-api\/([^<]+)\/<\/loc>/g)].map((m) => m[1]).sort();
  assert.deepEqual(listed, groups.filter(isFamilyIndexable).map((g) => g.slug).sort(), 'sitemap parity: only the indexable family pages');
  assert.match(llms, /\n## Free API by model family\n/);
  for (const g of groups) {
    assert.equal(llms.includes(`(${SITE}/free-api/${g.slug}/)`), isFamilyIndexable(g), `llms.txt: ${g.slug}`);
    assert.ok(index.includes(`href="../free-api/${g.slug}/"`), `/models/ links ${g.slug}`);
  }
});
