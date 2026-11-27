// published_speed: speed figures a provider publishes for a model of its free sample (issue #606; data/schema.json,
// scripts/lib/published-speed.mjs). The validator rules, the quote registry kind, the provider page, the compare table,
// llms-full.txt, the v1 projection and the README TL;DR row made from the data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTmpDir } from './lib/tmp.mjs';
import {
  SPEED_METRICS, SPEED_QUALIFIERS, publishedSpeedErrors, qualifierOf, speedFigure, sharedSpeedModels, speedTldrRow, speedQuoteId, ownSites,
} from './lib/published-speed.mjs';
import { quoteErrors } from './lib/quotes.mjs';
import { mergeRegistry, speedEntriesFor } from './lib/quotes-add.mjs';
import { compareTableHtml, clientBundle } from './lib/compare.mjs';
import { speedHtml } from './lib/provider-sections.mjs';
import { toApiV1Provider, apiV1ProviderSchema } from './lib/api-v1.mjs';
import { ORDER, serialize } from './_serialize.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DATA = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8'));
const SCHEMA = JSON.parse(readFileSync(join(ROOT, 'data/schema.json'), 'utf8'));
const QUOTES = JSON.parse(readFileSync(join(ROOT, 'data/quotes.json'), 'utf8'));
const README = readFileSync(join(ROOT, 'README.md'), 'utf8');
const VALIDATE = join(ROOT, 'scripts/validate.mjs');
const TODAY = '2026-11-24';

const base = () => ({
  slug: 'acme', name: 'Acme', verified: true, docs_url: 'https://docs.acme.ai/limits', models_url: null, openai_base_url: 'https://api.acme.ai/v1',
  models_free: ['org/fast-8b', 'slow-70b'],
});
const entry = (over = {}) => ({
  model: 'org/fast-8b', metric: 'output_tokens_per_second', unit: 'tokens/s', value: 3000, qualifier: 'approx', conditions: null,
  plan_named: false, source: 'https://docs.acme.ai/models', checked: TODAY, quote: 'fast-8b 8 billion ~3,000 org/fast-8b', ...over,
});
const errs = (e, p = {}) => publishedSpeedErrors({ ...base(), ...p, published_speed: Array.isArray(e) ? e : [e] }, { today: TODAY });

test('a well-formed entry passes; absent means nothing to check', () => {
  assert.deepEqual(errs(entry()), []);
  assert.deepEqual(publishedSpeedErrors(base(), { today: TODAY }), []);
  assert.match(publishedSpeedErrors({ ...base(), published_speed: [] }, { today: TODAY })[0], /non-empty list/);
});

test('an unverified provider keeps its entries valid, but the TL;DR and the comparison of models ignore it', () => {
  assert.deepEqual(errs(entry(), { verified: false }), []);
  const prov = (slug, verified) => ({ slug, name: slug, verified, published_speed: [entry({ model: 'gpt-oss-120b' })] });
  assert.deepEqual(sharedSpeedModels([prov('a', true), prov('b', false)]), []);
});

test('the source must be on the provider\'s own site: third parties, aggregators and benchmarks are refused', () => {
  for (const src of ['https://artificialanalysis.ai/models/fast-8b', 'https://openrouter.ai/org/fast-8b', 'https://blog.example.com/acme-speed']) {
    assert.ok(errs(entry({ source: src })).some((m) => /own site/.test(m)), src);
  }
  assert.ok(errs(entry({ source: 'http://docs.acme.ai/models' })).some((m) => /public HTTPS/.test(m)));
  assert.deepEqual(errs(entry({ source: 'https://www.acme.ai/pricing' })), [], 'another host of the same site is the provider\'s own');
  assert.deepEqual([...ownSites(base())].sort(), ['acme.ai']);
});

test('the quote must carry the figure as written, with the matching qualifier; no estimate, no rounding', () => {
  assert.ok(errs(entry({ value: 2900 })).some((m) => /must contain the figure 2900/.test(m)), 'a rounded or estimated value fails');
  assert.ok(errs(entry({ qualifier: 'exact' })).some((m) => /words the figure as approx/.test(m)));
  assert.deepEqual(errs(entry({ quote: 'org/fast-8b delivers 3k tokens per second', qualifier: 'exact' })), [], '"3k" is 3000');
  assert.deepEqual(errs(entry({ quote: 'org/fast-8b at more than 3000 tokens/s', qualifier: 'at_least' })), []);
  assert.deepEqual(errs(entry({ quote: 'org/fast-8b runs at 3000+ tps', qualifier: 'at_least' })), []);
  assert.deepEqual(errs(entry({ quote: 'org/fast-8b with up to 3000 tokens/s off-peak', qualifier: 'up_to', conditions: 'off-peak' })), []);
  assert.ok(errs(entry({ quote: 'gpt-oss-3000b is here, org/fast-8b', qualifier: 'exact' })).some((m) => /must contain the figure/.test(m)), 'digits inside a model name are not the figure');
  assert.equal(qualifierOf({ before: 'TOKEN SPEED ~', after: ' t' }), 'approx');
  assert.equal(qualifierOf({ before: 'against about ', after: ' o' }), 'approx');
  assert.equal(qualifierOf({ before: 'SPEED ', after: '+ ' }), 'at_least');
  assert.equal(qualifierOf({ before: 'peak ', after: ' t' }), 'exact');
});

test('a figure the page attributes to someone else is refused', () => {
  const quote = 'org/fast-8b runs at ~3000 tokens/s according to Artificial Analysis';
  assert.ok(errs(entry({ quote })).some((m) => /attributes the figure/.test(m)));
});

test('model, metric, unit, value, date and uniqueness rules', () => {
  assert.ok(errs(entry({ model: 'paid-405b', quote: 'paid-405b ~3000' })).some((m) => /not in models_free/.test(m)), 'only models of the free sample');
  assert.deepEqual(errs(entry({ model: 'fast-8b', quote: 'fast-8b 8 billion ~3,000' })), [], 'the same model under another deployment name (modelKey) counts');
  assert.ok(errs(entry({ metric: 'tokens' })).some((m) => /metric must be/.test(m)));
  assert.ok(errs(entry({ unit: 'ms' })).some((m) => /unit must be "tokens\/s"/.test(m)));
  assert.ok(errs(entry({ value: 0 })).some((m) => /positive number/.test(m)));
  assert.ok(errs(entry({ checked: '2026-11-25' })).some((m) => /not after today/.test(m)));
  assert.ok(errs(entry({ plan_named: 'no' })).some((m) => /plan_named/.test(m)));
  assert.ok(errs([entry(), entry()]).some((m) => /second output_tokens_per_second entry/.test(m)));
  assert.ok(errs(entry({ quote: '~3000 tokens/s' })).some((m) => /names org\/fast-8b/.test(m)), 'the quote or the page address must name the model');
  assert.deepEqual(errs(entry({ quote: 'TOKEN SPEED ~3000 tps', source: 'https://docs.acme.ai/model/org/fast-8b' })), [], 'a per-model page names it in its address');
  assert.ok(errs(entry({ quote: undefined })).some((m) => /quote is required/.test(m)));
  assert.ok(errs(entry({ conditions: 'x'.repeat(201) })).some((m) => /conditions must be text/.test(m)));
});

test('the dataset holds only provider-published figures for verified providers, each with a registered quote', () => {
  const withSpeed = DATA.providers.filter((p) => p.published_speed);
  assert.ok(withSpeed.length >= 1);
  for (const p of withSpeed) {
    assert.deepEqual(publishedSpeedErrors(p, { today: '2099-01-01' }), [], p.slug);
    for (const e of p.published_speed) {
      const q = QUOTES.entries.find((x) => x.id === speedQuoteId(p.slug, e));
      assert.ok(q, `${p.slug} ${e.model}: speed_quote entry`);
      assert.equal(q.kind, 'speed_quote');
      assert.equal(q.text, e.quote);
      assert.equal(q.source_url, e.source);
    }
  }
  assert.deepEqual(quoteErrors(DATA, QUOTES), []);
});

test('the quote register refuses a missing, changed or orphan speed_quote', () => {
  const data = structuredClone(DATA);
  const p = data.providers.find((x) => x.published_speed);
  const e = p.published_speed[0];
  const id = speedQuoteId(p.slug, e);
  const without = { ...QUOTES, entries: QUOTES.entries.filter((x) => x.id !== id) };
  assert.ok(quoteErrors(data, without).some((m) => m.includes('has no speed_quote entry')));
  const changed = { ...QUOTES, entries: QUOTES.entries.map((x) => (x.id === id ? { ...x, text: `${x.text}.` } : x)) };
  assert.ok(quoteErrors(data, changed).some((m) => m.includes('not byte for byte')));
  const moved = { ...QUOTES, entries: QUOTES.entries.map((x) => (x.id === id ? { ...x, source_url: 'https://example.com/other' } : x)) };
  assert.ok(quoteErrors(data, moved).some((m) => m.includes('another source')));
  delete p.published_speed;
  assert.ok(quoteErrors(data, QUOTES).some((m) => m.includes('has no published_speed entry')));
});

test('quotes:add --speed reads each source and writes only that provider\'s speed quotes', async () => {
  const pageText = 'Models list. '.repeat(20) + 'fast-8b 8 billion ~3,000 org/fast-8b';
  const read = async () => ({ ok: true, text: pageText });
  const { entries, problems } = await speedEntriesFor('acme', [entry()], read, { today: TODAY });
  assert.deepEqual(problems, []);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].id, 'acme.speed.org/fast-8b.output_tokens_per_second');
  assert.match(entries[0].page_sha256, /^[0-9a-f]{64}$/);
  const missing = await speedEntriesFor('acme', [entry({ quote: 'not on the page' })], read, { today: TODAY });
  assert.match(missing.problems[0], /not literally on/);
  const data = { providers: [{ slug: 'acme' }] };
  const reg = { version: 1, entries: [{ id: 'acme.sentence', slug: 'acme', kind: 'sentence' }, { id: 'acme.speed.old.output_tokens_per_second', slug: 'acme', kind: 'speed_quote' }] };
  const merged = mergeRegistry(reg, data, 'acme', entries, { speed: true });
  assert.deepEqual(merged.entries.map((x) => x.id), ['acme.sentence', 'acme.speed.org/fast-8b.output_tokens_per_second']);
  const policyOnly = mergeRegistry(reg, data, 'acme', [], {});
  assert.ok(policyOnly.entries.some((x) => x.kind === 'speed_quote'), 'a data_policy run keeps the speed quotes');
});

test('the validator CLI rejects a figure from a third-party page', () => {
  const data = structuredClone(DATA);
  const p = data.providers.find((x) => x.published_speed);
  p.published_speed[0].source = 'https://artificialanalysis.ai/models';
  const dir = makeTmpDir('flah-speed-');
  const file = join(dir, 'providers.json'); const report = join(dir, 'probe-report.json');
  writeFileSync(file, JSON.stringify(data));
  writeFileSync(report, JSON.stringify({ probed_at: data.generated, count: data.providers.length, results: data.providers.map((x) => ({ slug: x.slug })) }));
  const r = spawnSync(process.execPath, [VALIDATE, file, report], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, VALIDATE_TODAY: '2099-01-01' } });
  assert.notEqual(r.status, 0);
  assert.match(`${r.stdout}${r.stderr}`, /own site/);
});

test('schema: the field is optional, keeps its place in the serializer and passes through API v1 unchanged', () => {
  const prop = SCHEMA.$defs.provider.properties.published_speed;
  assert.equal(prop.type, 'array');
  assert.ok(!SCHEMA.$defs.provider.required.includes('published_speed'));
  const def = SCHEMA.$defs.published_speed_entry;
  assert.deepEqual(def.properties.metric.enum, Object.keys(SPEED_METRICS));
  assert.deepEqual(def.properties.qualifier.enum, SPEED_QUALIFIERS);
  assert.deepEqual(def.properties.unit.enum, [...new Set(Object.values(SPEED_METRICS).map((m) => m.unit))]);
  assert.equal(ORDER.indexOf('published_speed'), ORDER.indexOf('field_checks') - 1, 'published_speed is written just before field_checks');
  assert.equal(serialize(DATA), readFileSync(join(ROOT, 'data/providers.json'), 'utf8'));
  const p = DATA.providers.find((x) => x.published_speed);
  assert.deepEqual(toApiV1Provider(p).published_speed, p.published_speed);
  assert.ok(apiV1ProviderSchema(SCHEMA).$defs.provider.properties.published_speed, 'the v1 schema carries the field');
  assert.ok(apiV1ProviderSchema(SCHEMA).$defs.published_speed_entry);
});

test('provider page: the figure, the provider\'s words, the page, the day, and that it is a claim not stated for the free tier', () => {
  const p = { ...base(), published_speed: [entry({ quote: '<b>~3000</b> org/fast-8b', source: 'javascript:alert(1)' })] };
  const html = speedHtml(p);
  assert.match(html, /<h2 id="published-speed">Published speed<\/h2>/);
  assert.match(html, /~3,000 tok\/s/);
  assert.match(html, /We do not measure speed/);
  assert.match(html, /not stated for the free tier/);
  assert.ok(!html.includes('<b>'), 'the quote is escaped');
  assert.ok(!html.includes('javascript:'), 'an unsafe address is not linked');
  assert.equal(speedHtml(base()), '', 'nothing when nothing is published: absence is not "slow"');
  assert.doesNotMatch(html, /fastest|faster/i);
});

test('compare table: a Published speed row, the same in the browser bundle, with "not stated" when absent', () => {
  const a = { ...base(), slug: 'acme', published_speed: [entry()] };
  const b = { ...base(), slug: 'other', name: 'Other' };
  const html = compareTableHtml([a, b]);
  assert.match(html, /<th scope="row">Published speed<\/th>/);
  assert.match(html, /<code>org\/fast-8b<\/code> ~3,000 tok\/s/);
  assert.match(html, /not stated/);
  assert.match(html, /not our measurement/);
  assert.equal(speedFigure(entry()), '~3,000 tok/s', 'the table and speedFigure write the figure the same way');
  for (const q of SPEED_QUALIFIERS) assert.ok(html.includes('tok/s') && speedFigure(entry({ qualifier: q })).endsWith('3,000 tok/s'));
  const sandbox = {};
  new Function('window', clientBundle())(sandbox);
  assert.equal(sandbox.FLLM_COMPARE.compareTableHtml([a, b]), html, 'the browser runs the same table');
});

test('the README TL;DR speed row is exactly the row the data gives, and says no superlative without a cited figure', () => {
  const row = speedTldrRow(DATA.providers);
  assert.ok(row, 'the data supports a speed row');
  const lines = README.slice(README.indexOf('## TL;DR')).split('\n');
  assert.ok(lines.includes(row), `README TL;DR must carry the row the data gives:\n${row}`);
  const tldr = README.slice(README.indexOf('## TL;DR'), README.indexOf('\n## ', README.indexOf('## TL;DR') + 5));
  assert.doesNotMatch(tldr, /\bfast(?:est|er)\b/i, 'no speed superlative in the TL;DR');
});

test('speedTldrRow compares only a model two providers publish, highest first; otherwise it names publishers without comparing', () => {
  const prov = (slug, name, list) => ({ slug, name, verified: true, published_speed: list });
  const two = [
    prov('b', 'B', [entry({ model: 'gpt-oss-120b', value: 500 })]),
    prov('a', 'A', [entry({ model: 'openai/gpt-oss-120b', value: 3000 })]),
    prov('c', 'C', [entry({ model: 'gpt-oss-120b', value: 9000, qualifier: 'up_to' })]),
  ];
  assert.deepEqual(sharedSpeedModels(two).map((g) => [g.key, g.rows.map((r) => r.provider.slug)]), [['gpt-oss-120b', ['a', 'b']]], 'an "up to" peak is not compared');
  const row = speedTldrRow(two);
  assert.match(row, /\[A\]\(https:\/\/freellmapihub\.com\/p\/a\) or \[B\]/);
  assert.match(row, /~3,000 tok\/s \(A\), ~500 tok\/s \(B\)/);
  assert.match(row, /neither says it applies to the free tier/);
  const one = [prov('a', 'A', [entry()]), { slug: 'z', name: 'Z', verified: false, published_speed: [entry()] }];
  assert.match(speedTldrRow(one), /^\| \*\*Published per-model speeds\*\* \| \[A\]/);
  assert.doesNotMatch(speedTldrRow(one), /\bZ\b/, 'an unverified provider is never named');
  assert.equal(speedTldrRow([]), null);
});

test('llms-full.txt and API docs mention the field', () => {
  const build = readFileSync(join(ROOT, 'scripts/build.mjs'), 'utf8');
  assert.match(build, /Published speed \(the provider's own figures, not measured by us/);
  const api = readFileSync(join(ROOT, 'docs/api.md'), 'utf8');
  assert.match(api, /\*\*`published_speed`\*\*/);
  assert.match(api.split('## What')[0], /`published_speed`/, 'the CSV section lists it among the omitted fields');
});
