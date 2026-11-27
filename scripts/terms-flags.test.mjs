// The two terms flags (dataset 2.16.0): multi_account_forbidden (+ multi_account_condition) and
// limit_circumvention_forbidden. Schema, validator, data pairing with field_checks and quotes, provider page,
// provider Markdown, CSV and the v1 API.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTmpDir } from './lib/tmp.mjs';
import { FIELD_CHECK_FIELDS, PRODUCTION_FLAG_FIELDS, TERMS_FLAG_FIELDS } from './lib/field-checks.mjs';
import { FLAG_DEFS, TERMS_FLAG_DEFS } from './lib/flags.mjs';
import { requirementsHtml, termsRowsHtml, termsValueHtml } from './lib/provider-sections.mjs';
import { providerMarkdown } from './lib/provider-markdown.mjs';
import { PROVIDER_CSV_COLUMNS, providersCsv } from './lib/provider-csv.mjs';
import { toApiV1Provider, apiV1ProviderSchema } from './lib/api-v1.mjs';
import { ORDER } from './_serialize.mjs';
import { quoteErrors } from './lib/quotes.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DATA = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8'));
const QUOTES = JSON.parse(readFileSync(join(ROOT, 'data/quotes.json'), 'utf8'));
const SCHEMA = JSON.parse(readFileSync(join(ROOT, 'data/schema.json'), 'utf8'));
const VALIDATE = join(ROOT, 'scripts/validate.mjs');

function runValidate(data) {
  const dir = makeTmpDir('flah-terms-flags-');
  const providersFile = join(dir, 'providers.json');
  const reportFile = join(dir, 'probe-report.json');
  writeFileSync(providersFile, JSON.stringify(data));
  writeFileSync(reportFile, JSON.stringify({ probed_at: data.generated, count: data.providers.length, results: data.providers.map((p) => ({ slug: p.slug })) }));
  const r = spawnSync(process.execPath, [VALIDATE, providersFile, reportFile], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, VALIDATE_TODAY: '2099-01-01' } });
  return { status: r.status, output: `${r.stdout}${r.stderr}` };
}

const silent = { status: 'source_silent', checked: '2026-11-26', sources: ['https://example.com/terms'], note: 'Terms read in full; nothing on multiple accounts.' };
const stated = { status: 'stated', checked: '2026-11-26', sources: ['https://example.com/terms'], quote: 'You may not create multiple accounts to get around the limits.', note: 'Terms forbid it.' };

/** A copy of the dataset with Groq's terms flags replaced. */
function withTerms(patch) {
  const data = structuredClone(DATA);
  const p = data.providers.find((x) => x.slug === 'groq');
  delete p.multi_account_condition;
  Object.assign(p, patch.values);
  p.field_checks = { ...p.field_checks, ...patch.checks };
  for (const [k, v] of Object.entries(p.field_checks)) if (v === undefined) delete p.field_checks[k];
  return { data, p };
}

test('schema: both flags are optional, the condition follows conditional, and field_checks accepts both', () => {
  const props = SCHEMA.$defs.provider.properties;
  assert.deepEqual(props.multi_account_forbidden.$ref, '#/$defs/multi_account_value');
  assert.deepEqual(props.limit_circumvention_forbidden.$ref, '#/$defs/tristate');
  assert.deepEqual(props.multi_account_condition.type, ['string', 'null']);
  for (const f of [...TERMS_FLAG_FIELDS, 'multi_account_condition']) assert.ok(!SCHEMA.$defs.provider.required.includes(f), `${f} stays optional`);
  assert.deepEqual(Object.keys(props.field_checks.properties), FIELD_CHECK_FIELDS);
  assert.deepEqual(FIELD_CHECK_FIELDS, [...PRODUCTION_FLAG_FIELDS, ...TERMS_FLAG_FIELDS]);
  assert.ok(SCHEMA.$defs.provider.allOf.some((r) => r.if?.properties?.multi_account_forbidden?.const === 'conditional'));
  for (const f of ['multi_account_forbidden', 'multi_account_condition', 'limit_circumvention_forbidden']) assert.ok(ORDER.includes(f), `${f} has a place in the serializer`);
});

test('validate: the dataset as committed passes with both flags', () => {
  const r = runValidate(DATA);
  assert.equal(r.status, 0, r.output);
});

test('validate: conditional needs its condition, and a condition needs conditional', () => {
  let r = runValidate(withTerms({ values: { multi_account_forbidden: 'conditional' }, checks: { multi_account_forbidden: stated } }).data);
  assert.notEqual(r.status, 0);
  assert.match(r.output, /multi_account_forbidden is conditional, so multi_account_condition is required|must have required property 'multi_account_condition'/);
  r = runValidate(withTerms({ values: { multi_account_forbidden: true, multi_account_condition: 'Free plan only.' }, checks: { multi_account_forbidden: stated } }).data);
  assert.notEqual(r.status, 0);
  assert.match(r.output, /multi_account_condition only allowed when multi_account_forbidden is "conditional"|multi_account_condition must be null/);
  r = runValidate(withTerms({ values: { multi_account_forbidden: 'conditional', multi_account_condition: 'Free plan only: one per IP address.' }, checks: { multi_account_forbidden: stated } }).data);
  assert.equal(r.status, 0, r.output);
});

test('validate: limit_circumvention_forbidden has no conditional value', () => {
  const r = runValidate(withTerms({ values: { limit_circumvention_forbidden: 'conditional' }, checks: { limit_circumvention_forbidden: stated } }).data);
  assert.notEqual(r.status, 0);
  assert.match(r.output, /limit_circumvention_forbidden must be (true\/false\/null|boolean,null)/);
});

test('validate: a recorded value carries its check, a check carries its value, and a reason goes with null', () => {
  let r = runValidate(withTerms({ values: { multi_account_forbidden: null }, checks: { multi_account_forbidden: undefined } }).data);
  assert.match(r.output, /multi_account_forbidden is recorded, so field_checks.multi_account_forbidden must say why/);
  const { data, p } = withTerms({ values: {}, checks: {} });
  delete p.limit_circumvention_forbidden;
  r = runValidate(data);
  assert.match(r.output, /field_checks.limit_circumvention_forbidden without a limit_circumvention_forbidden value/);
  r = runValidate(withTerms({ values: { limit_circumvention_forbidden: true }, checks: { limit_circumvention_forbidden: silent } }).data);
  assert.match(r.output, /limit_circumvention_forbidden is true, so its check must be stated/);
  // A provider with neither flag is valid: the fields are optional.
  const bare = withTerms({ values: {}, checks: { multi_account_forbidden: undefined, limit_circumvention_forbidden: undefined } });
  delete bare.p.multi_account_forbidden; delete bare.p.limit_circumvention_forbidden;
  r = runValidate(bare.data);
  assert.equal(r.status, 0, r.output);
});

// The providers added to main after the terms research (2026-11-26) whose terms have not been read for these two flags yet.
// They carry neither flag, so their pages read "Not stated"; the list only shrinks: recording a provider's flags means removing it here.
const TERMS_PENDING = new Set([
  'requesty', 'kilo-gateway', 'experiential-labs', 'google-cloud-tts', 'google-cloud-stt', 'google-cloud-vision',
  'amazon-bedrock', 'oci-generative-ai', 'reducto', 'lightning-ai', 'azure-document-intelligence', 'nscale',
  'gonka-broker', 'moark', 'morph', 'synap',
]);

test('the dataset: every researched provider carries both flags with a check; nulls are source_silent; stated quotes are registered', () => {
  const slugs = new Set(DATA.providers.map((p) => p.slug));
  for (const s of TERMS_PENDING) assert.ok(slugs.has(s), `TERMS_PENDING ${s}: no provider has that slug, so remove it`);
  assert.equal(DATA.providers.filter((p) => !TERMS_PENDING.has(p.slug)).length, 79, 'the 79 providers of the research');
  for (const p of DATA.providers) {
    if (TERMS_PENDING.has(p.slug)) {
      for (const f of TERMS_FLAG_FIELDS) assert.ok(!(f in p) && !p.field_checks?.[f], `${p.slug}: ${f} is recorded now, so remove it from TERMS_PENDING`);
      continue;
    }
    for (const f of TERMS_FLAG_FIELDS) {
      assert.ok(f in p, `${p.slug}: ${f}`);
      const c = p.field_checks?.[f];
      assert.ok(c, `${p.slug}: field_checks.${f}`);
      if (p[f] === null) assert.equal(c.status, 'source_silent', `${p.slug}.${f}`);
      else {
        assert.equal(c.status, 'stated', `${p.slug}.${f}`);
        assert.ok(typeof c.quote === 'string' && c.quote.length > 0, `${p.slug}.${f} has the provider's sentence`);
        const e = QUOTES.entries.find((x) => x.id === `${p.slug}.${f}.sentence`);
        assert.ok(e && e.text === c.quote && e.source_url === c.sources[0], `${p.slug}.${f} is in quotes.json`);
      }
    }
    if (p.multi_account_forbidden === 'conditional') assert.ok(p.multi_account_condition.trim(), `${p.slug}: condition`);
  }
  assert.deepEqual(quoteErrors(DATA, QUOTES, { today: '2099-01-01' }), []);
});

test('terms flags stay out of the explorer: FLAG_DEFS keeps its four flags', () => {
  assert.deepEqual(FLAG_DEFS.map((d) => d.field), ['card_required', 'phone_required', 'commercial_ok', 'data_policy.trains_on_prompts']);
  assert.deepEqual(TERMS_FLAG_DEFS.map((d) => d.field), TERMS_FLAG_FIELDS);
});

test('provider page: a row per flag, "Not stated" for null or absent, the condition and the source line', () => {
  assert.match(termsValueHtml(true), />forbidden</);
  assert.match(termsValueHtml(false), />allowed</);
  assert.match(termsValueHtml('conditional'), />conditional</);
  assert.match(termsValueHtml(null), /tri-unk">Not stated</);
  assert.match(termsValueHtml(undefined), /Not stated/);

  const p = {
    slug: 'x', multi_account_forbidden: 'conditional', multi_account_condition: 'Free plan only: <one> per IP.', limit_circumvention_forbidden: null,
    field_checks: {
      multi_account_forbidden: { status: 'stated', checked: '2026-11-26', sources: ['https://example.com/tos'], quote: 'Only one free plan per IP.' },
      limit_circumvention_forbidden: { status: 'source_silent', checked: '2026-11-20', sources: ['https://example.com/tos'], note: 'Terms read in full.' },
    },
  };
  const html = termsRowsHtml(p);
  assert.match(html, /Several accounts per person/);
  assert.match(html, /Getting around rate limits/);
  assert.match(html, /pflag pflag-cond/);
  assert.match(html, /pflag pflag-unk/);
  assert.match(html, /Free plan only: &lt;one&gt; per IP\./, 'the condition is shown, escaped');
  assert.match(html, /&ldquo;Only one free plan per IP\.&rdquo;/);
  assert.match(html, /Read <a href="https:\/\/example.com\/tos"[^>]*>the provider's page<\/a>, checked <time datetime="2026-11-20">20 Nov 2026<\/time>\. Terms read in full\./);
  assert.match(html, /<span class="sr-only">Getting around limits forbidden: not stated in the provider&#39;s docs<\/span>/);
  assert.doesNotMatch(html, /allowed/, 'null is never shown as allowed');

  const forbidden = termsRowsHtml({ multi_account_forbidden: true, limit_circumvention_forbidden: false });
  assert.match(forbidden, /pflag pflag-bad[^]*forbidden/);
  assert.match(forbidden, /pflag pflag-ok[^]*allowed/);

  assert.doesNotMatch(requirementsHtml(p), /Several accounts per person/, 'model pages keep the three requirement rows');
  assert.match(requirementsHtml(p, { terms: true }), /Commercial use[^]*Several accounts per person[^]*Getting around rate limits[^]*<\/dl>$/);
});

test('the built provider page shows both rows for every provider', () => {
  const build = readFileSync(join(ROOT, 'scripts/build.mjs'), 'utf8');
  assert.match(build, /requirementsHtml\(p, \{ (anchors: true, )?terms: true \}\)/);
  assert.match(build, /What you need to start: card, phone, commercial use, account rules/);
});

test('provider Markdown: both flags in words, "not stated" for null', () => {
  const groq = DATA.providers.find((x) => x.slug === 'groq');
  const md = providerMarkdown(groq, { site: 'https://freellmapihub.com', repo: 'https://github.com/pacocartones/free-llm-api-hub' });
  assert.match(md, /- \*\*Several accounts per person:\*\* forbidden/);
  assert.match(md, /- \*\*Getting around rate limits:\*\* forbidden/);
  const silentOne = DATA.providers.find((x) => x.multi_account_forbidden === null);
  assert.match(providerMarkdown(silentOne, { site: 'https://freellmapihub.com', repo: 'https://github.com/pacocartones/free-llm-api-hub' }), /- \*\*Several accounts per person:\*\* not stated/);
  const cond = DATA.providers.find((x) => x.multi_account_forbidden === 'conditional');
  assert.ok(providerMarkdown(cond, { site: 'https://freellmapihub.com', repo: 'https://github.com/pacocartones/free-llm-api-hub' }).includes(`conditional (${cond.multi_account_condition}`));
});

test('CSV: three new columns after commercial_ok_condition, null stays empty', () => {
  const i = PROVIDER_CSV_COLUMNS.indexOf('commercial_ok_condition');
  assert.deepEqual(PROVIDER_CSV_COLUMNS.slice(i + 1, i + 4), ['multi_account_forbidden', 'multi_account_condition', 'limit_circumvention_forbidden']);
  const csv = providersCsv({ version: '9.9.9', generated: '2026-11-26', providers: [
    { slug: 'a', name: 'A', multi_account_forbidden: 'conditional', multi_account_condition: 'Free trial only.', limit_circumvention_forbidden: null },
    { slug: 'b', name: 'B', multi_account_forbidden: true, limit_circumvention_forbidden: false },
  ] });
  const [head, a, b] = csv.trim().split(/\r?\n/);
  const col = (row, name) => row.split(',')[head.split(',').indexOf(name)];
  assert.equal(col(a, 'multi_account_forbidden'), 'conditional');
  assert.equal(col(a, 'multi_account_condition'), 'Free trial only.');
  assert.equal(col(a, 'limit_circumvention_forbidden'), '');
  assert.equal(col(b, 'multi_account_forbidden'), 'true');
  assert.equal(col(b, 'limit_circumvention_forbidden'), 'false');
});

test('API v1: both flags pass through as they are (conditional included) and the v1 schema describes them', () => {
  const cond = DATA.providers.find((x) => x.multi_account_forbidden === 'conditional');
  const out = toApiV1Provider(cond);
  assert.equal(out.multi_account_forbidden, 'conditional');
  assert.equal(out.multi_account_condition, cond.multi_account_condition);
  assert.deepEqual(out.field_checks.multi_account_forbidden, cond.field_checks.multi_account_forbidden);
  const v1 = apiV1ProviderSchema(SCHEMA);
  assert.equal(v1.$defs.provider.properties.multi_account_forbidden.$ref, '#/$defs/multi_account_value');
  assert.ok(v1.$defs.multi_account_value, 'the conditional value stays in the v1 schema');
  assert.ok(v1.$defs.provider.allOf.some((r) => r.if?.properties?.multi_account_forbidden), 'the condition rule stays in the v1 schema');
});
