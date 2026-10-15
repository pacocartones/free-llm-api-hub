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
import { hasHiddenChars } from './lib/hidden-chars.mjs';
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
// Our own words only: the title, the description, the hero and the main text, without a tool's quoted sentences, which are shown as written.
const BANNED = /\b(safe|secure|private|guarantee[sd]?|best|worst|better|worse|recommended|featured|winner|top)\b/i;
const ourWords = (html) => {
  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
  const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
  const hero = (html.match(/<section class="page-hero[\s\S]*?<\/section>/) || [''])[0];
  const main = html.slice(html.indexOf('<main id="main"'), html.indexOf('</main>'));
  return [title, desc, hero, main].join(' ').replace(/<blockquote[\s\S]*?<\/blockquote>/g, ' ').replace(/<[^>]*>/g, ' ');
};
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
  assert.match(html, /Not stated<\/span> <span class="muted">Context quoted from the page:<\/span>/, 'a sentence under a not-stated value is context, not the value');
  assert.match(html, /<span class="gpu-unstated">Not stated<\/span>/);
  assert.match(html, /never the same as <em>no<\/em>/);
  assert.match(html, /not part of the ranking/);
  assert.doesNotMatch(ourWords(html), BANNED);
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

// ---- the tools you connect your own key to: a second file, the same rules, a page subsection and an endpoint of its own ----
const ownKey = () => JSON.parse(readFileSync(join(ROOT, 'data/coding-tools-own-key.json'), 'utf8'));
const ownKeyApi = () => JSON.parse(readFileSync(join(out(), 'site/api/v1/coding-tools-own-key.json'), 'utf8'));
const ownKeyApiSchema = () => JSON.parse(readFileSync(join(ROOT, 'data/coding-tools-own-key-api.schema.json'), 'utf8'));

test('own-key file: passes the same rules and schema, and shares no slug with the other file or a provider', () => {
  const o = ownKey();
  assert.deepEqual(codingToolsErrors(o, slugs), []);
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(JSON.parse(readFileSync(join(ROOT, 'data/coding-tools.schema.json'), 'utf8')));
  assert.equal(validate(o), true, JSON.stringify(validate.errors));
  const main = new Set(section().entries.map((e) => e.slug));
  for (const e of o.entries) assert.ok(!main.has(e.slug) && !slugs.has(e.slug), `${e.slug} is in another list`);
  assert.match(o.note, /inference is paid with your own key or a free API/);
});

test('own-key page: the subsection shows every sentence and links the free APIs, and the page stays out of counts', () => {
  buildSite();
  const html = readFileSync(join(out(), 'site/coding-tools/index.html'), 'utf8');
  assert.match(html, /<h2 id="own-key">Tools you connect your own key to<\/h2>/);
  assert.match(html, /href="\.\.\/collections\/openai-compatible\.html"/);
  assert.match(html, /href="\.\.\/#explorer"/);
  for (const e of ownKey().entries) {
    assert.ok(html.includes(esc(e.name)), `${e.name} is missing from the page`);
    for (const c of Object.values(e.claims)) for (const q of c.quotes) {
      assert.ok(html.includes(esc(q.text)), `a sentence of ${e.name} is missing from the page`);
      assert.ok(html.includes(`read ${q.read}`));
    }
    assert.ok(!existsSync(join(out(), `site/p/${e.slug}.html`)), `${e.slug} got a provider page`);
  }
  // Our own words only: a tool's sentence is quoted as it is and may use any word.
  const visible = ourWords(html);
  assert.doesNotMatch(visible, BANNED);
  assert.doesNotMatch(visible, /\b(you can|you should|we recommend|change often|before you rely|not legal advice)\b/i, 'no advice and no unsourced claim in our voice');
});

test('own-key endpoint: carries the data file as it is, validates against its own schema and never mixes with coding-tools.json', () => {
  buildSite();
  const file = ownKeyApi();
  const o = ownKey();
  assert.deepEqual(file.entries, o.entries);
  assert.equal(file.count, o.entries.length);
  assert.equal(file.schema, ownKeyApiSchema().$id);
  assert.equal(file.schema, 'https://freellmapihub.com/api/v1/coding-tools-own-key.schema.json');
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictTypes: false, validateFormats: true });
  addFormats(ajv, ['date', 'uri']);
  const validate = ajv.compile(ownKeyApiSchema());
  assert.equal(validate(file), true, JSON.stringify(validate.errors));
  assert.equal(validate({ ...structuredClone(file), entries: [{ ...file.entries[0], kind: 'plugin' }] }), false, 'a kind outside the three fails');
  const main = apiFile();
  assert.ok(main.entries.every((e) => !file.entries.some((x) => x.slug === e.slug)), 'no entry is in both endpoints');
  assert.ok(!('own_key_entries' in main), 'the contract of coding-tools.json did not change');
  const index = JSON.parse(readFileSync(join(out(), 'site/api/v1/index.json'), 'utf8'));
  assert.equal(index.endpoints['coding-tools-own-key'], 'v1/coding-tools-own-key.json');
  assert.equal(index.endpoints['coding-tools-own-key-schema'], 'v1/coding-tools-own-key.schema.json');
  assert.equal(readFileSync(join(out(), 'site/api/v1/coding-tools-own-key.schema.json'), 'utf8'), readFileSync(join(ROOT, 'data/coding-tools-own-key-api.schema.json'), 'utf8'));
});

test('the same slug in both coding-tools files is rejected by the validator', () => {
  const dup = { ...ownKey(), entries: [{ ...ownKey().entries[0], slug: section().entries[0].slug }] };
  const all = [...section().entries, ...dup.entries].map((e) => e.slug);
  assert.ok(new Set(all).size < all.length, 'the fixture really repeats a slug');
  // The rule lives in scripts/validate.mjs (it reads both files); the per-file check only sees one list.
  assert.match(readFileSync(join(ROOT, 'scripts/validate.mjs'), 'utf8'), /is in both coding-tools files/);
});

test('no entry can clash with the page or the other lists: own-key anchor, llms.txt, best.json, the API of the top 10 and the coverage page', () => {
  buildSite();
  const all = [...section().entries, ...ownKey().entries].map((e) => e.slug);
  assert.ok(!all.includes('own-key'), 'a slug "own-key" would clash with the id of the subsection');
  const files = ['site/llms.txt', 'site/llms-full.txt', 'data/best.json', 'site/api/v1/best.json', 'site/coverage/index.html', 'site/scores.json'];
  for (const f of files) {
    const path = join(out(), f);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, 'utf8');
    for (const slug of all) assert.ok(!text.includes(slug), `${f} mentions the coding tool ${slug}`);
  }
  const page = readFileSync(join(out(), 'site/coding-tools/index.html'), 'utf8');
  for (const slug of all) assert.equal((page.match(new RegExp('id="' + slug + '"', 'g')) || []).length, 1, `${slug} is the id of exactly one block`);
});

// ---- hidden characters: one definition (lib/hidden-chars.mjs) shared with data_policy, one test per class ----
const HIDDEN_CLASSES = [
  ['control character', 0x0007], ['delete', 0x007f], ['C1 control', 0x0085], ['soft hyphen', 0x00ad],
  ['combining grapheme joiner', 0x034f], ['Arabic letter mark', 0x061c], ['Mongolian vowel separator', 0x180e],
  ['zero-width space', 0x200b], ['zero-width non-joiner', 0x200c], ['left-to-right mark', 0x200e],
  ['line separator', 0x2028], ['right-to-left override', 0x202e], ['word joiner', 0x2060], ['directional isolate', 0x2066],
  ['variation selector 16', 0xfe0f], ['byte order mark', 0xfeff], ['tag character', 0xe0041], ['variation selector supplement', 0xe0100],
  ['Mongolian free variation selector one', 0x180b], ['Mongolian free variation selector three', 0x180d], ['Mongolian free variation selector four', 0x180f],
  ['Hangul choseong filler', 0x115f], ['Hangul jungseong filler', 0x1160], ['Hangul filler', 0x3164], ['halfwidth Hangul filler', 0xffa0],
  ['Khmer inherent vowel aq', 0x17b4], ['Khmer inherent vowel aa', 0x17b5], ['blank Braille pattern', 0x2800],
];

test('hidden characters: every class is rejected in a sentence, a name and a note, by the same definition data_policy uses', () => {
  for (const [label, cp] of HIDDEN_CLASSES) {
    const bad = 'a' + String.fromCodePoint(cp) + 'b';
    assert.equal(hasHiddenChars(bad), true, `${label} is not caught by the shared definition`);
    const inQuote = entry(); inQuote.claims.limits = claim('stated', [quote({ text: bad })]);
    assert.ok(codingToolsErrors({ entries: [inQuote] }, slugs).some((m) => /control, bidirectional or zero-width/.test(m)), `${label} accepted in a sentence`);
    assert.ok(codingToolsErrors({ entries: [entry({ name: bad })] }, slugs).some((m) => /name must not contain/.test(m)), `${label} accepted in a name`);
    const note = { subject: 'S', text: 'ok', quotes: [] };
    assert.ok(codingToolsErrors({ entries: [entry()], notes: [{ ...note, text: bad }] }, slugs).some((m) => /must not contain/.test(m)), `${label} accepted in a note text`);
    assert.ok(codingToolsErrors({ entries: [entry()], notes: [{ ...note, quotes: [quote({ text: bad })] }] }, slugs).some((m) => /control, bidirectional or zero-width/.test(m)), `${label} accepted in a note sentence`);
  }
  for (const ok of ['plain text', 'caf\u00e9', 'a b', 'tab\u0020space', '\u201cquoted\u201d', '\u4e2d\u6587']) assert.equal(hasHiddenChars(ok), false, `a normal text was rejected: ${JSON.stringify(ok)}`);
});

test('hidden characters: the two validators use the shared file and neither defines its own pattern', () => {
  const validate = readFileSync(join(ROOT, 'scripts/validate.mjs'), 'utf8');
  const tools = readFileSync(join(ROOT, 'scripts/lib/coding-tools.mjs'), 'utf8');
  for (const [name, src] of [['validate.mjs', validate], ['coding-tools.mjs', tools]]) {
    assert.match(src, /from '\.\/(lib\/)?hidden-chars\.mjs'/, `${name} does not import the shared definition`);
    assert.doesNotMatch(src, /HIDDEN_CHARS_RE\s*=/, `${name} defines its own pattern`);
  }
});
