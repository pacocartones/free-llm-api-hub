// v2.16.0 base: /api/v1/models.json (the free-model matrix), the additive fields of /api/v1/changes.json, and the
// optional free_limits.per_model (lib/free-limits.mjs, lib/models-api.mjs, lib/changes.mjs, data/*.schema.json).
// Fixture tests for the pure code, schema checks for the published contracts, and checks on the built files.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { makeTmpDir } from './lib/tmp.mjs';
import { LIMIT_KEYS, limitsForModel, perModelLimitErrors } from './lib/free-limits.mjs';
import { modelsApiBody, modelRow, rowProvenance } from './lib/models-api.mjs';
import { groupModels, modelKey } from './lib/model-keys.mjs';
import { historyFromRevisions } from './lib/history.mjs';
import { flattenFieldChanges, groupChangesByWeek, changesRss, changesApiBody, weekGuid } from './lib/changes.mjs';
import { projectApiV1Changes } from './lib/api-v1.mjs';
import { freeLimitsTableHtml, limitsHtml } from './lib/provider-sections.mjs';
import { modelPageMainHtml } from './lib/model-pages.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
const DATA = read('data/providers.json');
const CANONICAL = read('data/schema.json');
const MODELS_SCHEMA = read('data/models.schema.json');
const CHANGES_SCHEMA = read('data/changes.schema.json');
const SITE = 'https://example.test';
const VALIDATE = join(ROOT, 'scripts/validate.mjs');

const compile = (schema) => {
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictTypes: false, validateFormats: true });
  addFormats(ajv, ['date', 'uri']);
  return ajv.compile(schema);
};
const assertValid = (validate, value, what) => assert.ok(validate(value), `${what}: ${JSON.stringify(validate.errors, null, 1)}`);

const envelope = { dataset: 'free-llm-api-hub', version: '2.16.0', generated: '2026-11-25', license: 'MIT', homepage: `${SITE}/`, docs: `${SITE}/api/` };

const prov = (slug, extra = {}) => ({
  slug, name: slug.toUpperCase(), category: 'ongoing', free_type: 'renewing-quota', free_tier: 'x', rate_limits: '10 rpm', notes: '',
  modalities: ['text'], card_required: false, phone_required: null, commercial_ok: null, openai_compatible: true,
  openai_base_url: `https://api.${slug}.test/v1`, docs_url: `https://${slug}.test/docs`, verified: true, last_verified: '2026-11-20',
  is_text_llm: true, models_free: ['org/alpha-8b', 'beta-70b'], ...extra,
});
const limits = (extra = {}) => ({ requests_per_minute: 30, requests_per_day: 1000, scope: 'free plan', source: 'https://acme.test/limits', checked: '2026-11-24', ...extra });

// ---------- free_limits.per_model ----------

test('limitsForModel: an exact per-model entry wins, else provider-wide numbers, else none_published / not_recorded', () => {
  const p = prov('acme', { free_limits: limits({ per_model: [{ model: 'org/alpha-8b', requests_per_minute: 60, tokens_per_day: 500000, scope: 'on-demand' }] }) });
  assert.deepEqual(limitsForModel(p, 'org/alpha-8b'), {
    applies_to: 'model', limits: { requests_per_minute: 60, tokens_per_day: 500000 }, scope: 'on-demand', source: 'https://acme.test/limits', checked: '2026-11-24',
  });
  assert.deepEqual(limitsForModel(p, 'beta-70b'), {
    applies_to: 'provider', limits: { requests_per_minute: 30, requests_per_day: 1000 }, scope: 'free plan', source: 'https://acme.test/limits', checked: '2026-11-24',
  });
  assert.equal(limitsForModel(p, 'alpha-8b').applies_to, 'provider', 'another spelling of the same model never matches an entry');
  assert.deepEqual(limitsForModel(prov('none', { free_limits: null }), 'beta-70b'), { applies_to: 'none_published' });
  assert.deepEqual(limitsForModel(prov('absent'), 'beta-70b'), { applies_to: 'not_recorded' });
  const onlyPerModel = prov('pm', { free_limits: { source: 'https://pm.test/l', checked: '2026-11-24', per_model: [{ model: 'beta-70b', requests_per_day: 10 }] } });
  assert.equal(limitsForModel(onlyPerModel, 'org/alpha-8b').applies_to, 'not_recorded', 'numbers for one model are never used for another');
  assert.equal(limitsForModel(onlyPerModel, 'beta-70b').applies_to, 'model');
});

test('perModelLimitErrors: the model must be in models_free exactly, once, with at least one number', () => {
  const errs = (per_model, extra = {}) => perModelLimitErrors(prov('acme', { free_limits: limits({ per_model }), ...extra }));
  assert.deepEqual(perModelLimitErrors(prov('acme', { free_limits: limits() })), [], 'absent: nothing to check');
  assert.deepEqual(errs([{ model: 'org/alpha-8b', requests_per_minute: 60 }, { model: 'beta-70b', tokens_per_day: 1 }]), []);
  assert.match(errs([{ model: 'gpt-x', requests_per_minute: 60 }])[0], /must be an ID of the provider's models_free/);
  assert.match(errs([{ model: 'alpha-8b', requests_per_minute: 60 }])[0], /exactly as listed/, 'a bare ID is not the listed one');
  assert.match(errs([{ model: 'beta-70b', requests_per_minute: 1 }, { model: 'beta-70b', requests_per_day: 2 }])[0], /more than once/);
  assert.match(errs([{ model: 'beta-70b', scope: 'only words' }])[0], /at least one numeric limit/);
  assert.match(errs([])[0], /non-empty array/);
  assert.match(errs([{ model: 'beta-70b', requests_per_day: 2 }], { models_free: null })[0], /models_free/);
});

test('schema: per_model is optional, closed, and keeps free_limits one object (the v1 type)', () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv, ['date', 'uri']);
  const flSchema = { $defs: CANONICAL.$defs, ...CANONICAL.$defs.provider.properties.free_limits };
  const validate = ajv.compile(flSchema);
  assert.ok(validate(limits()), 'unchanged shape still valid');
  assert.ok(validate(limits({ per_model: [{ model: 'm', requests_per_minute: 1 }] })));
  assert.ok(!validate(limits({ per_model: [] })), 'an empty list is refused');
  assert.ok(!validate(limits({ per_model: [{ model: 'm' }] })), 'an entry needs more than its model');
  assert.ok(!validate(limits({ per_model: [{ model: 'm', requests_per_minute: 1, source: 'https://x.test' }] })), 'entries share the parent source');
  assert.ok(!validate(limits({ per_model: [{ model: 'm', requests_per_minute: 0 }] })));
  assert.ok(!validate([limits()]), 'free_limits is not an array');
  assert.deepEqual(LIMIT_KEYS.filter((k) => !CANONICAL.$defs.provider.properties.free_limits.properties.per_model.items.properties[k]), [], 'every unit is allowed per model');
});

test('the validator CLI rejects a per-model limit for a model the provider does not list', () => {
  const data = structuredClone(DATA);
  const p = data.providers.find((x) => x.free_limits && Array.isArray(x.models_free) && x.models_free.length);
  p.free_limits.per_model = [{ model: 'not-a-listed-model', requests_per_minute: 5 }];
  const dir = makeTmpDir('flah-per-model-');
  const file = join(dir, 'providers.json'); const report = join(dir, 'probe-report.json');
  writeFileSync(file, JSON.stringify(data));
  writeFileSync(report, JSON.stringify({ probed_at: data.generated, count: data.providers.length, results: data.providers.map((x) => ({ slug: x.slug })) }));
  const bad = spawnSync(process.execPath, [VALIDATE, file, report], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, VALIDATE_TODAY: '2099-01-01' } });
  assert.notEqual(bad.status, 0);
  assert.match(`${bad.stdout}${bad.stderr}`, /free_limits\.per_model\[0\]\.model "not-a-listed-model"/);
  p.free_limits.per_model = [{ model: p.models_free[0], requests_per_minute: 5 }];
  writeFileSync(file, JSON.stringify(data));
  const good = spawnSync(process.execPath, [VALIDATE, file, report], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, VALIDATE_TODAY: '2099-01-01' } });
  assert.doesNotMatch(`${good.stdout}${good.stderr}`, /per_model/, 'a listed ID passes the per_model rule');
});

test('provider page lists per-model numbers in their own table; the model page shows the numbers for its exact ID', () => {
  const p = prov('acme', { free_limits: limits({ per_model: [{ model: 'org/alpha-8b', requests_per_minute: 60, tokens_per_day: 500000 }] }) });
  const page = limitsHtml(p);
  assert.match(page, /<caption>Limits the provider publishes per model<\/caption>/);
  assert.match(page, /<th scope="row"><code>org\/alpha-8b<\/code><\/th><td>60<\/td><td>500,000<\/td>/);
  assert.match(page, /<th scope="row">requests per day<\/th><td>1,000<\/td>/, 'the provider-wide numbers stay');
  const own = freeLimitsTableHtml(p, { model: 'org/alpha-8b' });
  assert.match(own, /Published for <code>org\/alpha-8b<\/code>\./);
  assert.doesNotMatch(own, /1,000/, 'not the provider-wide numbers');
  assert.match(freeLimitsTableHtml(p, { model: 'beta-70b' }), /Provider-wide limits: none are recorded for this model ID on its own\./);
  const group = groupModels([p]).find((g) => g.key === 'alpha-8b');
  assert.match(modelPageMainHtml(group, { asOf: '2026-11-25' }), /Published for <code>org\/alpha-8b<\/code>/);
  // Without per_model nothing changes: the same markup as before the field existed.
  const plain = prov('plain', { free_limits: limits() });
  assert.equal(freeLimitsTableHtml(plain, { model: 'beta-70b' }), freeLimitsTableHtml(plain));
  assert.doesNotMatch(limitsHtml(plain), /per model/);
});

// ---------- models.json ----------

test('models.json rows carry only recorded values, the v1 projection and per-row provenance', () => {
  const a = prov('a', { commercial_ok: 'conditional', commercial_ok_condition: 'Per-model licence.', models_url: 'https://a.test/models',
    data_policy: { trains_on_prompts: false, retention: null, source: 'https://a.test/privacy', checked: '2026-11-21' }, free_limits: limits() });
  const b = prov('b', { verified: false, last_verified: null, openai_base_url: null, openai_compatible: null, models_free: ['@cf/org/alpha-8b'] });
  const body = modelsApiBody(groupModels([a, b]), { site: SITE });
  const alpha = body.models.find((m) => m.key === 'alpha-8b');
  assert.equal(alpha.provider_count, 2);
  assert.equal(alpha.page, `${SITE}/models/alpha-8b/`);
  assert.equal(alpha.indexable, false, 'one verified provider is not enough to index');
  const [ra, rb] = alpha.providers;
  assert.equal(ra.slug, 'a', 'the verified provider first, as on the model page');
  assert.equal(ra.model_id, 'org/alpha-8b');
  assert.equal(ra.commercial_ok, null, 'conditional projects to null, as in every v1 provider object');
  assert.equal(ra.commercial_ok_condition, 'Per-model licence.');
  assert.equal(ra.limits_scope, 'provider');
  assert.deepEqual(ra.free_limits, { requests_per_minute: 30, requests_per_day: 1000, scope: 'free plan', source: 'https://acme.test/limits', checked: '2026-11-24' });
  assert.deepEqual(ra.provenance, { source: 'https://a.test/models', source_kind: 'models_url', checked: '2026-11-20' });
  assert.deepEqual(ra.data_policy, { trains_on_prompts: false, retention: null, source: 'https://a.test/privacy', checked: '2026-11-21' });
  assert.equal(rb.model_id, '@cf/org/alpha-8b');
  assert.equal(rb.verified, false);
  assert.equal(rb.last_verified, null);
  assert.equal(rb.openai_base_url, null);
  assert.equal(rb.limits_scope, 'not_recorded');
  assert.equal(rb.free_limits, null);
  assert.deepEqual(rb.provenance, { source: 'https://b.test/docs', source_kind: 'docs_url', checked: null }, 'an unverified entry has no checked date');
  assert.deepEqual(rowProvenance({ docs_url: '', models_url: null }), { source: null, source_kind: null, checked: null });
  assert.equal(body.count, body.models.length);
  assert.equal(body.pairs, 3);
  assert.deepEqual(body.models.map((m) => m.key), [...body.models.map((m) => m.key)].sort());
  assertValid(compile(MODELS_SCHEMA), { ...envelope, ...body }, 'fixture models.json');
  assert.equal(modelRow({ id: 'beta-70b', p: prov('n', { free_limits: null }) }).limits_scope, 'none_published');
});

test('models.json from the real dataset validates and matches providers.json pair for pair', () => {
  const body = modelsApiBody(groupModels(DATA.providers), { site: SITE });
  assertValid(compile(MODELS_SCHEMA), { ...envelope, ...body }, 'dataset models.json');
  const inFile = new Set(body.models.flatMap((m) => m.providers.map((r) => `${m.key} ${r.slug}`)));
  const fromData = new Set();
  for (const p of DATA.providers) for (const id of p.models_free || []) { const k = modelKey(id); if (k) fromData.add(`${k} ${p.slug}`); }
  assert.deepEqual([...inFile].sort(), [...fromData].sort(), 'every (model, provider) pair of models.json is in providers.json and vice versa');
  const bySlug = new Map(DATA.providers.map((p) => [p.slug, p]));
  for (const m of body.models) for (const r of m.providers) {
    assert.ok(bySlug.get(r.slug).models_free.includes(r.model_id), `${r.slug} lists ${r.model_id}`);
    if (r.free_limits) assert.equal(r.free_limits.source, bySlug.get(r.slug).free_limits.source, 'limits keep their own source');
  }
});

test('the built models.json is the published contract and is in the manifest', { skip: !existsSync(join(ROOT, 'site/api/v1/models.json')) && 'run npm run build first' }, () => {
  const built = read('site/api/v1/models.json');
  assertValid(compile(MODELS_SCHEMA), built, 'site/api/v1/models.json');
  assert.equal(built.schema, 'https://freellmapihub.com/api/v1/models.schema.json');
  assert.deepEqual(read('site/api/v1/models.schema.json'), MODELS_SCHEMA);
  const index = read('site/api/v1/index.json');
  assert.equal(index.endpoints.models, 'v1/models.json');
  assert.equal(index.endpoints['models-schema'], 'v1/models.schema.json');
  assert.equal(index.endpoints['changes-schema'], 'v1/changes.schema.json');
  const pins = read('derived-fingerprints.json');
  assert.ok(pins['site/api/v1/models.json'], 'models.json depends only on the dataset, so the drift gate pins it');
});

// ---------- changes.json ----------

const crev = (date, hash, providers) => ({ hash, date, parsed: { providers } });
const H1 = 'a'.repeat(40); const H2 = 'b'.repeat(40); const H3 = 'c'.repeat(40);

test('history events carry the commit of the change; history.json does not need it', () => {
  const { historyBySlug } = historyFromRevisions([
    crev('2026-11-02', H1, [prov('a')]),
    crev('2026-11-10', H2, [prov('a', { rate_limits: '20 rpm' })]),
    { date: '2026-11-11', parsed: { providers: [prov('a', { rate_limits: '30 rpm' })] } },
  ]);
  assert.equal(historyBySlug.a[0].kind, 'added');
  assert.equal('commit' in historyBySlug.a[0], false, 'added events are unchanged');
  assert.equal(historyBySlug.a[1].commit, H2);
  assert.equal('commit' in historyBySlug.a[2], false, 'a revision without a hash adds no commit');
  const flat = flattenFieldChanges(historyBySlug, { a: 'Alpha' });
  assert.deepEqual(flat.map((c) => c.commit), [null, H2]);
});

test('changes.json keeps its original shape first and adds labels, commits and the matching feed item', () => {
  const { historyBySlug } = historyFromRevisions([
    crev('2026-10-01', H1, [prov('a'), prov('b')]),
    crev('2026-10-06', H2, [prov('a', { rate_limits: '20 rpm', card_required: true }), prov('b')]),
    crev('2026-10-14', H3, [prov('a', { rate_limits: '20 rpm', card_required: true }), prov('b', { notes: 'phone', commercial_ok: 'conditional', commercial_ok_condition: 'Non-profit only.' })]),
  ]);
  const flat = flattenFieldChanges(historyBySlug, { a: 'Alpha', b: 'Beta' });
  const feedWeeks = groupChangesByWeek(flat);
  const apiWeeks = groupChangesByWeek(projectApiV1Changes(flat));
  const body = changesApiBody(apiWeeks, { site: SITE });
  assertValid(compile(CHANGES_SCHEMA), { ...envelope, ...body }, 'fixture changes.json');
  assert.equal(body.schema, `${SITE}/api/v1/changes.schema.json`);
  assert.equal(body.feed, `${SITE}/changes.xml`);
  assert.equal(body.window_weeks, 12);
  assert.equal(body.count, 4, 'b: notes and commercial_ok_condition (its commercial_ok null to conditional projects to no change); a: two fields');
  assert.deepEqual(body.fields.slice(0, 3).map((f) => f.field), ['free_tier', 'rate_limits', 'notes']);
  assert.deepEqual(body.fields[1], { field: 'rate_limits', label: 'rate limits' });
  for (const w of body.weeks) {
    assert.deepEqual(Object.keys(w).slice(0, 5), ['week', 'start', 'end', 'count', 'changes'], 'the original week keys come first, in order');
    for (const c of w.changes) assert.deepEqual(Object.keys(c).slice(0, 6), ['date', 'slug', 'name', 'field', 'from', 'to'], 'the original change keys come first');
  }
  const [w42, w41] = body.weeks;
  assert.equal(w41.week, '2026-W41');
  assert.deepEqual(w41.changes.map((c) => [c.field, c.label, c.commit]), [['rate_limits', 'rate limits', H2], ['card_required', 'card requirement', H2]]);
  assert.deepEqual(w42.providers, ['b']);
  assert.equal(w42.guid, weekGuid({ week: '2026-W42' }));
  // The JSON's week is the feed item with the same guid, title and description, where no projection removes a change.
  const xml = changesRss(feedWeeks, { site: SITE });
  assert.ok(xml.includes(`<title>${w41.title}</title>`), w41.title);
  assert.ok(xml.includes(`<description>${w41.summary}</description>`), w41.summary);
  assert.ok(xml.includes(`<guid isPermaLink="false">${w41.guid}</guid>`));
  assert.equal(w41.title, '2026-W41 (2026-10-05 to 2026-10-11): 2 field changes across 1 provider');
  // The documented difference: the feed counts b's commercial_ok null -> conditional, the v1 JSON cannot.
  assert.match(xml, /2026-W42 \(2026-10-12 to 2026-10-18\): 3 field changes across 1 provider/);
  assert.equal(w42.count, 2);
});

test('the built changes.json is the published contract and every week is an item of changes.xml', { skip: !existsSync(join(ROOT, 'site/api/v1/changes.json')) && 'run npm run build first' }, () => {
  const built = read('site/api/v1/changes.json');
  assertValid(compile(CHANGES_SCHEMA), built, 'site/api/v1/changes.json');
  assert.deepEqual(read('site/api/v1/changes.schema.json'), CHANGES_SCHEMA);
  const xml = readFileSync(join(ROOT, 'site/changes.xml'), 'utf8');
  const items = (xml.match(/<item>[\s\S]*?<\/item>/g) || []).map((it) => ({
    guid: it.match(/<guid[^>]*>([^<]*)<\/guid>/)[1], title: it.match(/<title>([^<]*)<\/title>/)[1],
  }));
  const titleByGuid = new Map(items.map((i) => [i.guid, i.title]));
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  assert.equal(built.count, built.weeks.reduce((n, w) => n + w.changes.length, 0));
  for (const w of built.weeks) {
    assert.ok(titleByGuid.has(w.guid), `${w.week} is an item of changes.xml`);
    assert.equal(w.count, w.changes.length);
    // Same title unless the v1 projection removed a conditional-only change from that week.
    if (titleByGuid.get(w.guid) !== esc(w.title)) assert.match(titleByGuid.get(w.guid), new RegExp(`^${w.week} `));
    for (const c of w.changes) assert.ok(c.commit === null || /^[0-9a-f]{40}$/.test(c.commit));
  }
});
