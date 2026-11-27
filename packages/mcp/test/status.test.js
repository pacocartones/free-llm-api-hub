// get_provider_status, the freshness field of provider results and is_free, against the fixtures (no network).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createLoader, createStatusLoader, normalizeDataset, normalizeStatus } from '../src/data.js';
import {
  NOT_STATED,
  ToolError,
  getProvider,
  getProviderStatus,
  getProviderWithStatus,
  isFree,
  searchProviders,
  searchProvidersWithStatus,
} from '../src/tools.js';

const FIXTURE = fileURLToPath(new URL('./fixtures/providers.json', import.meta.url));
const STATUS = fileURLToPath(new URL('./fixtures/status.json', import.meta.url));
const data = await createLoader({ dataPath: FIXTURE })();
const status = await createStatusLoader({ statusPath: STATUS })();

test('status loader keeps the v1 fields and ignores fields added later', () => {
  assert.equal(status.source, 'local_override');
  assert.equal(status.version, '9.9.9');
  assert.equal(status.generated_at, '2026-10-01');
  assert.deepEqual(status.sla, { due_after_days: 60, stale_after_days: 90 });
  assert.deepEqual(Object.keys(status.providers['gamma-labs']).sort(), ['free_now', 'freshness', 'last_change', 'last_verified', 'oldest_field_check']);
});

test('status loader rejects a file that is not status.json, and reads an unknown state as null', () => {
  assert.throws(() => normalizeStatus({ providers: [] }, 'x'), /not a free-llm-api-hub status.json/);
  assert.throws(() => normalizeStatus({}, 'x'), /not a free-llm-api-hub status.json/);
  const s = normalizeStatus({ generated_at: '2026-10-01', providers: { a: { freshness: 'ancient', free_now: 'maybe', last_verified: 'soon' } } }, 'x');
  assert.deepEqual(s.providers.a, { last_verified: null, oldest_field_check: null, freshness: null, free_now: null, last_change: null });
});

test('status loader fetches the published URL by default', async () => {
  let seen;
  const load = createStatusLoader({ fetchImpl: async (url) => { seen = url; return { ok: true, json: async () => ({ providers: {} }) }; } });
  await load();
  assert.equal(seen, 'https://freellmapihub.com/api/v1/status.json');
});

test('get_provider_status with a slug returns that entry, the SLA and the grading day', () => {
  const r = getProviderStatus(status, { slug: 'beta-cloud' });
  assert.equal(r.slug, 'beta-cloud');
  assert.equal(r.freshness, 'stale');
  assert.equal(r.free_now, true);
  assert.equal(r.last_verified, '2026-07-01');
  assert.equal(r.generated_at, '2026-10-01');
  assert.deepEqual(r.sla, { due_after_days: 60, stale_after_days: 90 });
  assert.match(r.note, /not a live check/);
  assert.match(r.disclaimer, /not confirmed/);
});

test('get_provider_status without a slug returns every provider and counts per state', () => {
  const r = getProviderStatus(status, {});
  assert.equal(r.count, 4);
  assert.deepEqual(r.counts, { fresh: 2, due: 0, stale: 1, unverified: 1, free_now: 2 });
  assert.deepEqual(Object.keys(r.providers).sort(), ['alpha-ai', 'beta-cloud', 'delta-free', 'gamma-labs']);
  assert.equal(r.providers['delta-free'].free_now, null, 'null free_now stays null (not confirmed), never false');
});

test('get_provider_status rejects an unknown slug with close matches', () => {
  assert.throws(() => getProviderStatus(status, { slug: 'gamma' }), (e) => e instanceof ToolError && /Did you mean: gamma-labs/.test(e.message));
  assert.throws(() => getProviderStatus(status, { slug: 'zzz' }), /without a slug/);
});

test('search_providers adds freshness per result when status.json matches the dataset, and is unchanged otherwise', () => {
  const plain = searchProviders(data, {});
  const graded = searchProvidersWithStatus(data, {}, status);
  assert.deepEqual(Object.fromEntries(graded.providers.map((p) => [p.slug, p.freshness])), {
    'alpha-ai': 'fresh', 'beta-cloud': 'stale', 'gamma-labs': 'fresh', 'delta-free': 'unverified',
  });
  assert.deepEqual(graded.freshness_source, { generated_at: '2026-10-01', sla: { due_after_days: 60, stale_after_days: 90 } });
  // Additive only: every existing field is the same.
  assert.deepEqual(graded.providers.map(({ freshness, ...rest }) => rest), plain.providers);
  assert.deepEqual(searchProvidersWithStatus(data, {}, null), plain);
  assert.deepEqual(searchProvidersWithStatus(data, {}, { ...status, version: '1.0.0' }), plain, 'a status.json of another build is not used');
});

test('get_provider adds freshness when available and keeps every existing field', () => {
  const plain = getProvider(data, { slug: 'alpha-ai' });
  const graded = getProviderWithStatus(data, { slug: 'alpha-ai' }, status);
  assert.equal(graded.freshness, 'fresh');
  const { freshness, freshness_source, ...rest } = graded;
  assert.deepEqual(rest, plain);
  assert.deepEqual(getProviderWithStatus(data, { slug: 'alpha-ai' }, null), plain);
  const missing = { ...status, providers: {} };
  assert.deepEqual(getProviderWithStatus(data, { slug: 'alpha-ai' }, missing), plain, 'a provider absent from status.json gets no freshness');
});

test('is_free: an ongoing free tier answers yes, with the page wording and source dates', () => {
  const r = isFree(data, { slug: 'alpha-ai' }, status);
  assert.equal(r.question, 'Is Alpha AI API free?');
  assert.equal(r.answer,
    'Yes. Alpha AI has an ongoing free tier (a quota that renews): Alpha-1 chat models, 1,000 requests/day. ' +
    'Credit card: not required; phone verification: not required; commercial use: allowed. Verified 30 Sep 2026.');
  assert.equal(r.verdict, 'ongoing_free_tier');
  assert.equal(r.freshness, 'fresh');
  assert.equal(r.free_now, true);
  assert.equal(r.page_url, 'https://freellmapihub.com/p/alpha-ai');
  for (const f of r.facts) {
    assert.equal(f.source_date, '2026-09-30', `${f.field} carries the day its source was read`);
    assert.equal(f.source_url, 'https://alpha.example/docs/limits');
  }
});

test('is_free: a trial credit is "not permanently", with its expiry, and null flags read "not stated"', () => {
  const r = isFree(data, { slug: 'beta-cloud' });
  assert.equal(r.answer,
    'Not permanently. Beta Cloud gives a one-time trial credit, not an ongoing free tier: $10 credit; the credit expires after 30 days. ' +
    `Credit card: required; phone verification: ${NOT_STATED}; commercial use: ${NOT_STATED}. Verified 1 Jul 2026.`);
  assert.equal(r.verdict, 'trial_credit');
  assert.ok(r.facts.some((f) => f.field === 'expires' && f.words === '30 days'));
  assert.equal(r.facts.find((f) => f.field === 'phone_required').value, null);
  assert.equal('freshness' in r, false, 'no status.json, no freshness');
});

test('is_free: an unverified entry says so, and free_now false is flagged', () => {
  const unverified = isFree(data, { slug: 'delta-free' }, status);
  assert.match(unverified.answer, / Not verified yet\.$/);
  assert.equal(unverified.free_now, null);
  assert.equal(unverified.facts.find((f) => f.field === 'category').source_date, null);
  const ended = isFree(data, { slug: 'gamma-labs' }, status);
  assert.equal(ended.free_now, false);
  assert.match(ended.free_now_note, /reported the free tier as ended/);
  assert.match(ended.answer, /commercial use: not allowed \(evaluation only\)/);
});

test('is_free: published limits, field-check dates, conditional commercial use and a missing category', () => {
  const d = normalizeDataset({
    version: '9.9.9',
    providers: [
      {
        slug: 'lim', name: 'Lim', category: 'ongoing', free_type: 'perpetual', free_tier: 'words', docs_url: 'https://lim.example/',
        verified: true, last_verified: '2026-11-20',
        free_limits: { requests_per_minute: 30, requests_per_day: 14400, checked: '2026-11-21', source: 'https://lim.example/limits' },
        card_required: false, phone_required: null, commercial_ok: 'conditional', commercial_ok_condition: 'Per-model licence.',
        field_checks: { card_required: { status: 'stated', checked: '2026-11-22', sources: ['https://lim.example/signup'] } },
      },
      { slug: 'nocat', name: 'NoCat', docs_url: 'https://n.example/', verified: false },
    ],
  }, 'inline');
  const r = isFree(d, { slug: 'lim' });
  assert.equal(r.answer,
    'Yes. Lim has an ongoing free tier (no end date): 30 RPM, 14.4K RPD. ' +
    'Credit card: not required; phone verification: not stated; commercial use: allowed with conditions. Verified 20 Nov 2026.');
  const fact = (f) => r.facts.find((x) => x.field === f);
  assert.deepEqual([fact('free_limits').source_date, fact('free_limits').source_url], ['2026-11-21', 'https://lim.example/limits']);
  assert.deepEqual([fact('card_required').source_date, fact('card_required').source_url], ['2026-11-22', 'https://lim.example/signup']);
  assert.equal(fact('commercial_ok').condition, 'Per-model licence');
  assert.equal(fact('commercial_ok').value, null, 'the v1 value stays null');
  const n = isFree(d, { slug: 'nocat' });
  assert.equal(n.answer, `Whether NoCat has an ongoing free tier is ${NOT_STATED}: ${NOT_STATED}. ` +
    `Credit card: ${NOT_STATED}; phone verification: ${NOT_STATED}; commercial use: ${NOT_STATED}. Not verified yet.`);
  assert.equal(n.verdict, NOT_STATED);
});

test('is_free rejects an unknown slug', () => {
  assert.throws(() => isFree(data, { slug: 'nope' }), /Unknown provider slug "nope"/);
});
