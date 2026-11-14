import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTmpDir } from './lib/tmp.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DATA = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8'));
const VALIDATE = join(ROOT, 'scripts/validate.mjs');

// Check/error-site inventory at main 46b93b5 (source line | diagnostic/protection | evidence).
// Count call sites, not loop iterations or rules inside imported helpers. Schema
// rejection is NOT evidence for a later hand-written check: the existing tier
// pairing, vote-floor, verified-date and commercial-condition cases stop in Ajv.
// 93 sites total; 35 have targeted direct cases below;
// 58 have no dedicated direct case in this file. Imported helpers may
// have their own unit tests; this is not a repository-wide coverage percentage.
// The shared hidden-character loop has two new fixtures but counts as one site.
// | validate.mjs line | Diagnostic or delegated protection | Evidence |
// | --- | --- | --- |
// | 81 | top-level: version must be semver | no dedicated direct case |
// | 82 | top-level: generated must be YYYY-MM-DD | no dedicated direct case |
// | 87 | top-level: generated (${data.generated}) is after today in UTC (${todayUtc}); write the dates of the dataset in UTC (date -u +%F) | existing case |
// | 89 | top-level: providers must be a non-empty array | no dedicated direct case |
// | 91 | keyHostErrors: API keys stay on their pinned hosts | no dedicated direct case |
// | 106 | top-level: generated (${data.generated}) is older than the newest last_verified/added (${newest}) — bump it in data/providers.json | existing case |
// | 112 | ${id}: slug must be kebab-case | no dedicated direct case |
// | 113 | ${id}: duplicate slug | no dedicated direct case |
// | 115 | ${id}: duplicate name | new isolated case |
// | 118 | ${id}: name required | no dedicated direct case |
// | 120 | ${id}: playground_url requires a non-empty docs_url | existing case |
// | 124 | ${id}: ${field} must not contain control, bidirectional or zero-width characters | new isolated case |
// | 126 | ${id}: category must be one of ${CATEGORIES.join('/')} | no dedicated direct case |
// | 127 | ${id}: free_type must be one of ${FREE_TYPES.join('/')} | no dedicated direct case |
// | 128 | ${id}: free_tier required | no dedicated direct case |
// | 129 | ${id}: verified must be boolean | no dedicated direct case |
// | 132 | ${id}: ${f} must be true/false/null | no dedicated direct case |
// | 134 | ${id}: commercial_ok must be true/false/null or "conditional" | no dedicated direct case |
// | 136 | ${id}: commercial_ok is conditional, so commercial_ok_condition is required | no dedicated direct case |
// | 138 | ${id}: commercial_ok_condition only allowed when commercial_ok is "conditional" | no dedicated direct case |
// | 142 | ${id}: unknown modality "${m}" | no dedicated direct case |
// | 145 | ${id}: models_free must be an array of strings or null | no dedicated direct case |
// | 148 | ${id}: models_free must not contain control, bidirectional or zero-width characters | new isolated case |
// | 153 | ${id}: models_url must be the provider's public HTTPS model catalogue | new isolated case |
// | 162 | ${id}: free_type "${p.free_type}" belongs in category "${expected}" (got "${p.category}") | existing case |
// | 169 | ${id}: rate_limits must give a limit with a unit, or say the provider publishes none (got: "${String(p.rate_limits).slice(0, 60)}") | existing case |
// | 173 | ${id}: openai_base_url must be an http(s) URL or null | no dedicated direct case |
// | 174 | ${id}: openai_base_url must not contain control, bidirectional or zero-width characters | no dedicated direct case |
// | 175 | ${id}: openai_base_url is set but openai_compatible is false | existing case |
// | 180 | ${id}: env_key must be an UPPER_SNAKE env var name | new isolated case |
// | 184 | ${id}: added must be YYYY-MM-DD | no dedicated direct case |
// | 188 | ${id}: last_probed must be YYYY-MM-DD or null | no dedicated direct case |
// | 191 | ${id}: invalid probe_status | no dedicated direct case |
// | 192 | ${id}: probe_status set but last_probed missing | existing case |
// | 198 | ${id}: is_text_llm must be true or false on every entry | no dedicated direct case |
// | 201 | ${id}: model_tier and model_tier_source go together (both set or both null) | no dedicated direct case |
// | 203 | ${id}: model_tier ${tier} does not match the cited rating ${src.rating} (expected ${tierForRating(src.rating)}) | existing case |
// | 204 | ${id}: the rated row needs at least ${MODEL_TIER_MIN_VOTES} votes | no dedicated direct case |
// | 205 | ${id}: model_tier_source.ci must be [lower, upper] around the rating | existing case |
// | 206 | ${id}: model_tier_source.boundary must be ${nearBoundary(src.ci)} for ci ${JSON.stringify(src.ci)} (crosses or is within 5 points of a threshold) | existing case |
// | 207 | ${id}: model_tier only applies to a text-LLM offer | existing case |
// | 208 | ${id}: a one-time trial credit is not continuous free access, so it carries no model_tier | existing case |
// | 209 | ${id}: model_tier_source.snapshot must be a date not after the dataset's generated date | existing case |
// | 212 | ${id}: a one-time trial credit is not continuous free access, so it carries no free_limits | existing case |
// | 213 | ${id}: free_limits.checked must be a date not after the dataset's generated date | existing case |
// | 214 | ${id}: free_limits.source must be the provider's page (http/https) | no dedicated direct case |
// | 220 | ${id}: data_policy must state trains_on_prompts or retention (an all-null policy records nothing) | existing case |
// | 221 | ${id}: data_policy.checked must be a date not after the dataset's generated date | existing case |
// | 222 | ${id}: data_policy.source must be the provider's public HTTPS page | new isolated case |
// | 226 | ${id}: data_policy.${k} must be text of 1 to ${max} characters | no dedicated direct case |
// | 227 | ${id}: data_policy.${k} must not contain control, bidirectional or zero-width characters | existing case |
// | 229 | ${id}: a data_policy sentence goes with a stated part | existing case |
// | 231 | ${id}: data_policy.plan_named must be true, false or null | no dedicated direct case |
// | 236 | ${id}: no_expiry applies only to a one-time trial credit (on a continuous free tier a null expires already means no end) | existing case |
// | 237 | ${id}: no_expiry and a non-null expires contradict each other | existing case |
// | 238 | ${id}: no_expiry.checked must be a date not after the dataset's generated date | existing case |
// | 239 | ${id}: no_expiry.source must be the provider's page (http/https) | no dedicated direct case |
// | 240 | ${id}: no_expiry.quote must be the passage, 1 to 300 characters | no dedicated direct case |
// | 245 | ${id}: verified entry needs a YYYY-MM-DD last_verified | no dedicated direct case |
// | 246 | ${id}: verified entry needs a public HTTPS docs_url (primary source) | new isolated case |
// | 248 | ${id}: unverified entry must have last_verified: null | existing case |
// | 264 | programs.json: "${group}" must be a non-empty array | no dedicated direct case |
// | 268 | programs/${id}: name, what and who are required | no dedicated direct case |
// | 269 | programs/${id}: url must be http(s) | no dedicated direct case |
// | 270 | programs/${id}: funds must be yes/partial/no | no dedicated direct case |
// | 271 | programs/${id}: research entries need an audience | no dedicated direct case |
// | 274 | programs.json read/parse failure | no dedicated direct case |
// | 286 | gpu-compute.json: ${e.instancePath \|\| '/'} ${e.message} | no dedicated direct case |
// | 287 | gpuComputeErrors: GPU offer consistency | no dedicated direct case |
// | 289 | gpu-compute.json read/parse failure | no dedicated direct case |
// | 305 | ${file}: ${e.instancePath \|\| '/'} ${e.message} | no dedicated direct case |
// | 306 | codingToolsErrors: coding-tool offer consistency | no dedicated direct case |
// | 307 | ${file}: the slug ${e.slug} is in both coding-tools files | no dedicated direct case |
// | 309 | coding-tools.json read/parse failure | no dedicated direct case |
// | 316 | quoteErrors: policy passages match the quote register | no dedicated direct case |
// | 317 | quotes.json read/parse failure | no dedicated direct case |
// | 321 | reportErrors: optional quotes report matches the register | no dedicated direct case |
// | 322 | quotes-report.json read/parse failure | no dedicated direct case |
// | 334 | bestPickErrors: editorial picks are current, verified providers | no dedicated direct case |
// | 336 | best.json read/parse failure | no dedicated direct case |
// | 351 | probe-report: probed_at must be YYYY-MM-DD | existing case |
// | 352 | probe-report: results must be an array | existing case |
// | 354 | probe-report: "${r.slug}" is not a current provider (stale entry) | existing case |
// | 355 | probe-report: duplicate slug "${r.slug}" | existing case |
// | 358 | probe-report: count (${report.count}) must equal results.length (${(report.results ?? []).length}) | existing case |
// | 359 | probe-report.json read/parse failure | no dedicated direct case |
// | 370 | figureErrors: prose provider counts agree with the dataset | no dedicated direct case |
// | 375 | editorialErrors: editorial rating consistency | no dedicated direct case |
// | 376 | editorial.json read/parse failure | no dedicated direct case |
// | 381 | summaryErrors: dated, provider-owned summary sources | no dedicated direct case |
// | 382 | provider-summaries.json read/parse failure | no dedicated direct case |
// | 388 | agreementsErrors: sponsorship disclosure consistency | no dedicated direct case |
// | 389 | sponsorships.json read/parse failure | no dedicated direct case |

// Each row names the rule in validate.mjs and the bad claim or inconsistent
// state it protects. The runner below mutates only that part of a fixture and
// asserts on the message validate prints.
const RULE_CASES = [
  ['generated is a UTC day, never in the future', 'a contributor date ahead of UTC', (d) => { d.generated = '2999-01-01'; }, 'top-level: generated (2999-01-01) is after today in UTC', { VALIDATE_TODAY: '2000-01-02' }],
  ['generated covers the newest last_verified/added', 'generated date older than the data it describes', (d) => { d.generated = '2000-01-01'; }, 'top-level: generated (2000-01-01) is older than the newest last_verified/added'],
  ['category follows free_type', 'a one-time credit listed as an ongoing free tier', (d) => { trialProvider(d).category = 'ongoing'; }, 'belongs in category "trial" (got "ongoing")'],
  ['rate_limits gives a limit unit or says none is published', 'a model list in the rate-limits field', (d) => { provider(d).rate_limits = 'Various open-weight models'; }, 'rate_limits must give a limit with a unit'],
  ['openai_base_url requires openai_compatible', 'an OpenAI endpoint on a provider marked incompatible', (d) => { provider(d).openai_compatible = false; }, 'openai_base_url is set but openai_compatible is false'],
  ['probe_status requires last_probed', 'a probe result with no probe date', (d) => { provider(d).probe_status = 'live'; provider(d).last_probed = null; }, 'probe_status set but last_probed missing'],
  ['model_tier and model_tier_source go together', 'a typed tier with no cited source', (d) => { provider(d).model_tier_source = null; }, 'model_tier_source must be object'],
  ['model_tier matches the cited rating', 'a tier that does not match its source rating', (d) => { const p = provider(d); p.model_tier = (p.model_tier + 1) % 5; }, 'does not match the cited rating'],
  ['model_tier_source has the minimum votes', 'a leaderboard rating below the vote floor', (d) => { provider(d).model_tier_source.votes = 1; }, 'model_tier_source/votes must be >= 1000'],
  ['model_tier_source.ci surrounds the rating', 'a confidence interval that excludes the rating', (d) => { const src = provider(d).model_tier_source; src.ci = [src.rating + 1, src.rating + 2]; }, 'model_tier_source.ci must be [lower, upper] around the rating'],
  ['model_tier_source.boundary matches the interval', 'a boundary flag that contradicts the interval', (d) => { provider(d).model_tier_source.boundary = !provider(d).model_tier_source.boundary; }, 'model_tier_source.boundary must be'],
  ['model_tier applies only to text LLMs', 'a ranked tier on a non-text offer', (d) => { provider(d).is_text_llm = false; }, 'model_tier only applies to a text-LLM offer'],
  ['model_tier does not apply to trial credit', 'a ranked tier on a one-time credit', (d) => { const p = trialProvider(d); p.model_tier = provider(d).model_tier; p.model_tier_source = provider(d).model_tier_source; }, 'a one-time trial credit is not continuous free access, so it carries no model_tier'],
  ['model_tier_source.snapshot is not after generated', 'a source snapshot newer than the dataset', (d) => { provider(d).model_tier_source.snapshot = '2999-01-01'; }, 'model_tier_source.snapshot must be a date not after the dataset'],
  ['free_limits does not apply to trial credit', 'published recurring limits on a one-time credit', (d) => { trialProvider(d).free_limits = { requests_per_day: 100, source: 'https://example.com/limits', checked: '2026-10-01' }; }, 'a one-time trial credit is not continuous free access, so it carries no free_limits'],
  ['free_limits.checked is not after generated', 'free-limit numbers checked after the dataset date', (d) => { provider(d).free_limits = { requests_per_day: 100, source: 'https://example.com/limits', checked: '2999-01-01' }; }, 'free_limits.checked must be a date not after the dataset'],
  ['data_policy states training or retention', 'a policy row that records no policy', (d) => { provider(d).data_policy.trains_on_prompts = null; provider(d).data_policy.retention = null; provider(d).data_policy.quote = null; }, 'data_policy must state trains_on_prompts or retention'],
  ['data_policy.checked is not after generated', 'a policy checked after the dataset date', (d) => { provider(d).data_policy.checked = '2999-01-01'; }, 'data_policy.checked must be a date not after the dataset'],
  ['data_policy text has no hidden characters', 'a copied policy sentence with a zero-width character', (d) => { provider(d).data_policy.quote = 'Prompts are not retained\u200b.'; }, 'must not contain control, bidirectional or zero-width characters'],
  ['data_policy quote goes with a stated part', 'a quote that does not say what it supports', (d) => { const p = provider(d); p.data_policy.quote = 'A policy sentence.'; p.data_policy.trains_on_prompts = null; p.data_policy.retention = null; }, 'a data_policy sentence goes with a stated part'],
  ['no_expiry applies only to trial credit', 'a no-expiry statement on an ongoing tier', (d) => { provider(d).no_expiry = { source: 'https://example.com/terms', checked: '2026-10-01', quote: 'Credits do not expire.' }; }, 'no_expiry applies only to a one-time trial credit'],
  ['no_expiry and expires do not contradict', 'a no-expiry statement beside an expiry date', (d) => { const p = trialProvider(d); p.expires = '2027-01-01'; p.no_expiry = { source: 'https://example.com/terms', checked: '2026-10-01', quote: 'Credits do not expire.' }; }, 'no_expiry and a non-null expires contradict each other'],
  ['no_expiry.checked is not after generated', 'a no-expiry source checked after the dataset date', (d) => { trialProvider(d).no_expiry = { source: 'https://example.com/terms', checked: '2999-01-01', quote: 'Credits do not expire.' }; }, 'no_expiry.checked must be a date not after the dataset'],
  ['verified entries have last_verified', 'a verified claim with no verification date', (d) => { provider(d).verified = true; provider(d).last_verified = null; }, 'last_verified must be string'],
  ['unverified entries have no last_verified', 'a stale verification date on an unverified row', (d) => { const p = provider(d); p.verified = false; p.last_verified = '2026-10-01'; }, 'unverified entry must have last_verified: null'],
];

// Additional rule | protects | minimal mutation | exact diagnostic.
// These fixtures pass JSON Schema first and must produce exactly one integrity
// error. Removing the named check therefore makes its case fail, even when a
// different gate could reject the same input for another reason.
const INTEGRITY_CASES = [
  ['duplicate name', 'distinct provider identities', (p, d) => { p.name = d.providers.find((row) => row.slug !== p.slug).name; }, 'duplicate name'],
  ['name hidden characters', 'visible provider labels', (p) => { p.name += '\u200b'; }, 'name must not contain control, bidirectional or zero-width characters'],
  ['docs_url hidden characters', 'unambiguous source links', (p) => { p.verified = false; p.last_verified = null; p.docs_url += '\u200b'; }, 'docs_url must not contain control, bidirectional or zero-width characters'],
  ['models_free hidden characters', 'copyable model identifiers', (p) => { p.models_free = ['example-model\u200b']; }, 'models_free must not contain control, bidirectional or zero-width characters'],
  ['env_key syntax', 'usable environment variable names', (p) => { p.openai_base_url = null; p.env_key = 'api-key'; }, 'env_key must be an UPPER_SNAKE env var name'],
  ['models_url public HTTPS', 'public model catalogues', (p) => { p.models_url = 'https://127.0.0.1/models'; }, "models_url must be the provider's public HTTPS model catalogue"],
  ['data_policy.source public HTTPS', 'public policy evidence', (p) => { p.data_policy.source = 'https://127.0.0.1/policy'; }, "data_policy.source must be the provider's public HTTPS page"],
  ['verified docs_url public HTTPS', 'public primary verification sources', (p) => { p.docs_url = p.docs_url.replace(/^https:/, 'http:'); }, 'verified entry needs a public HTTPS docs_url (primary source)'],
];

for (const [rule, protects, mutate, diagnostic] of INTEGRITY_CASES) {
  test(`validate integrity: ${rule} (${protects})`, () => {
    const data = structuredClone(DATA);
    // Mutate a later row so a duplicate name is reported on this row.
    const p = provider({ providers: [...data.providers].reverse() });
    assert.ok(p, 'dataset needs a verified, ranked text provider with policy evidence');
    mutate(p, data);
    const result = runValidate(data);
    assert.equal(result.status, 1, result.output);
    assert.deepEqual(result.output.trim().split(/\r?\n/).map((line) => line.trim()), [
      '✗ validation failed (1 issue):',
      `- ${p.slug}: ${diagnostic}`,
    ]);
  });
}

const REPORT_CASES = [
  ['probe-report.probed_at is a date', 'an unreadable probe-report date', (r) => { r.probed_at = 'today'; }, 'probe-report: probed_at must be YYYY-MM-DD'],
  ['probe-report.results is an array', 'a probe report whose results are not a list', (r) => { r.results = {}; }, 'probe-report: results must be an array'],
  ['probe-report slugs are current providers', 'a stale provider left in the probe report', (r) => { r.results = [{ slug: 'retired-provider' }]; r.count = 1; }, 'probe-report: "retired-provider" is not a current provider'],
  ['probe-report slugs are unique', 'a duplicate provider in the probe report', (r) => { const slug = r.results[0].slug; r.results = [{ slug }, { slug }]; r.count = 2; }, (r) => `probe-report: duplicate slug "${r.results[0].slug}"`],
  ['probe-report.count equals results.length', 'a count that disagrees with the report rows', (r) => { r.count = r.results.length + 1; }, 'probe-report: count'],
];

function provider(data) {
  return data.providers.find((p) =>
    p.openai_base_url &&
    p.openai_compatible === true &&
    p.is_text_llm === true &&
    typeof p.model_tier === 'number' &&
    p.model_tier_source &&
    p.data_policy &&
    p.verified === true
  );
}

function trialProvider(data) {
  return data.providers.find((p) => p.free_type === 'trial-credit');
}

function fixtureFiles(data, report) {
  const dir = makeTmpDir('flah-validate-rules-');
  const providersFile = join(dir, 'providers.json');
  const reportFile = join(dir, 'probe-report.json');
  writeFileSync(providersFile, JSON.stringify(data));
  writeFileSync(reportFile, JSON.stringify(report));
  return [providersFile, reportFile];
}

function validReport(data) {
  return {
    probed_at: data.generated,
    count: data.providers.length,
    results: data.providers.map((p) => ({ slug: p.slug })),
  };
}

function runValidate(data, report = validReport(data), env = {}) {
  const [providersFile, reportFile] = fixtureFiles(data, report);
  const result = spawnSync(process.execPath, [VALIDATE, providersFile, reportFile], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, VALIDATE_TODAY: data.generated, ...env },
  });
  return { ...result, output: `${result.stdout}${result.stderr}` };
}

for (const [rule, protects, mutate, message, env] of RULE_CASES) {
  test(`validate rule: ${rule} (${protects})`, () => {
    const data = structuredClone(DATA);
    mutate(data);
    const result = runValidate(data, validReport(data), env);
    assert.notEqual(result.status, 0, result.output);
    assert.match(result.output, new RegExp(escapeRegExp(message)));
  });
}

for (const [rule, protects, mutate, message] of REPORT_CASES) {
  test(`validate rule: ${rule} (${protects})`, () => {
    const data = structuredClone(DATA);
    const report = validReport(data);
    mutate(report);
    const result = runValidate(data, report);
    assert.notEqual(result.status, 0, result.output);
    const expected = typeof message === 'function' ? message(report) : message;
    assert.match(result.output, new RegExp(escapeRegExp(expected)));
  });
}

test('playground_url accepts HTTPS and remains optional', () => {
  const data = structuredClone(DATA);
  const p = provider(data);
  p.playground_url = 'https://example.com/playground?model=a&mode=b';
  const present = runValidate(data);
  assert.equal(present.status, 0, present.output);
  delete p.playground_url;
  const absent = runValidate(data);
  assert.equal(absent.status, 0, absent.output);
});

test('playground_url rejects invalid present values', () => {
  for (const value of ['http://example.com/playground', 'ftp://example.com/playground', 'javascript:alert(1)', '/playground', '', 'not a URI', null, 7, {}]) {
    const data = structuredClone(DATA);
    const p = provider(data);
    p.playground_url = value;
    const result = runValidate(data);
    assert.notEqual(result.status, 0, `${JSON.stringify(value)}: ${result.output}`);
    assert.ok(result.output.includes(`/providers/${data.providers.indexOf(p)}/playground_url`), result.output);
  }
});

test('playground_url requires non-empty docs_url on unverified rows', () => {
  const data = structuredClone(DATA);
  // Its API and summary sources share a domain, keeping empty-doc controls
  // independent of the existing provider-summary ownership rule.
  const p = data.providers.find((row) => row.slug === 'groq');
  p.verified = false;
  p.last_verified = null;
  p.playground_url = 'https://example.com/playground';
  const accepted = runValidate(data);
  assert.equal(accepted.status, 0, accepted.output);

  for (const docs of ['', '   ']) {
    const invalid = structuredClone(data);
    invalid.providers.find((row) => row.slug === p.slug).docs_url = docs;
    const rejected = runValidate(invalid);
    assert.notEqual(rejected.status, 0, rejected.output);
    assert.ok(rejected.output.includes(`${p.slug}: playground_url requires a non-empty docs_url`), rejected.output);
  }

  const missing = structuredClone(data);
  delete missing.providers.find((row) => row.slug === p.slug).docs_url;
  const rejectedMissing = runValidate(missing);
  assert.notEqual(rejectedMissing.status, 0, rejectedMissing.output);
  assert.ok(rejectedMissing.output.includes(`/providers/${data.providers.indexOf(p)}/docs_url must have required property 'docs_url'`), rejectedMissing.output);

  delete p.playground_url;
  p.docs_url = '';
  const noPlayground = runValidate(data);
  assert.equal(noPlayground.status, 0, noPlayground.output);
});

test('the fixture harness leaves a valid fixture valid', () => {
  const data = structuredClone(DATA);
  const result = runValidate(data);
  assert.equal(result.status, 0, result.output);
});

test('validate accepts conditional commercial use only with a non-empty condition', () => {
  const valid = structuredClone(DATA);
  const conditional = provider(valid);
  conditional.commercial_ok = 'conditional';
  conditional.commercial_ok_condition = 'Only models whose licences permit commercial use.';
  const accepted = runValidate(valid);
  assert.equal(accepted.status, 0, accepted.output);

  const missing = structuredClone(valid);
  delete provider(missing).commercial_ok_condition;
  const rejectedMissing = runValidate(missing);
  assert.notEqual(rejectedMissing.status, 0, rejectedMissing.output);
  assert.match(rejectedMissing.output, /commercial_ok_condition/);

  const misplaced = structuredClone(DATA);
  provider(misplaced).commercial_ok_condition = 'This must not accompany true.';
  const rejectedMisplaced = runValidate(misplaced);
  assert.notEqual(rejectedMisplaced.status, 0, rejectedMisplaced.output);
  assert.match(rejectedMisplaced.output, /commercial_ok_condition/);
});

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
