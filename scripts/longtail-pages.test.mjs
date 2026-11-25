import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { privateTree } from './lib/private-tree.mjs';
import { datasetAsOf } from './lib/release-stamp.mjs';
import {
  LIMIT_FACTS, LIMITS_MIN_FACTS, TITLE_DATE_MAX_DAYS, PAGE_MAX_AGE_DAYS, ALTERNATIVES_FOR, ALTERNATIVES_MIN, ALTERNATIVES_MAX,
  sourcedFacts, hasLimitsPage, limitsAnswer, limitsPageTitle, limitsPageMainHtml, limitsPageJsonLd,
  isAlternative, alternativesFor, alternativesPages, differenceLine, alternativesPageMainHtml, alternativesPageJsonLd, providerLongtailHtml,
} from './lib/longtail-pages.mjs';

// The long-tail templates of the Q1 2027 SEO plan (§3.2 P1/P2, §3.3): /limits/<slug>/ and /alternatives/<slug>/.
const ASOF = '2026-11-25';
const check = (status, extra = {}) => ({ status, checked: '2026-11-20', sources: ['https://alpha.test/terms'], ...extra });
const full = {
  slug: 'alpha', name: 'Alpha', category: 'ongoing', free_type: 'renewing-quota', free_tier: 'Free open-weight models',
  rate_limits: '30 RPM / 1K RPD', notes: 'Limits apply per organization', verified: true, last_verified: '2026-11-20',
  modalities: ['text'], openai_compatible: true, card_required: false, phone_required: null, commercial_ok: null,
  free_limits: { requests_per_minute: 30, requests_per_day: 1000, tokens_per_day: 200000, scope: 'free plan, each model', source: 'https://alpha.test/limits', checked: '2026-11-20' },
  data_policy: { trains_on_prompts: false, retention: 'none by default', source: 'https://alpha.test/data', checked: '2026-11-20', quote: 'We do not retain inference data.', plan_named: false },
  field_checks: {
    card_required: check('stated', { quote: 'No credit card required.' }),
    phone_required: check('source_silent', { note: 'The quickstart does not mention a phone.' }),
    commercial_ok: check('needs_account'),
  },
};
const without = (p, ...keys) => {
  const q = structuredClone(p);
  for (const k of keys) { if (k in (q.field_checks || {})) delete q.field_checks[k]; else delete q[k]; }
  return q;
};

test('limits gate: verified, inside the freshness window, sourced free_limits and at least four sourced facts', () => {
  assert.deepEqual(sourcedFacts(full), LIMIT_FACTS);
  assert.equal(LIMITS_MIN_FACTS, 4);
  assert.equal(hasLimitsPage(full, ASOF), true);
  assert.equal(hasLimitsPage(without(full, 'data_policy'), ASOF), true, 'four of five');
  assert.equal(hasLimitsPage(without(full, 'data_policy', 'commercial_ok'), ASOF), false, 'three of five');
  assert.equal(hasLimitsPage(without(full, 'free_limits'), ASOF), false, 'free_limits is required, whatever the count');
  assert.equal(hasLimitsPage({ ...full, free_limits: { ...full.free_limits, source: 'javascript:alert(1)' } }, ASOF), false, 'an unsafe source does not count');
  assert.equal(hasLimitsPage({ ...full, verified: false }, ASOF), false, 'unverified');
  assert.equal(hasLimitsPage({ ...full, last_verified: '2026-08-01' }, ASOF), false, `older than ${PAGE_MAX_AGE_DAYS} days at the dataset date`);
  // A flag with a value but no recorded check is not a sourced fact.
  assert.equal(sourcedFacts({ ...full, field_checks: {} }).length, 2);
});

test('limits answer: only dataset numbers, and the recorded reason for a null flag', () => {
  const a = limitsAnswer(full);
  assert.equal(a, 'As of 20 Nov 2026, Alpha publishes these free limits: 30 requests per minute, 1,000 requests per day and 200,000 tokens per day (free plan, each model). Credit card: not required. Phone verification: not stated by the provider. Source: alpha.test.');
  const nums = (a.match(/\d[\d,]*/g) || []).map((n) => Number(n.replace(/,/g, '')));
  const allowed = new Set([30, 1000, 200000, 20, 2026]);
  assert.deepEqual(nums.filter((n) => !allowed.has(n)), [], 'no number that is not in the entry');
  assert.match(limitsAnswer(without(full, 'phone_required')), /Phone verification: not confirmed\./, 'no check recorded: "not confirmed", never "no"');
});

test('limits title: the verified date only while it is at most 30 days old, with a notice after', () => {
  assert.equal(limitsPageTitle(full, ASOF), 'Alpha free tier limits (verified 20 Nov 2026) · Free LLM API Hub');
  const old = { ...full, last_verified: '2026-10-01' };
  assert.equal(limitsPageTitle(old, ASOF), 'Alpha free tier limits · Free LLM API Hub');
  assert.ok(TITLE_DATE_MAX_DAYS === 30);
  assert.match(limitsPageMainHtml(old, { asOf: ASOF }), /may be out of date/);
  assert.doesNotMatch(limitsPageMainHtml(full, { asOf: ASOF }), /may be out of date/);
});

test('limits page: each fact with its source, quotes where the dataset has them, and honest wording for nulls', () => {
  const html = limitsPageMainHtml(full, { asOf: ASOF, alternatives: true });
  assert.match(html, /<h1>Alpha free tier limits<\/h1>/);
  assert.ok(html.includes('href="https://alpha.test/limits"'), 'limits source');
  assert.ok(html.includes('href="https://alpha.test/data"'), 'data policy source');
  assert.ok(html.includes('&ldquo;We do not retain inference data.&rdquo;'), 'data policy quote');
  assert.ok(html.includes('&ldquo;No credit card required.&rdquo;'), 'stated field check quote');
  assert.match(html, /not stated by the provider \(checked 2026-11-20\)/, 'source_silent reason');
  assert.match(html, /needs an account to check/, 'needs_account reason');
  assert.match(html, /does not name the free plan/);
  assert.ok(html.includes('href="../../alternatives/alpha/"') && html.includes('href="../../p/alpha"') && html.includes('href="../../limits/"'));
  assert.doesNotMatch(limitsPageMainHtml(full, { asOf: ASOF, alternatives: false }), /alternatives\/alpha/);
  assert.doesNotMatch(html, /\b(best|fastest|cheapest|leading|unbeatable)\b/i, 'no superlatives');
  const ld = JSON.parse(limitsPageJsonLd(full, { site: 'https://x.test' }));
  const page = ld['@graph'][0];
  assert.deepEqual([page['@type'], page.url, page.dateModified], ['WebPage', 'https://x.test/limits/alpha/', '2026-11-20']);
  assert.deepEqual([page.isPartOf.publisher.name, page.isPartOf.creator.name], ['Tweakeo, Inc.', 'Paco Cartones']);
});

// ---- alternatives
const prov = (slug, over = {}) => ({ ...structuredClone(full), slug, name: slug.toUpperCase(), free_limits: null, data_policy: null, field_checks: {}, ...over });

test('similarity rule: same primary modality, OpenAI-compatible when the original is, comparable free offer, verified', () => {
  const orig = prov('orig');
  assert.equal(isAlternative(orig, prov('a'), ASOF), true);
  assert.equal(isAlternative(orig, orig, ASOF), false, 'not itself');
  assert.equal(isAlternative(orig, prov('b', { modalities: ['audio', 'text'] }), ASOF), false, 'other primary modality');
  assert.equal(isAlternative(orig, prov('c', { openai_compatible: null }), ASOF), false, 'not OpenAI-compatible');
  assert.equal(isAlternative({ ...orig, openai_compatible: false }, prov('c', { openai_compatible: false }), ASOF), true, 'compatibility only matters when the original has it');
  assert.equal(isAlternative(orig, prov('d', { category: 'trial', free_type: 'trial-credit' }), ASOF), false, 'a trial is not an alternative to an ongoing tier');
  assert.equal(isAlternative({ ...orig, category: 'trial' }, prov('d', { category: 'trial', free_type: 'trial-credit' }), ASOF), true, 'but it is to a trial');
  assert.equal(isAlternative(orig, prov('e', { verified: false }), ASOF), false, 'unverified');
  assert.equal(isAlternative(orig, prov('f', { last_verified: '2026-01-01' }), ASOF), false, 'outside the freshness window');
});

test('alternatives gate: at least five qualifying providers, at most eight rows, OpenAI never a page', () => {
  assert.equal(ALTERNATIVES_MIN, 5);
  assert.ok(!ALTERNATIVES_FOR.includes('openai'), 'OpenAI is covered by a guide, not this template');
  const groq = prov('groq');
  const four = ['a', 'b', 'c', 'd'].map((s) => prov(s));
  assert.deepEqual(alternativesPages([groq, ...four], ASOF), [], 'four qualifying: no page');
  const five = [...four, prov('e')];
  assert.deepEqual(alternativesPages([groq, ...five], ASOF).map(({ p, alts }) => [p.slug, alts.length]), [['groq', 5]]);
  const many = 'abcdefghijk'.split('').map((s) => prov(s));
  assert.equal(alternativesPages([groq, ...many], ASOF)[0].alts.length, ALTERNATIVES_MAX);
  assert.deepEqual(alternativesPages([prov('openai'), ...many], ASOF), [], 'a slug outside the list gets no page');
  assert.deepEqual(alternativesPages([{ ...groq, verified: false }, ...many], ASOF), [], 'an unverified original gets no page');
});

test('alternatives order: closest modality set first, then the same kind of free offer', () => {
  const orig = prov('orig', { modalities: ['text', 'embeddings'] });
  const near = prov('near', { modalities: ['text', 'embeddings'] });
  const far = prov('far', { modalities: ['text', 'image', 'audio'] });
  const other = prov('other', { modalities: ['text', 'embeddings'], free_type: 'perpetual' });
  assert.deepEqual(alternativesFor(orig, [far, other, near, orig], ASOF).map((c) => c.slug), ['near', 'other', 'far']);
});

test('difference line: derived from fields, with the original value for context, never free prose', () => {
  const orig = prov('orig', { card_required: true, free_limits: { ...full.free_limits, requests_per_day: 1000 } });
  const cand = prov('cand', { card_required: false, phone_required: true, free_type: 'perpetual', modalities: ['text', 'embeddings'], free_limits: { ...full.free_limits, requests_per_day: 14400 } });
  assert.equal(differenceLine(orig, cand), 'a free tier with no end date (ORIG: a free quota that renews); no credit card required (ORIG: required); phone verification required; higher published daily request cap: 14,400 vs 1,000');
  assert.equal(differenceLine(orig, orig), 'no recorded difference in plan, card, phone, commercial use or modalities');
});

test('alternatives page: a captioned table of internal provider links, and JSON-LD with an ItemList of them', () => {
  const orig = prov('groq');
  const alts = 'abcde'.split('').map((s) => prov(s));
  const html = alternativesPageMainHtml(orig, alts, { limitPages: new Set(['a', 'groq']) });
  assert.match(html, /<h1>Free GROQ alternatives<\/h1>/);
  assert.match(html, /<table class="alt-table"><caption>/);
  for (const c of alts) assert.ok(html.includes(`href="../../p/${c.slug}"`), c.slug);
  assert.ok(html.includes('href="../../limits/a/"') && html.includes('href="../../limits/groq/"'));
  assert.ok(!html.includes('href="../../limits/b/"'), 'no link to a limits page that is not built');
  assert.doesNotMatch(html, /\b(best|fastest|cheapest|leading)\b/i);
  const ld = JSON.parse(alternativesPageJsonLd(orig, alts, { site: 'https://x.test' }));
  const page = ld['@graph'].find((n) => n['@type'] === 'CollectionPage');
  assert.deepEqual(page.mainEntity.itemListElement.map((i) => i.url), alts.map((c) => `https://x.test/p/${c.slug}`));
  assert.deepEqual([page.isPartOf.publisher.name, page.isPartOf.creator.name], ['Tweakeo, Inc.', 'Paco Cartones']);
  assert.ok(ld['@graph'].some((n) => n['@type'] === 'BreadcrumbList'));
});

test('provider page block: links only to pages that exist, plus up to three similar providers', () => {
  const p = prov('groq');
  const ps = [p, ...'abcde'.split('').map((s) => prov(s))];
  const html = providerLongtailHtml(p, ps, { asOf: ASOF, limitPages: new Set(['groq']), altPages: new Set() });
  assert.ok(html.includes('href="../limits/groq/"'));
  assert.ok(!html.includes('alternatives/groq'));
  assert.equal((html.match(/href="\.\.\/p\//g) || []).length, 3);
  assert.equal(providerLongtailHtml(prov('lonely', { modalities: ['ocr'] }), [prov('lonely', { modalities: ['ocr'] })], { asOf: ASOF }), '');
});

// ---- the built site
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = privateTree(REPO);
const SITE = 'https://freellmapihub.com';
const read = (rel) => readFileSync(join(ROOT, 'site', rel), 'utf8');
const jsonld = (html) => JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
let data; let asOf;
before(() => {
  execFileSync(process.execPath, [join(ROOT, 'scripts/build.mjs')], { cwd: ROOT, stdio: 'pipe' });
  data = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8'));
  asOf = datasetAsOf(data);
});
const builtDirs = (dir) => readdirSync(join(ROOT, 'site', dir), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
const sitemapLocs = (dir) => [...read('sitemap.xml').matchAll(new RegExp(`<loc>${SITE}/${dir}/([^<]+)/</loc>`, 'g'))].map((m) => m[1]).sort();

test('built: exactly the gated pages, each in the sitemap, canonical, indexable, pinned and linked from its index', () => {
  const pins = JSON.parse(readFileSync(join(ROOT, 'derived-fingerprints.json'), 'utf8'));
  const limitSlugs = data.providers.filter((p) => hasLimitsPage(p, asOf)).map((p) => p.slug).sort();
  const altSlugs = alternativesPages(data.providers, asOf).map(({ p }) => p.slug).sort();
  assert.ok(limitSlugs.length > 0 && altSlugs.length > 0);
  assert.deepEqual(builtDirs('limits'), limitSlugs, 'no page for an entry under the threshold');
  assert.deepEqual(builtDirs('alternatives'), altSlugs);
  assert.ok(!existsSync(join(ROOT, 'site/alternatives/openai')));
  assert.deepEqual(sitemapLocs('limits'), limitSlugs, 'sitemap parity');
  assert.deepEqual(sitemapLocs('alternatives'), altSlugs, 'sitemap parity');
  for (const [dir, slugs] of [['limits', limitSlugs], ['alternatives', altSlugs]]) {
    assert.ok(read('sitemap.xml').includes(`<loc>${SITE}/${dir}/</loc>`), `${dir}/ index in the sitemap`);
    const index = read(`${dir}/index.html`);
    for (const slug of slugs) {
      const rel = `site/${dir}/${slug}/index.html`;
      const html = read(`${dir}/${slug}/index.html`);
      assert.ok(html.includes(`<link rel="canonical" href="${SITE}/${dir}/${slug}/">`), `${rel}: canonical`);
      assert.doesNotMatch(html, /name="robots"/, `${rel}: indexable`);
      assert.ok(html.includes(`og/${dir}.png"`), `${rel}: section social image`);
      assert.equal(createHash('sha256').update(readFileSync(join(ROOT, rel))).digest('hex'), pins[rel], `${rel}: pinned`);
      assert.ok(index.includes(`href="${slug}/"`), `/${dir}/ links ${slug}`);
      assert.ok(read(`p/${slug}.html`).includes(`href="../${dir}/${slug}/"`), `/p/${slug} links its ${dir} page`);
    }
  }
});

test('built: every footer links both indexes, and both use their own social image', () => {
  for (const rel of ['index.html', 'p/groq.html', 'limits/index.html']) {
    const html = read(rel);
    const footer = html.slice(html.indexOf('<footer'), html.indexOf('</footer>'));
    assert.match(footer, /href="(\.\.\/)*limits\/"/, rel);
    assert.match(footer, /href="(\.\.\/)*alternatives\/"/, rel);
  }
  assert.ok(existsSync(join(ROOT, 'site/og/limits.png')) && existsSync(join(ROOT, 'site/og/alternatives.png')));
});

test('built: a limits page shows the dataset numbers in its table and its dates match last_verified', () => {
  for (const p of data.providers.filter((x) => hasLimitsPage(x, asOf))) {
    const html = read(`limits/${p.slug}/index.html`);
    for (const k of ['requests_per_minute', 'requests_per_day', 'tokens_per_day']) {
      if (Number.isInteger(p.free_limits[k])) assert.ok(html.includes(`<td>${p.free_limits[k].toLocaleString('en-US')}</td>`), `${p.slug}: ${k}`);
    }
    const page = jsonld(html)['@graph'].find((n) => n['@type'] === 'WebPage');
    assert.equal(page.dateModified, p.last_verified, p.slug);
    assert.ok(html.includes(`datetime="${p.last_verified}"`), `${p.slug}: date visible`);
  }
});

// §3.3-2: indexable pages of one template must not be near-duplicates (5-word shingles, Jaccard).
const MAX_OVERLAP = 0.8;
const shingles = (html) => {
  const words = html.slice(html.indexOf('<main'), html.indexOf('</main>')).replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').toLowerCase().split(/\s+/).filter(Boolean);
  const out = new Set();
  for (let i = 0; i + 5 <= words.length; i++) out.add(words.slice(i, i + 5).join(' '));
  return out;
};
const jaccard = (a, b) => { let n = 0; for (const x of a) if (b.has(x)) n++; return n / (a.size + b.size - n); };

test('near-duplicate guard: the test fails on a synthetic duplicate', () => {
  const a = shingles(`<main>${limitsPageMainHtml(full, { asOf: ASOF })}</main>`);
  assert.ok(jaccard(a, a) > MAX_OVERLAP);
});

test('built: no two pages of the same template overlap more than 80 %', () => {
  for (const dir of ['limits', 'alternatives']) {
    const pages = builtDirs(dir).map((slug) => [slug, shingles(read(`${dir}/${slug}/index.html`))]);
    for (let i = 0; i < pages.length; i++) for (let j = i + 1; j < pages.length; j++) {
      const v = jaccard(pages[i][1], pages[j][1]);
      assert.ok(v <= MAX_OVERLAP, `${dir}: ${pages[i][0]} / ${pages[j][0]} overlap ${v.toFixed(2)}`);
    }
  }
});
