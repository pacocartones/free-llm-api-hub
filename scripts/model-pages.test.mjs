import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupModels } from './lib/model-keys.mjs';
import { htmlEsc } from './lib/rows.mjs';
import { isIndexable, modelPageMainHtml, modelPageTitle, modelPageDescription, modelPageJsonLd, MODEL_SAMPLE_CAVEAT, MODEL_PAGE_INDEX_RULE } from './lib/model-pages.mjs';

const base = {
  category: 'ongoing', free_type: 'renewing-quota', free_tier: 'Free tier text', rate_limits: '30 RPM', notes: null,
  card_required: false, phone_required: null, commercial_ok: true, verified: true, last_verified: '2026-11-01',
  openai_compatible: true, openai_base_url: 'https://api.alpha.test/v1', env_key: 'ALPHA_API_KEY', docs_url: 'https://alpha.test/docs',
  modalities: ['text'],
};
const alpha = { ...base, slug: 'alpha', name: 'Alpha', models_free: ['org/shared-7b'], models_url: 'https://alpha.test/models' };
const beta = { ...base, slug: 'beta', name: 'Beta', models_free: ['shared-7b:free'], openai_compatible: false, openai_base_url: null, models_url: 'javascript:alert(1)' };
const ghost = { ...base, slug: 'ghost', name: 'Ghost', verified: false, last_verified: null, models_free: ['solo-1b'] };
const tiered = { ...base, slug: 'tiered', name: 'Tiered', models_free: ['org/shared-7b', 'other-3b'], model_tier: 3, model_tier_source: { model: 'other-3b', rating: 1400.5, votes: 1234, snapshot: '2026-10-02', url: 'https://example.test/lb' } };

const groupOf = (ps, key) => groupModels(ps).find((g) => g.key === key);
const page = (g) => modelPageMainHtml(g, { asOf: '2026-11-20' });

test('every page carries the sample caveat and never says "available on"', () => {
  for (const g of groupModels([alpha, beta, ghost, tiered])) {
    const html = page(g);
    assert.ok(html.includes(htmlEsc(MODEL_SAMPLE_CAVEAT)), `${g.key}: caveat`);
    assert.match(html, /Listed in the free-model sample of/);
    assert.ok(html.includes("not part of the dataset's verified core claim"), `${g.key}: core-claim note`);
    assert.doesNotMatch(html, /available on|free forever|best|fastest/i);
    assert.match(html, /2026-11-20/, 'the dataset date is shown');
  }
});

test('the page shows the literal ID each provider lists and links each provider page', () => {
  const html = page(groupOf([alpha, beta], 'shared-7b'));
  assert.ok(html.includes('<code>org/shared-7b</code>'));
  assert.ok(html.includes('<code>shared-7b:free</code>'));
  assert.ok(html.includes('href="../../p/alpha"') && html.includes('href="../../p/beta"'));
});

test('a null flag reads "not stated", an unverified provider is marked', () => {
  assert.match(page(groupOf([alpha], 'shared-7b')), /Phone verification<\/dt><dd><span class="pflag pflag-unk" data-flag="phone"[^>]*><span class="pflag-mark" aria-hidden="true">\?<\/span><span class="pflag-vis" aria-hidden="true"><span class="tri tri-unk">not stated<\/span>/);
  assert.match(page(groupOf([ghost], 'solo-1b')), /tri-unk">unverified</);
});

test('the quality tier appears only for the exact ID it was measured on', () => {
  const ps = [tiered];
  assert.match(page(groupOf(ps, 'other-3b')), /Quality tier for this ID: <strong>3\/4/);
  assert.doesNotMatch(page(groupOf(ps, 'shared-7b')), /Quality tier/);
});

test('no quickstart without an OpenAI base URL; a javascript: catalogue URL is never a link', () => {
  const html = page(groupOf([beta], 'shared-7b'));
  assert.doesNotMatch(html, /<pre>/);
  assert.match(html, /No OpenAI-compatible base URL is recorded/);
  assert.ok(html.includes('href="https://alpha.test/docs"'), 'falls back to the docs link');
  assert.doesNotMatch(html, /javascript:/);
  const withQuick = page(groupOf([alpha], 'shared-7b'));
  assert.match(withQuick, /<pre><code>curl https:\/\/api\.alpha\.test\/v1\/chat\/completions/);
  assert.match(withQuick, /\$ALPHA_API_KEY/);
});

test('indexing: the default rule needs two verified providers; an unverified one never counts', () => {
  assert.equal(MODEL_PAGE_INDEX_RULE, 'multi-provider');
  assert.equal(isIndexable(groupOf([alpha, beta], 'shared-7b')), true);
  assert.equal(isIndexable(groupOf([alpha], 'shared-7b')), false);
  assert.equal(isIndexable(groupOf([alpha, { ...beta, verified: false }], 'shared-7b')), false);
  assert.equal(isIndexable(groupOf([alpha], 'shared-7b'), 'quickstart'), true, "the spec's 1.6 alternative: one verified provider with a quickstart");
  assert.equal(isIndexable(groupOf([beta], 'shared-7b'), 'quickstart'), false);
  assert.throws(() => isIndexable(groupOf([alpha], 'shared-7b'), 'nope'));
});

test('title, description and structured data stay honest and short', () => {
  const g = groupOf([alpha, beta], 'shared-7b');
  assert.equal(modelPageTitle(g), 'Free API for shared-7b — 2 providers with a free tier · Free LLM API Hub');
  assert.ok(modelPageDescription(g).length <= 155);
  const many = groupOf(Array.from({ length: 12 }, (_, i) => ({ ...alpha, slug: `p${i}`, name: `Provider Number ${i}` })), 'shared-7b');
  const d = modelPageDescription(many);
  assert.ok(d.length <= 155, d);
  assert.match(d, /…/);
  const ld = JSON.parse(modelPageJsonLd(g, { site: 'https://x.test' }));
  const types = ld['@graph'].map((n) => n['@type']);
  assert.deepEqual(types, ['WebPage', 'BreadcrumbList', 'ItemList']);
  assert.ok(!JSON.stringify(ld).includes('Offer') && !JSON.stringify(ld).includes('Product'));
  assert.equal(ld['@graph'][2].numberOfItems, 2);
});

test('the same input gives the same bytes', () => {
  const a = groupOf([alpha, beta, tiered], 'shared-7b');
  const b = groupOf([tiered, beta, alpha], 'shared-7b');
  assert.equal(page(a), page(b));
});
