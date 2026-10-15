import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { privateTree } from './lib/private-tree.mjs';
import { codingToolsErrors, CLAIM_FIELDS, KINDS } from './lib/coding-tools.mjs';
import { codingToolsMainHtml, codingToolsCounts } from './lib/free-coding-tools.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const providers = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8')).providers;
const slugs = new Set(providers.map((p) => p.slug));

// Builds run in a private copy of the tree (see lib/private-tree.mjs), once; generated files are read from the copy.
const out = () => privateTree(ROOT);
let built = false;
const buildSite = () => {
  if (built) return;
  execFileSync(process.execPath, [join(out(), 'scripts/build.mjs')], { cwd: out(), stdio: 'pipe' });
  built = true;
};

const section = () => JSON.parse(readFileSync(join(ROOT, 'data/coding-tools.json'), 'utf8'));
const claim = (state, quotes = []) => ({ state, quotes });
const quote = (over = {}) => ({ text: 'Free for individuals.', source: 'https://example.com/pricing', read: '2026-10-15', ...over });
const entry = (over = {}) => ({
  slug: 'example-tool', name: 'Example', url: 'https://example.com/', kind: 'cli',
  claims: Object.fromEntries(CLAIM_FIELDS.map((f) => [f, claim('not_stated')])), ...over,
});
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

test('the section exists, passes its own rules and its JSON Schema', () => {
  assert.ok(existsSync(join(ROOT, 'data/coding-tools.json')), 'data/coding-tools.json is missing');
  assert.deepEqual(codingToolsErrors(section(), slugs), []);
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(JSON.parse(readFileSync(join(ROOT, 'data/coding-tools.schema.json'), 'utf8')));
  assert.equal(validate(section()), true, JSON.stringify(validate.errors));
});

test('the rules reject what must not be written', () => {
  const bad = (mutate) => { const e = entry(); mutate(e); return codingToolsErrors({ entries: [e] }, slugs); };
  assert.ok(codingToolsErrors({ entries: [entry({ slug: providers[0].slug })] }, slugs).some((m) => /shares its slug with a provider/.test(m)));
  assert.ok(bad((e) => { e.claims.free_access = claim('stated', []); }).some((m) => /stated without a quoted sentence/.test(m)));
  assert.ok(bad((e) => { e.claims.limits = claim('not_stated', [{ text: 'x' }]); }).some((m) => /source/.test(m)));
  assert.ok(bad((e) => { e.claims.limits = claim('stated', [quote({ text: 'a​b' })]); }).some((m) => /control, bidirectional or zero-width/.test(m)));
  assert.ok(bad((e) => { e.claims.limits = claim('stated', [quote({ text: 'a‮b' })]); }).some((m) => /control, bidirectional or zero-width/.test(m)));
  assert.ok(bad((e) => { e.claims.limits = claim('stated', [quote({ source: 'javascript:alert(1)' })]); }).some((m) => /http\(s\) source/.test(m)));
  assert.ok(bad((e) => { e.claims.limits = claim('stated', [quote({ read: 'yesterday' })]); }).some((m) => /day it was read/.test(m)));
  assert.ok(bad((e) => { e.kind = 'plugin'; }).some((m) => /kind must be one of/.test(m)));
  assert.ok(bad((e) => { delete e.claims.trains_on_code; }).some((m) => /trains_on_code/.test(m)));
  assert.ok(bad((e) => { e.claims.price = claim('not_stated'); }).some((m) => /unknown claim "price"/.test(m)));
  assert.ok(codingToolsErrors({ entries: [entry(), entry()] }, slugs).some((m) => /duplicate slug/.test(m)));
  assert.deepEqual(KINDS, ['ide-extension', 'editor', 'cli']);
});

test('the page shows every sentence escaped, with its page and day; not stated never reads as no; nothing is ranked', () => {
  const s = {
    entries: [entry({ name: 'Tool <b>', claims: { ...entry().claims,
      free_access: claim('stated', [quote({ text: 'Free for "individuals" <now>.' })]),
      limits: claim('not_stated', [quote({ text: 'Limits may change.', source: 'javascript:alert(1)' })]) } })],
    notes: [{ subject: 'Other tool', text: 'Renamed.', quotes: [quote({ text: 'Now called X.' })] }],
  };
  const html = codingToolsMainHtml(s, { prefix: '../', repo: 'https://github.com/x/y' });
  assert.match(html, /Free for &quot;individuals&quot; &lt;now&gt;\./);
  assert.doesNotMatch(html, /Tool <b>/, 'a name from the data is escaped');
  assert.doesNotMatch(html, /href="javascript:/, 'only http(s) links are made');
  assert.match(html, /read 2026-10-15/);
  assert.match(html, /Stated by the tool's page/);
  assert.match(html, /Not stated; what the page says is below/);
  assert.match(html, /<span class="gpu-unstated">Not stated<\/span>/);
  assert.match(html, /never the same as <em>no<\/em>/);
  assert.match(html, /not part of the ranking/);
  const visible = html.replace(/<[^>]*>/g, ' ');
  assert.doesNotMatch(visible, /\b(safe|secure|private|guarantee[sd]?|best|worst|better|worse|top|recommended|featured|winner)\b/i);
  assert.deepEqual(codingToolsCounts(s), { tools: 1, stated: 1, total: 6 });
  assert.match(codingToolsMainHtml({ entries: [] }), /No tool is recorded yet\./);
});

test('the page of the real data shows its quotations and stays out of every provider count', () => {
  buildSite();
  const page = join(out(), 'site/coding-tools/index.html');
  assert.ok(existsSync(page), 'site/coding-tools/index.html is not generated');
  const html = readFileSync(page, 'utf8');
  const s = section();
  for (const e of s.entries) {
    assert.ok(html.includes(esc(e.name)), `${e.name} is missing from the page`);
    for (const c of Object.values(e.claims)) for (const q of c.quotes) {
      assert.ok(html.includes(esc(q.text)), `a sentence of ${e.name} is missing from the page`);
      assert.ok(html.includes(`read ${q.read}`), `the read date of a sentence of ${e.name} is missing`);
    }
  }
  const sitemap = readFileSync(join(out(), 'site/sitemap.xml'), 'utf8');
  assert.ok(sitemap.includes('/coding-tools/'), 'the page is in the sitemap');
  assert.equal([...sitemap.matchAll(/\/p\/[a-z0-9-]+</g)].length, providers.length, 'the sitemap lists one provider page per provider and nothing else');
  for (const e of s.entries) {
    assert.ok(!slugs.has(e.slug), `${e.slug} is also a provider`);
    assert.ok(!existsSync(join(out(), `site/p/${e.slug}.html`)), `${e.slug} got a provider page`);
    for (const f of readdirSync(join(out(), 'collections')).filter((x) => x.endsWith('.md'))) {
      assert.ok(!readFileSync(join(out(), 'collections', f), 'utf8').includes(`(p/${e.slug}`), `${e.slug} is in a collection (${f})`);
    }
  }
  const home = readFileSync(join(out(), 'site/index.html'), 'utf8');
  const shared = readFileSync(join(out(), 'site/best/index.html'), 'utf8');
  assert.match(home, /href="coding-tools\/"/);
  assert.match(shared, /href="\.\.\/coding-tools\/"/);
});

const apiFile = () => JSON.parse(readFileSync(join(out(), 'site/api/v1/coding-tools.json'), 'utf8'));
const apiSchema = () => JSON.parse(readFileSync(join(ROOT, 'data/coding-tools-api.schema.json'), 'utf8'));

test('coding-tools.json carries the data file as it is and validates against its schema; broken copies fail', () => {
  buildSite();
  const file = apiFile();
  const s = section();
  assert.deepEqual(file.entries, s.entries);
  assert.deepEqual(file.notes, s.notes || []);
  assert.equal(file.count, s.entries.length);
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictTypes: false, validateFormats: true });
  addFormats(ajv, ['date', 'uri']);
  const validate = ajv.compile(apiSchema());
  assert.equal(validate(file), true, JSON.stringify(validate.errors));
  const broken = (mutate) => { const c = structuredClone(file); mutate(c); return validate(c); };
  assert.equal(broken((c) => { delete c.entries; }), false, 'a file without entries fails');
  assert.equal(broken((c) => { c.entries[0].claims.expires.state = 'maybe'; }), false, 'a state other than stated or not_stated fails');
  assert.equal(broken((c) => { delete c.entries[0].claims.trains_on_code; }), false, 'an entry without one of its claims fails');
  assert.equal(broken((c) => { c.entries[0].kind = 'plugin'; }), false, 'a kind outside the three fails');
  assert.equal(broken((c) => { c.entries[0].claims.expires.quotes = [{ text: 'x', source: 'https://example.com' }]; }), false, 'a quotation without its read date fails');
  assert.equal(broken((c) => { c.dataset = 'other'; }), false, 'another dataset name fails');
  assert.equal(broken((c) => { c.entries[0].added_in_a_later_minor = 1; }), true, 'a field added within v1 does not break a v1 reader');
});

test('coding-tools.json enters no count of providers, and its schema is published at the stable address', () => {
  buildSite();
  const file = apiFile();
  const all = JSON.parse(readFileSync(join(out(), 'site/api/v1/providers.json'), 'utf8'));
  assert.equal(all.count, providers.length);
  assert.ok(all.providers.every((p) => !file.entries.some((e) => e.slug === p.slug)));
  const apiDir = join(out(), 'site/api/v1');
  for (const f of readdirSync(apiDir).filter((x) => x.endsWith('.json') && !['coding-tools.json', 'coding-tools.schema.json', 'index.json'].includes(x))) {
    const text = readFileSync(join(apiDir, f), 'utf8');
    for (const e of file.entries) assert.ok(!text.includes(`"slug": "${e.slug}"`), `${f} lists the entry ${e.slug}`);
  }
  assert.equal(file.schema, apiSchema().$id);
  assert.equal(file.schema, 'https://freellmapihub.com/api/v1/coding-tools.schema.json');
  assert.equal(readFileSync(join(out(), 'site/api/v1/coding-tools.schema.json'), 'utf8'), readFileSync(join(ROOT, 'data/coding-tools-api.schema.json'), 'utf8'));
  const index = JSON.parse(readFileSync(join(out(), 'site/api/v1/index.json'), 'utf8'));
  assert.equal(index.endpoints['coding-tools'], 'v1/coding-tools.json');
  assert.equal(index.endpoints['coding-tools-schema'], 'v1/coding-tools.schema.json');
});

test('every field of the coding-tools schema is mentioned in docs/api.md', () => {
  const names = new Set();
  const walk = (o) => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) {
      if (k === 'properties' && v && typeof v === 'object') Object.keys(v).forEach((n) => names.add(n));
      walk(v);
    }
  };
  walk(apiSchema());
  const docs = readFileSync(join(ROOT, 'docs/api.md'), 'utf8');
  const section = docs.slice(docs.indexOf('### Free AI coding tools'), docs.indexOf('### Generated client configs'));
  for (const n of names) assert.ok(section.includes('`' + n + '`') || ['dataset', 'version', 'generated', 'license', 'homepage', 'docs', 'description'].includes(n), `${n} is not documented`);
});
