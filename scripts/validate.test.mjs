import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTmpDir } from './lib/tmp.mjs';
import { linkDir } from './lib/private-tree.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DATA = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8'));
const VALIDATE = join(ROOT, 'scripts/validate.mjs');

// Check/error-site inventory at main 1ec1562 (source line | diagnostic/protection | evidence).
// Counting method: every check(...) and errors.push(...) call in validate.mjs, by
// source line; a helper spread (errors.push(...helper())) is one site, and the
// shared hidden-character loop is one site. Not loop iterations, not rules inside
// imported helpers (those have their own unit tests). Not a coverage percentage.
// Evidence:
// - "direct case": a fixture below reaches that line and asserts its diagnostic
//   (RULE_CASES, INTEGRITY_CASES, REPORT_CASES, REPOSITORY_CASES, UNREADABLE_CASES
//   or a named test).
// - "schema-gated": data/schema.json rejects every input this line would reject, and
//   validate exits after Ajv, so the line cannot be reached through the CLI. The
//   SCHEMA_GATED_CASES row proves the schema gate names the field; that is not
//   evidence for the hand-written line itself.
// - "redundant": the same input always also fails another line, so it cannot be isolated.
// 97 sites total: 74 direct cases; 22 schema-gated; 1 redundant;
// 0 without a dedicated direct case.
// | validate.mjs line | Diagnostic or delegated protection | Evidence |
// | --- | --- | --- |
// | 83 | top-level: version must be semver | schema-gated |
// | 84 | top-level: generated must be YYYY-MM-DD | schema-gated |
// | 91 | top-level: generated (${data.generated}) is after today in UTC (${todayUtc}) | direct case |
// | 93 | top-level: providers must be a non-empty array | schema-gated |
// | 95 | keyHostErrors: API keys stay on their pinned hosts | direct case |
// | — | (retired) generated older than the newest last_verified/added: `generated` is the release stamp now, see check-release-stamp.mjs | release-stamp.test.mjs |
// | 100 | ${id}: slug must be kebab-case | schema-gated |
// | 101 | ${id}: duplicate slug | direct case |
// | 103 | ${id}: duplicate name | direct case |
// | 106 | ${id}: name required | schema-gated |
// | 108 | ${id}: playground_url requires a non-empty docs_url | direct case |
// | 110 (added after 1ec1562; later rows shift by one) | ${id}: keys_url and keys_url_source go together and require a non-empty docs_url | direct case |
// | 112 | ${id}: ${field} must not contain control, bidirectional or zero-width characters | direct case |
// | 114 | ${id}: category must be one of ${CATEGORIES.join('/')} | schema-gated |
// | 115 | ${id}: free_type must be one of ${FREE_TYPES.join('/')} | schema-gated |
// | 116 | ${id}: free_tier required | schema-gated |
// | 117 | ${id}: verified must be boolean | schema-gated |
// | 120 | ${id}: ${f} must be true/false/null | schema-gated |
// | 122 | ${id}: commercial_ok must be true/false/null or "conditional" | schema-gated |
// | 124 | ${id}: commercial_ok is conditional, so commercial_ok_condition is required | schema-gated |
// | 126 | ${id}: commercial_ok_condition only allowed when commercial_ok is "conditional" | schema-gated |
// | 130 | ${id}: unknown modality "${m}" | schema-gated |
// | 133 | ${id}: models_free must be an array of strings or null | schema-gated |
// | 136 | ${id}: models_free must not contain control, bidirectional or zero-width characters | direct case |
// | 141 | ${id}: models_url must be the provider's public HTTPS model catalogue | direct case |
// | 150 | ${id}: free_type "${p.free_type}" belongs in category "${expected}" (got "${p.category}") | direct case |
// | 157 | ${id}: rate_limits must give a limit with a unit, or say the provider publishes none | direct case |
// | 161 | ${id}: openai_base_url must be an http(s) URL or null | direct case |
// | 162 | ${id}: openai_base_url must not contain control, bidirectional or zero-width characters | redundant: line 112 also checks openai_base_url, so the message prints twice |
// | 163 | ${id}: openai_base_url is set but openai_compatible is false | direct case |
// | 168 | ${id}: env_key must be an UPPER_SNAKE env var name | direct case |
// | 172 | ${id}: added must be YYYY-MM-DD | schema-gated |
// | 173 | ${id}: added (${p.added}) is after today in UTC (${todayUtc}) | direct case |
// | 177 | ${id}: last_probed must be YYYY-MM-DD or null | direct case |
// | 180 | ${id}: invalid probe_status | schema-gated |
// | 181 | ${id}: probe_status set but last_probed missing | direct case |
// | 187 | ${id}: is_text_llm must be true or false on every entry | schema-gated |
// | 190 | ${id}: model_tier and model_tier_source go together (both set or both null) | schema-gated |
// | 192 | ${id}: model_tier ${tier} does not match the cited rating ${src.rating} | direct case |
// | 193 | ${id}: the rated row needs at least ${MODEL_TIER_MIN_VOTES} votes | schema-gated |
// | 194 | ${id}: model_tier_source.ci must be [lower, upper] around the rating | direct case |
// | 195 | ${id}: model_tier_source.boundary must be ${nearBoundary(src.ci)} for ci ... | direct case |
// | 196 | ${id}: model_tier only applies to a text-LLM offer | direct case |
// | 197 | ${id}: a one-time trial credit is not continuous free access, so it carries no model_tier | direct case |
// | 198 | ${id}: model_tier_source.snapshot must be a date not after today in UTC | direct case |
// | 201 | ${id}: a one-time trial credit is not continuous free access, so it carries no free_limits | direct case |
// | 202 | ${id}: free_limits.checked must be a date not after today in UTC | direct case |
// | 203 | ${id}: free_limits.source must be the provider's page (http/https) | new isolated case |
// | 209 | ${id}: data_policy must state trains_on_prompts or retention | direct case |
// | 210 | ${id}: data_policy.checked must be a date not after today in UTC | direct case |
// | 211 | ${id}: data_policy.source must be the provider's public HTTPS page | direct case |
// | 215 | ${id}: data_policy.${k} must be text of 1 to ${max} characters | direct case |
// | 216 | ${id}: data_policy.${k} must not contain control, bidirectional or zero-width characters | direct case |
// | 218 | ${id}: a data_policy sentence goes with a stated part | direct case |
// | 220 | ${id}: data_policy.plan_named must be true, false or null | schema-gated |
// | 224 | fieldCheckErrors: field_checks pair with their flag (its rules: field-checks.test.mjs) | direct case |
// | 227 | publishedSpeedErrors: provider-published speed figures (its rules: published-speed.test.mjs) | direct case |
// | 231 | ${id}: no_expiry applies only to a one-time trial credit | direct case |
// | 232 | ${id}: no_expiry and a non-null expires contradict each other | direct case |
// | 233 | ${id}: no_expiry.checked must be a date not after today in UTC | direct case |
// | 234 | ${id}: no_expiry.source must be the provider's page (http/https) | direct case |
// | 235 | ${id}: no_expiry.quote must be the passage, 1 to 300 characters | direct case |
// | 240 | ${id}: verified entry needs a YYYY-MM-DD last_verified | schema-gated |
// | 241 | ${id}: last_verified (${p.last_verified}) is after today in UTC (${todayUtc}) | direct case |
// | 242 | ${id}: verified entry needs a public HTTPS docs_url (primary source) | direct case |
// | 244 | ${id}: unverified entry must have last_verified: null | direct case |
// | 246 | ${id}: docs_url must be empty or an https:// URL | direct case |
// | 262 | programs.json: "${group}" must be a non-empty array | direct case |
// | 266 | programs/${id}: name, what and who are required | direct case |
// | 267 | programs/${id}: url must be http(s) | direct case |
// | 268 | programs/${id}: funds must be yes/partial/no | direct case |
// | 269 | programs/${id}: research entries need an audience | direct case |
// | 272 | programs.json read/parse failure | direct case |
// | 284 | gpu-compute.json: ${e.instancePath \|\| '/'} ${e.message} | direct case |
// | 285 | gpuComputeErrors: GPU offer consistency | direct case |
// | 287 | gpu-compute.json read/parse failure | direct case |
// | 303 | ${file}: ${e.instancePath \|\| '/'} ${e.message} | direct case |
// | 304 | codingToolsErrors: coding-tool offer consistency | direct case |
// | 305 | ${file}: the slug ${e.slug} is in both coding-tools files | direct case |
// | 307 | coding-tools.json read/parse failure | direct case |
// | 314 | quoteErrors: policy passages match the quote register | direct case |
// | 315 | quotes.json read/parse failure | direct case |
// | 319 | reportErrors: optional quotes report matches the register | direct case |
// | 320 | quotes-report.json read/parse failure | direct case |
// | 332 | bestPickErrors: editorial picks are current, verified providers | direct case |
// | 334 | best.json read/parse failure | direct case |
// | 350 | probe-report: probed_at must be YYYY-MM-DD | direct case |
// | 351 | probe-report: results must be an array | direct case |
// | 353 | probe-report: "${r.slug}" is not a current provider (stale entry) | direct case |
// | 354 | probe-report: duplicate slug "${r.slug}" | direct case |
// | 357 | probe-report: count (${report.count}) must equal results.length | direct case |
// | 358 | probe-report.json read/parse failure | direct case |
// | 369 | figureErrors: prose provider counts agree with the dataset | direct case |
// | 374 | editorialErrors: editorial rating consistency | direct case |
// | 375 | editorial.json read/parse failure | direct case |
// | 380 | summaryErrors: dated, provider-owned summary sources | direct case |
// | 381 | provider-summaries.json read/parse failure | direct case |
// | 387 | agreementsErrors: sponsorship disclosure consistency | direct case |
// | 388 | sponsorships.json read/parse failure | direct case |

// Each row names the rule in validate.mjs and the bad claim or inconsistent
// state it protects. The runner below mutates only that part of a fixture and
// asserts on the message validate prints.
const RULE_CASES = [
  ['generated is a UTC day, never in the future', 'a contributor date ahead of UTC', (d) => { d.generated = '2999-01-01'; }, 'top-level: generated (2999-01-01) is after today in UTC', { VALIDATE_TODAY: '2000-01-02' }],
  ['last_verified is a UTC day, never in the future', 'a verification dated after today', (d) => { const p = provider(d); p.verified = true; p.last_verified = '2999-01-01'; }, 'last_verified (2999-01-01) is after today in UTC'],
  ['added is a UTC day, never in the future', 'an entry added after today', (d) => { provider(d).added = '2999-01-01'; }, 'added (2999-01-01) is after today in UTC'],
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
  ['model_tier_source.snapshot is not after today', 'a source snapshot newer than the dataset', (d) => { provider(d).model_tier_source.snapshot = '2999-01-01'; }, 'model_tier_source.snapshot must be a date not after today in UTC'],
  ['free_limits does not apply to trial credit', 'published recurring limits on a one-time credit', (d) => { trialProvider(d).free_limits = { requests_per_day: 100, source: 'https://example.com/limits', checked: '2026-10-01' }; }, 'a one-time trial credit is not continuous free access, so it carries no free_limits'],
  ['free_limits.checked is not after today', 'free-limit numbers checked after the dataset date', (d) => { provider(d).free_limits = { requests_per_day: 100, source: 'https://example.com/limits', checked: '2999-01-01' }; }, 'free_limits.checked must be a date not after today in UTC'],
  ['data_policy states training or retention', 'a policy row that records no policy', (d) => { provider(d).data_policy.trains_on_prompts = null; provider(d).data_policy.retention = null; provider(d).data_policy.quote = null; }, 'data_policy must state trains_on_prompts or retention'],
  ['data_policy.checked is not after today', 'a policy checked after the dataset date', (d) => { provider(d).data_policy.checked = '2999-01-01'; }, 'data_policy.checked must be a date not after today in UTC'],
  ['data_policy text has no hidden characters', 'a copied policy sentence with a zero-width character', (d) => { provider(d).data_policy.quote = 'Prompts are not retained\u200b.'; }, 'must not contain control, bidirectional or zero-width characters'],
  ['data_policy quote goes with a stated part', 'a quote that does not say what it supports', (d) => { const p = provider(d); p.data_policy.quote = 'A policy sentence.'; p.data_policy.trains_on_prompts = null; p.data_policy.retention = null; }, 'a data_policy sentence goes with a stated part'],
  ['no_expiry applies only to trial credit', 'a no-expiry statement on an ongoing tier', (d) => { provider(d).no_expiry = { source: 'https://example.com/terms', checked: '2026-10-01', quote: 'Credits do not expire.' }; }, 'no_expiry applies only to a one-time trial credit'],
  ['no_expiry and expires do not contradict', 'a no-expiry statement beside an expiry date', (d) => { const p = trialProvider(d); p.expires = '2027-01-01'; p.no_expiry = { source: 'https://example.com/terms', checked: '2026-10-01', quote: 'Credits do not expire.' }; }, 'no_expiry and a non-null expires contradict each other'],
  ['no_expiry.checked is not after today', 'a no-expiry source checked after the dataset date', (d) => { trialProvider(d).no_expiry = { source: 'https://example.com/terms', checked: '2999-01-01', quote: 'Credits do not expire.' }; }, 'no_expiry.checked must be a date not after today in UTC'],
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
  ['unverified docs_url scheme', 'links generated from unverified rows', (p) => { p.verified = false; p.last_verified = null; p.docs_url = p.docs_url.replace(/^https:/, 'http:'); }, 'docs_url must be empty or an https:// URL'],
  ['verified docs_url public HTTPS', 'public primary verification sources', (p) => { p.docs_url = p.docs_url.replace(/^https:/, 'http:'); }, 'verified entry needs a public HTTPS docs_url (primary source)'],
  ['duplicate slug', 'one stable identifier per provider', (p, d) => { d.providers.push({ ...structuredClone(p), name: `${p.name} (copy)` }); }, 'duplicate slug'],
  // Without env_key the key-host pin has nothing to check, so only the scheme rule sees the URL.
  ['openai_base_url scheme', 'client configs that point at an http(s) endpoint', (p) => { delete p.env_key; p.openai_base_url = 'ftp://example.com/v1'; }, 'openai_base_url must be an http(s) URL or null'],
  ['last_probed date', 'a readable live-probe date', (p) => { p.last_probed = 'yesterday'; }, 'last_probed must be YYYY-MM-DD or null'],
  // The schema's minLength accepts whitespace; only the trimmed-length rule rejects it.
  ['data_policy.quote text', 'a recorded policy sentence that says something', (p) => { p.data_policy.quote = '   '; }, 'data_policy.quote must be text of 1 to 400 characters'],
  ['data_policy.note text', 'a recorded policy condition that says something', (p) => { p.data_policy.note = '   '; }, 'data_policy.note must be text of 1 to 300 characters'],
  ['field_checks via fieldCheckErrors', 'a stated check on a flag that holds no value', (p) => { p.phone_required = null; p.field_checks = { ...p.field_checks, phone_required: { status: 'stated', checked: '2026-11-24', sources: ['https://example.com/terms'], quote: null, note: 'The terms say nothing either way.' } }; }, 'field_checks.phone_required: phone_required is null, so its check cannot be stated (use source_silent, needs_account or sources_disagree)'],
  ['published_speed via publishedSpeedErrors', 'a speed figure the cited passage does not contain', (p) => { p.published_speed[0].value = 123456; }, 'published_speed[0].quote must contain the figure 123456 as the page writes it (no rounding, no conversion)', (d) => d.providers.find((row) => row.published_speed?.length)],
  ['free_limits.source http(s)', "numbers traceable to the provider's page", (p) => { p.free_limits.source = 'ftp://example.com/limits'; }, "free_limits.source must be the provider's page (http/https)", (d) => d.providers.find((row) => row.free_limits)],
  ['no_expiry.source http(s)', "a no-expiry statement traceable to the provider's page", (p) => { p.expires = null; p.no_expiry = { source: 'ftp://example.com/terms', checked: '2026-10-01', quote: 'Credits do not expire.' }; }, "no_expiry.source must be the provider's page (http/https)", trialProvider],
  // The schema's minLength accepts whitespace; only the trimmed-length rule rejects it.
  ['no_expiry.quote text', 'a no-expiry statement that quotes the passage', (p) => { p.expires = null; p.no_expiry = { source: 'https://example.com/terms', checked: '2026-10-01', quote: '   ' }; }, 'no_expiry.quote must be the passage, 1 to 300 characters', trialProvider],
];

for (const [rule, protects, mutate, diagnostic, pick = provider] of INTEGRITY_CASES) {
  test(`validate integrity: ${rule} (${protects})`, () => {
    const data = structuredClone(DATA);
    // Mutate a later row so a duplicate name is reported on this row.
    const p = pick({ providers: [...data.providers].reverse() });
    assert.ok(p, `dataset needs a provider for the ${rule} case`);
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
  // One row per slug, so a duplicate-slug fixture is not also a duplicate probe-report row.
  const slugs = [...new Set(data.providers.map((p) => p.slug))];
  return {
    probed_at: data.generated,
    count: slugs.length,
    results: slugs.map((slug) => ({ slug })),
  };
}

function runValidate(data, report = validReport(data), env = {}) {
  const [providersFile, reportFile] = fixtureFiles(data, report);
  const result = spawnSync(process.execPath, [VALIDATE, providersFile, reportFile], {
    cwd: ROOT,
    encoding: 'utf8',
    // The real clock by default: every committed date is on or before today, and the cases use far-future dates.
    env: { ...process.env, ...env },
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
  // keys_url has its own docs_url rule (tested below); keep this case about playground_url alone
  delete p.keys_url;
  delete p.keys_url_source;
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

test('keys_url accepts HTTPS with its source and remains optional', () => {
  const data = structuredClone(DATA);
  const p = provider(data);
  p.keys_url = 'https://example.com/keys?tab=api&new=1';
  p.keys_url_source = 'https://example.com/docs/quickstart';
  const present = runValidate(data);
  assert.equal(present.status, 0, present.output);
  delete p.keys_url;
  delete p.keys_url_source;
  const absent = runValidate(data);
  assert.equal(absent.status, 0, absent.output);
});

test('keys_url and keys_url_source reject invalid present values', () => {
  for (const field of ['keys_url', 'keys_url_source']) {
    for (const value of ['http://example.com/keys', 'javascript:alert(1)', '/keys', '', null, 7]) {
      const data = structuredClone(DATA);
      const p = provider(data);
      p.keys_url = 'https://example.com/keys';
      p.keys_url_source = 'https://example.com/docs';
      p[field] = value;
      const result = runValidate(data);
      assert.notEqual(result.status, 0, `${field}=${JSON.stringify(value)}: ${result.output}`);
      assert.ok(result.output.includes(`/providers/${data.providers.indexOf(p)}/${field}`), result.output);
    }
  }
});

test('keys_url needs its source, the source needs keys_url, and both need a non-empty docs_url', () => {
  const message = (p) => `${p.slug}: keys_url and keys_url_source go together and require a non-empty docs_url`;
  for (const only of ['keys_url', 'keys_url_source']) {
    const data = structuredClone(DATA);
    const p = provider(data);
    delete p.keys_url;
    delete p.keys_url_source;
    p[only] = 'https://example.com/keys';
    const rejected = runValidate(data);
    assert.notEqual(rejected.status, 0, rejected.output);
    assert.ok(rejected.output.includes(message(p)), rejected.output);
  }
  const data = structuredClone(DATA);
  const p = data.providers.find((row) => row.slug === 'groq');
  p.verified = false;
  p.last_verified = null;
  p.keys_url = 'https://example.com/keys';
  p.keys_url_source = 'https://example.com/docs';
  p.docs_url = '  ';
  const rejected = runValidate(data);
  assert.notEqual(rejected.status, 0, rejected.output);
  assert.ok(rejected.output.includes(message(p)), rejected.output);
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

test('validate rejects an OpenAI-compatible endpoint outside the API key host pin', () => {
  const data = structuredClone(DATA);
  const p = data.providers.find((row) => row.env_key && row.openai_base_url);
  assert.ok(p, 'dataset needs a provider with a pinned API key and OpenAI-compatible endpoint');
  const pinnedHost = new URL(p.openai_base_url).hostname;

  const valid = runValidate(data);
  assert.equal(valid.status, 0, valid.output);

  p.openai_base_url = 'https://untrusted.example/v1';
  const rejected = runValidate(data);
  assert.equal(rejected.status, 1, rejected.output);
  assert.deepEqual(rejected.output.trim().split(/\r?\n/).map((line) => line.trim()), [
    '✗ validation failed (1 issue):',
    `- ${p.slug}: ${p.env_key} may only be sent to ${pinnedHost}, not untrusted.example`,
  ]);
});

test('validate rule: an unreadable probe report is reported, not thrown', () => {
  const data = structuredClone(DATA);
  const [providersFile, reportFile] = fixtureFiles(data, validReport(data));
  writeFileSync(reportFile, '{');
  const result = spawnSync(process.execPath, [VALIDATE, providersFile, reportFile], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(result.status, 1, `${result.stdout}${result.stderr}`);
  assert.deepEqual(outputLines(`${result.stdout}${result.stderr}`), ['✗ validation failed (1 issue):', `- probe-report.json: ${jsonParseMessage('{')}`]);
});

// Schema-gated sites: data/schema.json rejects these inputs before any hand-written
// check runs, so the hand-written duplicate in validate.mjs cannot be reached
// through the CLI (validate exits after Ajv). These cases prove the gate that does
// fire names the field; they are NOT evidence for the later hand-written line.
// rule | mutation | JSON pointer the schema must name (relative to the provider for per-provider rows).
const SCHEMA_GATED_CASES = [
  ['version semver', (d) => { d.version = 'v2'; }, '/version'],
  ['generated date', (d) => { d.generated = 'today'; }, '/generated'],
  ['providers non-empty', (d) => { d.providers = []; }, '/providers'],
  ['slug kebab-case', (d, p) => { p.slug = 'Not_Kebab'; }, 'slug'],
  ['name required', (d, p) => { p.name = ''; }, 'name'],
  ['category enum', (d, p) => { p.category = 'forever'; }, 'category'],
  ['free_type enum', (d, p) => { p.free_type = 'forever'; }, 'free_type'],
  ['free_tier required', (d, p) => { p.free_tier = ''; }, 'free_tier'],
  ['verified boolean', (d, p) => { p.verified = 'yes'; }, 'verified'],
  ['tri-state flags', (d, p) => { p.phone_required = 'maybe'; }, 'phone_required'],
  ['commercial_ok value', (d, p) => { p.commercial_ok = 'sometimes'; }, 'commercial_ok'],
  ['conditional needs a condition', (d, p) => { p.commercial_ok = 'conditional'; p.commercial_ok_condition = null; }, 'commercial_ok_condition'],
  ['condition only when conditional', (d, p) => { p.commercial_ok = true; p.commercial_ok_condition = 'Only some models.'; }, 'commercial_ok_condition'],
  ['modality enum', (d, p) => { p.modalities = ['smell']; }, 'modalities/0'],
  ['models_free strings', (d, p) => { p.models_free = [7]; }, 'models_free/0'],
  ['added date', (d, p) => { p.added = 'soon'; }, 'added'],
  ['probe_status enum', (d, p) => { p.probe_status = 'up'; }, 'probe_status'],
  ['is_text_llm required', (d, p) => { delete p.is_text_llm; }, 'is_text_llm'],
  ['model_tier with model_tier_source', (d, p) => { p.model_tier_source = null; }, 'model_tier_source'],
  ['model_tier_source vote floor', (d, p) => { p.model_tier_source.votes = 1; }, 'model_tier_source/votes'],
  ['data_policy.plan_named boolean', (d, p) => { p.data_policy.plan_named = 'yes'; }, 'data_policy/plan_named'],
  ['verified last_verified date', (d, p) => { p.last_verified = 'soon'; }, 'last_verified'],
];

for (const [rule, mutate, pointer] of SCHEMA_GATED_CASES) {
  test(`validate schema gate: ${rule}`, () => {
    const data = structuredClone(DATA);
    const p = provider(data);
    const where = pointer.startsWith('/') ? pointer : `/providers/${data.providers.indexOf(p)}/${pointer}`;
    mutate(data, p);
    const result = runValidate(data);
    assert.equal(result.status, 1, result.output);
    const lines = outputLines(result.output);
    assert.match(lines[0], /^✗ schema validation failed/, result.output);
    assert.ok(lines.slice(1).some((line) => line.startsWith(`- schema: ${where} `)), result.output);
  });
}

// Whole-repository sites: these checks read fixed paths under the repository root
// (and gpu-compute, coding-tools, quotes and best.json are skipped for fixture
// paths), so these cases run a copy of validate.mjs from a copy of every file it
// reads. Each mutation touches one file and must produce exactly the listed issues.
function repositoryCopy() {
  const root = makeTmpDir('flah-validate-repo-');
  cpSync(VALIDATE, join(root, 'scripts/validate.mjs'));
  cpSync(join(ROOT, 'scripts/lib'), join(root, 'scripts/lib'), { recursive: true, filter: (src) => !src.endsWith('.test.mjs') });
  cpSync(join(ROOT, 'data'), join(root, 'data'), { recursive: true });
  for (const file of readdirSync(join(ROOT, 'docs')).filter((f) => f.endsWith('.md'))) cpSync(join(ROOT, 'docs', file), join(root, 'docs', file));
  for (const file of ['README.md', 'CONTRIBUTING.md', 'GOVERNANCE.md', 'site/index.html']) cpSync(join(ROOT, file), join(root, file));
  // ajv resolves from the copy's own node_modules: a junction (no privileges needed on Windows), a copy if even that fails.
  linkDir(join(ROOT, 'node_modules'), join(root, 'node_modules'));
  return root;
}

function runRepositoryCopy(edit = () => {}) {
  const root = repositoryCopy();
  const editJson = (file, mutate) => {
    const path = join(root, 'data', file);
    const value = JSON.parse(readFileSync(path, 'utf8'));
    mutate(value);
    writeFileSync(path, JSON.stringify(value));
  };
  edit({ root, editJson, writeData: (file, text) => writeFileSync(join(root, 'data', file), text) });
  const result = spawnSync(process.execPath, [join(root, 'scripts/validate.mjs')], { cwd: root, encoding: 'utf8' });
  return { ...result, output: `${result.stdout}${result.stderr}` };
}

test('the repository copy validates unchanged (control for the whole-repository cases)', () => {
  const result = runRepositoryCopy();
  assert.equal(result.status, 0, result.output);
});

// rule | protects | edit of the copy | exact issues, in order.
const REPOSITORY_CASES = [
  ['programs groups non-empty', 'both credit-program sections listed', ({ editJson }) => editJson('programs.json', (f) => { f.research = []; }), ['programs.json: "research" must be a non-empty array']],
  ['programs name, what and who', 'a program card that says what it is and who it is for', ({ editJson }) => editJson('programs.json', (f) => { delete f.startups[0].what; }), (f) => [`programs/${f.startups[0].name}: name, what and who are required`]],
  ['programs url http(s)', 'program links a browser can open', ({ editJson }) => editJson('programs.json', (f) => { f.startups[0].url = 'ftp://example.com/apply'; }), (f) => [`programs/${f.startups[0].name}: url must be http(s)`]],
  ['programs funds value', 'a known funding label', ({ editJson }) => editJson('programs.json', (f) => { f.startups[0].funds = 'maybe'; }), (f) => [`programs/${f.startups[0].name}: funds must be yes/partial/no`]],
  ['research programs audience', 'research programs say who may apply', ({ editJson }) => editJson('programs.json', (f) => { delete f.research[0].audience; }), (f) => [`programs/${f.research[0].name}: research entries need an audience`]],
  ['gpu-compute schema', 'GPU offers in the documented shape', ({ editJson }) => editJson('gpu-compute.json', (f) => { f.entries[0].unexpected = true; }), ['gpu-compute.json: /entries/0 must NOT have additional properties']],
  ['gpuComputeErrors', 'one card per GPU offer', ({ editJson }) => editJson('gpu-compute.json', (f) => { f.entries.push(structuredClone(f.entries[0])); }), (f) => [`gpu-compute/${f.entries[0].slug}: duplicate slug`]],
  ['coding-tools schema', 'coding-tool offers in the documented shape', ({ editJson }) => editJson('coding-tools.json', (f) => { f.entries[0].unexpected = true; }), ['coding-tools.json: /entries/0 must NOT have additional properties']],
  ['codingToolsErrors', 'visible coding-tool names', ({ editJson }) => editJson('coding-tools.json', (f) => { f.entries[0].name += '​'; }), (f) => [`coding-tools/${f.entries[0].slug}: name must not contain control, bidirectional or zero-width characters`]],
  ['coding-tools slug in one file', 'a tool listed once across both coding-tools files', ({ root, editJson }) => {
    const first = JSON.parse(readFileSync(join(root, 'data/coding-tools.json'), 'utf8')).entries[0];
    editJson('coding-tools-own-key.json', (f) => { f.entries.push(first); });
  }, (f) => [`coding-tools-own-key.json: the slug ${f.entries[0].slug} is in both coding-tools files`]],
  ['quoteErrors', 'every quoted policy sentence in the register', ({ editJson }) => editJson('quotes.json', (f) => { f.entries = f.entries.filter((e) => !(e.kind === 'sentence' && e.slug === firstQuoted())); }), () => [`${firstQuoted()}: the quote of its data_policy has no sentence entry in quotes.json`]],
  ['reportErrors', 'a quotes report whose summary matches its rows', ({ editJson }) => editJson('quotes-report.json', (f) => { f.summary.total += 1; }), ['quotes-report.json: summary.total does not match the results']],
  ['bestPickErrors', 'a provider ranks once', ({ editJson }) => editJson('best.json', (f) => { f.entries.push({ ...f.entries[0] }); }), (f) => [`data/best.json lists ${f.entries[0].slug} more than once — a provider can only rank once`]],
  ['figureErrors', 'prose counts that match the dataset', ({ root }) => writeFileSync(join(root, 'docs', 'zz-validate-test.md'), 'We list 3 verified providers.\n'), () => [`docs/zz-validate-test.md: says "3 verified providers" but data/providers.json has ${DATA.providers.filter((p) => p.verified).length} verified providers — use {verified} or a FIG marker so the build derives it`]],
  ['editorialErrors', 'ratings only for listed providers', ({ editJson }) => editJson('editorial.json', (f) => { f.ratings['no-such-provider'] = { score: 15, note: '' }; }), ['data/editorial.json rates unknown provider "no-such-provider"']],
  ['summaryErrors', 'a versioned summaries file', ({ editJson }) => editJson('provider-summaries.json', (f) => { f.version = ''; }), ['provider-summaries.json: version must be a non-empty string']],
  ['agreementsErrors', 'a sponsorships file in a known format', ({ editJson }) => editJson('sponsorships.json', (f) => { f.version = 2; }), ['version must be 1']],
];

for (const [rule, protects, edit, expected] of REPOSITORY_CASES) {
  test(`validate repository: ${rule} (${protects})`, () => {
    const result = runRepositoryCopy(edit);
    assert.equal(result.status, 1, result.output);
    const issues = typeof expected === 'function' ? expected(originalFileFor(rule)) : expected;
    assert.deepEqual(outputLines(result.output), [`✗ validation failed (${issues.length} issue${issues.length > 1 ? 's' : ''}):`, ...issues.map((issue) => `- ${issue}`)]);
  });
}

// An unreadable file is one reported issue, not a crash. quotes-report.json is
// checked against quotes.json, so a broken register is reported twice.
const UNREADABLE_CASES = [
  ['programs.json', ['programs.json']],
  ['gpu-compute.json', ['gpu-compute.json']],
  ['coding-tools.json', ['coding-tools.json']],
  ['quotes.json', ['quotes.json', 'quotes-report.json']],
  ['quotes-report.json', ['quotes-report.json']],
  ['best.json', ['best.json']],
  ['editorial.json', ['editorial.json']],
  ['provider-summaries.json', ['provider-summaries.json']],
  ['sponsorships.json', ['sponsorships.json']],
];

for (const [file, labels] of UNREADABLE_CASES) {
  test(`validate repository: an unreadable ${file} is reported`, () => {
    const result = runRepositoryCopy(({ writeData }) => writeData(file, '{'));
    assert.equal(result.status, 1, result.output);
    assert.deepEqual(outputLines(result.output), [`✗ validation failed (${labels.length} issue${labels.length > 1 ? 's' : ''}):`, ...labels.map((label) => `- ${label}: ${jsonParseMessage('{')}`)]);
  });
}

// The committed file a repository case edits, read before the edit, for diagnostics that name an entry.
function originalFileFor(rule) {
  const file = {
    'programs name, what and who': 'programs.json', 'programs url http(s)': 'programs.json', 'programs funds value': 'programs.json', 'research programs audience': 'programs.json',
    gpuComputeErrors: 'gpu-compute.json', codingToolsErrors: 'coding-tools.json', 'coding-tools slug in one file': 'coding-tools.json', bestPickErrors: 'best.json',
  }[rule];
  return file ? JSON.parse(readFileSync(join(ROOT, 'data', file), 'utf8')) : null;
}

// The first provider whose data_policy quote has a sentence entry in the register.
function firstQuoted() {
  return DATA.providers.find((p) => p.data_policy?.quote).slug;
}

function outputLines(output) {
  return output.trim().split(/\r?\n/).map((line) => line.trim());
}

function jsonParseMessage(text) {
  try { JSON.parse(text); } catch (error) { return error.message; }
  throw new Error(`${text} parsed`);
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
