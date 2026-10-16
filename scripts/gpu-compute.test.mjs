import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { privateTree } from './lib/private-tree.mjs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { gpuComputeErrors, CLAIM_FIELDS } from './lib/gpu-compute.mjs';
import { providerFigures } from './lib/figures.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const providers = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8')).providers;
const slugs = new Set(providers.map((p) => p.slug));

// The builds of this file run in a private copy of the tree (see lib/private-tree.mjs), once, and the generated files
// are read from the copy; nothing here touches site/ of the repository.
const out = () => privateTree(ROOT);
const buildSite = () => {
  if (built) return;
  execFileSync(process.execPath, [join(out(), 'scripts/build.mjs')], { cwd: out(), stdio: 'pipe' });
  built = true;
};
let built = false;

const section = () => JSON.parse(readFileSync(join(ROOT, 'data/gpu-compute.json'), 'utf8'));
const claim = (state, quotes = []) => ({ state, quotes });
const entry = (over = {}) => ({
  slug: 'example-gpu', name: 'Example', url: 'https://example.com/faq', kind: 'notebook',
  claims: Object.fromEntries(CLAIM_FIELDS.map((f) => [f, claim('not_stated')])), ...over,
});

test('the section exists and passes its own rules', () => {
  assert.ok(existsSync(join(ROOT, 'data/gpu-compute.json')), 'data/gpu-compute.json is missing');
  assert.deepEqual(gpuComputeErrors(section(), slugs), []);
});

test('the section enters no provider count, no slug and no figure', () => {
  const s = section();
  assert.ok(s.entries.length > 0);
  for (const e of s.entries) assert.ok(!slugs.has(e.slug), `${e.slug} is also a provider`);
  // The provider figures come from providers.json alone, so the section is not counted.
  assert.equal(providerFigures(providers).providers, providers.length);
  // The committed outputs that carry the provider count do not list the section's entries as providers.
  const home = readFileSync(join(out(), 'site/index.html'), 'utf8');
  for (const e of s.entries) assert.ok(!home.includes(`/p/${e.slug}`), `${e.slug} must not have a provider page link on the home`);
});

test('a slug shared with a provider is rejected', () => {
  const errs = gpuComputeErrors({ entries: [entry({ slug: providers[0].slug })] }, slugs);
  assert.ok(errs.some((m) => /shares its slug with a provider/.test(m)));
});

test('a stated value without a quoted sentence is rejected', () => {
  const e = entry();
  e.claims.quota = claim('stated', []);
  assert.ok(gpuComputeErrors({ entries: [e] }, slugs).some((m) => /stated without a quoted sentence/.test(m)));
});

test('a quotation without a source or a read date is rejected', () => {
  const e = entry();
  e.claims.expires = claim('not_stated', [{ text: 'they expire in 90 days' }]);
  const errs = gpuComputeErrors({ entries: [e] }, slugs);
  assert.ok(errs.some((m) => /source/.test(m)) && errs.some((m) => /day it was read/.test(m)));
});

test('a missing or unknown claim field is rejected', () => {
  const e = entry();
  delete e.claims.card_required;
  e.claims.price = claim('not_stated');
  const errs = gpuComputeErrors({ entries: [e] }, slugs);
  assert.ok(errs.some((m) => /card_required/.test(m)) && errs.some((m) => /unknown claim "price"/.test(m)));
});

test('fal.ai keeps both of its contradicting expiry sentences and no invented value', () => {
  const fal = section().entries.find((e) => e.slug === 'fal-ai');
  assert.equal(fal.claims.expires.state, 'not_stated');
  const texts = fal.claims.expires.quotes.map((q) => q.text).join(' | ');
  assert.match(texts, /expire in 90 days/);
  assert.match(texts, /ranging from 1 week to 1 year/);
  for (const f of ['credit_amount', 'card_required']) assert.equal(fal.claims[f].state, 'not_stated');
});

test('ZeroGPU records sourced free access and daily quota without inferring credit, expiry or card requirements', () => {
  const s = section();
  const entries = s.entries.filter((e) => e.slug === 'hugging-face-zerogpu');
  assert.equal(entries.length, 1, 'ZeroGPU must appear once in the GPU compute section');
  const zeroGpu = entries[0];
  const source = 'https://huggingface.co/docs/hub/en/spaces-zerogpu';
  assert.equal(zeroGpu.kind, 'serverless-api');
  assert.equal(zeroGpu.url, source);
  for (const field of ['gpu_access', 'quota']) {
    const c = zeroGpu.claims[field];
    assert.equal(c.state, 'stated');
    assert.ok(c.quotes.length > 0);
    for (const q of c.quotes) {
      assert.equal(q.source, source);
      assert.ok(q.read <= s.generated, 'a quotation cannot be read after the section was generated');
    }
  }
  assert.match(zeroGpu.claims.gpu_access.quotes.map((q) => q.text).join(' '), /free to all users/);
  assert.match(zeroGpu.claims.quota.quotes.map((q) => q.text).join(' '), /daily quota.*24 hours/);
  for (const field of ['credit_amount', 'expires', 'card_required']) {
    assert.deepEqual(zeroGpu.claims[field], claim('not_stated'), `${field} must remain unknown`);
  }
});

// The page of the section. It reads data/gpu-compute.json only, shows every quoted sentence with the day it
// was read, says "Not stated" where the provider did not, and stays out of everything that counts providers.
test('the section has a page that shows its quotations and stays out of every provider count', () => {
  buildSite();
  const page = join(out(), 'site/free-gpu/index.html');
  assert.ok(existsSync(page), 'site/free-gpu/index.html is not generated');
  const html = readFileSync(page, 'utf8');
  const s = section();
  const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  for (const e of s.entries) {
    assert.ok(html.includes(esc(e.name)), `${e.name} is missing from the page`);
    for (const c of Object.values(e.claims)) {
      for (const q of c.quotes) {
        assert.ok(html.includes(esc(q.text)), `a quotation of ${e.name} is missing from the page`);
        assert.ok(html.includes(`read ${q.read}`), `the read date of a quotation of ${e.name} is missing`);
      }
    }
  }
  assert.match(html, /Not stated/, 'a value the provider did not state must read Not stated');
  assert.match(html, /not part of the ranking/, 'the page must say it is apart from the ranking');

  // Out of every count: no provider page, no entry of the providers API, no collection, no provider-page sitemap line.
  for (const e of s.entries) {
    assert.ok(!existsSync(join(out(), `site/p/${e.slug}.html`)), `${e.slug} got a provider page`);
    const sitemap = readFileSync(join(out(), 'site/sitemap.xml'), 'utf8');
    assert.ok(!sitemap.includes(`/p/${e.slug}`), `${e.slug} is in the sitemap as a provider`);
    for (const f of readdirSync(join(out(), 'collections')).filter((x) => x.endsWith('.md'))) {
      assert.ok(!readFileSync(join(out(), 'collections', f), 'utf8').includes(`(p/${e.slug}`), `${e.slug} is in a collection (${f})`);
    }
  }
  const api = JSON.parse(readFileSync(join(out(), 'site/api/v1/index.json'), 'utf8'));
  const count = Array.isArray(api.providers) ? api.providers.length : api.count ?? api.provider_count;
  if (count !== undefined) assert.equal(count, providers.length, 'the providers API counts providers.json only');
  const sitemap = readFileSync(join(out(), 'site/sitemap.xml'), 'utf8');
  assert.ok(sitemap.includes('/free-gpu/'), 'the page is in the sitemap');
  assert.equal([...sitemap.matchAll(/\/p\/[a-z0-9-]+</g)].length, providers.length, 'the sitemap lists one page per provider and nothing else');
});

test('the page is linked from both footers, the hand-written home and the shared one', () => {
  const home = readFileSync(join(out(), 'site/index.html'), 'utf8');
  const shared = readFileSync(join(out(), 'site/best/index.html'), 'utf8');
  assert.match(home, /href="free-gpu\/"/);
  assert.match(shared, /href="\.\.\/free-gpu\/"/);
});

// The section as a file of the stable API (contract v1), with its JSON Schema at a stable address.
const apiFile = () => JSON.parse(readFileSync(join(out(), 'site/api/v1/free-gpu.json'), 'utf8'));
const apiSchema = () => JSON.parse(readFileSync(join(ROOT, 'data/free-gpu.schema.json'), 'utf8'));
const compileApiSchema = () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictTypes: false, validateFormats: true });
  addFormats(ajv, ['date', 'uri']);
  return ajv.compile(apiSchema());
};

test('free-gpu.json carries the data file as it is and validates against its schema; broken copies fail', () => {
  buildSite();
  const file = apiFile();
  const s = section();
  assert.deepEqual(file.entries, s.entries, 'the entries are the data file, unchanged');
  assert.deepEqual(file.notes, s.notes, 'the notes are the data file, unchanged');
  assert.equal(file.count, s.entries.length);
  const validate = compileApiSchema();
  assert.equal(validate(file), true, JSON.stringify(validate.errors));
  const broken = (mutate) => { const c = structuredClone(file); mutate(c); return validate(c); };
  assert.equal(broken((c) => { delete c.entries; }), false, 'a file without entries fails');
  assert.equal(broken((c) => { c.entries[0].claims.expires.state = 'maybe'; }), false, 'a state other than stated or not_stated fails');
  assert.equal(broken((c) => { delete c.entries[0].claims.quota; }), false, 'an entry without one of its claims fails');
  assert.equal(broken((c) => { c.entries[0].claims.expires.quotes = [{ text: 'x', source: 'https://example.com' }]; }), false, 'a quotation without its read date fails');
  assert.equal(broken((c) => { c.dataset = 'other'; }), false, 'another dataset name fails');
  assert.equal(broken((c) => { c.count = 'two'; }), false, 'a count that is not an integer fails');
  assert.equal(broken((c) => { c.entries[0].added_in_a_later_minor = 1; }), true, 'a field added within v1 does not break a v1 reader');
});

test('free-gpu.json enters no count of providers, and its schema is published at the stable address', () => {
  buildSite();
  const file = apiFile();
  assert.ok(file.entries.every((e) => !slugs.has(e.slug)), 'no entry shares a slug with a provider');
  const all = JSON.parse(readFileSync(join(out(), 'site/api/v1/providers.json'), 'utf8'));
  assert.equal(all.count, providers.length, 'providers.json counts the providers of the dataset only');
  assert.ok(all.providers.every((p) => !file.entries.some((e) => e.slug === p.slug)), 'providers.json lists none of the entries');
  const apiDir = join(out(), 'site/api/v1');
  for (const f of readdirSync(apiDir).filter((x) => x.endsWith('.json') && !['free-gpu.json', 'free-gpu.schema.json', 'index.json'].includes(x))) {
    const text = readFileSync(join(apiDir, f), 'utf8');
    for (const e of file.entries) assert.ok(!text.includes(`"slug": "${e.slug}"`), `${f} lists the entry ${e.slug}`);
  }
  assert.equal(file.schema, apiSchema().$id);
  assert.equal(file.schema, 'https://freellmapihub.com/api/v1/free-gpu.schema.json');
  assert.equal(readFileSync(join(out(), 'site/api/v1/free-gpu.schema.json'), 'utf8'), readFileSync(join(ROOT, 'data/free-gpu.schema.json'), 'utf8'), 'the published schema is the source file');
  const index = JSON.parse(readFileSync(join(out(), 'site/api/v1/index.json'), 'utf8'));
  assert.equal(index.endpoints['free-gpu'], 'v1/free-gpu.json');
  assert.equal(index.endpoints['free-gpu-schema'], 'v1/free-gpu.schema.json');
});

test('every field of the free-gpu schema is mentioned in docs/api.md', () => {
  const names = new Set();
  const walk = (o) => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (o && typeof o === 'object') {
      for (const [k, v] of Object.entries(o)) {
        if (k === 'properties' && v && typeof v === 'object') Object.keys(v).forEach((n) => names.add(n));
        walk(v);
      }
    }
  };
  walk(apiSchema());
  const doc = readFileSync(join(ROOT, 'docs/api.md'), 'utf8');
  const missing = [...names].filter((n) => !doc.includes('`' + n + '`'));
  assert.deepEqual(missing, [], 'fields of the schema missing in docs/api.md');
});
