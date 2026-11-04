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
  ['model_tier matches the cited rating', 'a tier that does not match its source rating', (d) => { provider(d).model_tier = 0; }, 'does not match the cited rating'],
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
  ['data_policy quote goes with a stated part', 'a quote that does not say what it supports', (d) => { provider(d).data_policy.trains_on_prompts = null; provider(d).data_policy.retention = null; }, 'a data_policy sentence goes with a stated part'],
  ['no_expiry applies only to trial credit', 'a no-expiry statement on an ongoing tier', (d) => { provider(d).no_expiry = { source: 'https://example.com/terms', checked: '2026-10-01', quote: 'Credits do not expire.' }; }, 'no_expiry applies only to a one-time trial credit'],
  ['no_expiry and expires do not contradict', 'a no-expiry statement beside an expiry date', (d) => { const p = trialProvider(d); p.expires = '2027-01-01'; p.no_expiry = { source: 'https://example.com/terms', checked: '2026-10-01', quote: 'Credits do not expire.' }; }, 'no_expiry and a non-null expires contradict each other'],
  ['no_expiry.checked is not after generated', 'a no-expiry source checked after the dataset date', (d) => { trialProvider(d).no_expiry = { source: 'https://example.com/terms', checked: '2999-01-01', quote: 'Credits do not expire.' }; }, 'no_expiry.checked must be a date not after the dataset'],
  ['verified entries have last_verified', 'a verified claim with no verification date', (d) => { provider(d).verified = true; provider(d).last_verified = null; }, 'last_verified must be string'],
  ['unverified entries have no last_verified', 'a stale verification date on an unverified row', (d) => { provider(d).verified = false; provider(d).last_verified = '2026-10-01'; }, 'unverified entry must have last_verified: null'],
];

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

test('the fixture harness leaves a valid fixture valid', () => {
  const data = structuredClone(DATA);
  const result = runValidate(data);
  assert.equal(result.status, 0, result.output);
});

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
