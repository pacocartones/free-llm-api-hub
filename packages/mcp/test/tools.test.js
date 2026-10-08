import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createLoader, normalizeDataset } from '../src/data.js';
import {
  ToolError,
  datasetInfo,
  envVarName,
  getProvider,
  openaiClientConfig,
  searchProviders,
  tristateLabel,
} from '../src/tools.js';

const FIXTURE = fileURLToPath(new URL('./fixtures/providers.json', import.meta.url));
const data = await createLoader({ dataPath: FIXTURE })();
const slugs = (r) => r.providers.map((p) => p.slug).sort();

test('loader strips env_key and keeps version/generated', () => {
  assert.equal(data.version, '9.9.9');
  assert.equal(data.generated, '2026-10-01');
  assert.ok(data.providers.every((p) => !('env_key' in p)));
});

test('loader caches: the second call returns the same object without fetching again', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return { ok: true, json: async () => ({ version: '1.0.0', generated: '2026-01-01', providers: [] }) };
  };
  const load = createLoader({ url: 'https://example.invalid/providers.json', fetchImpl });
  const a = await load();
  const b = await load();
  assert.equal(a, b);
  assert.equal(calls, 1);
});

test('loader does not cache a failure', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    if (calls === 1) return { ok: false, status: 503 };
    return { ok: true, json: async () => ({ providers: [] }) };
  };
  const load = createLoader({ url: 'https://example.invalid/p.json', fetchImpl });
  await assert.rejects(load(), /HTTP 503/);
  assert.deepEqual((await load()).providers, []);
});

test('normalizeDataset rejects a file without providers', () => {
  assert.throws(() => normalizeDataset({ version: '1' }, 'x.json'), /no "providers" array/);
});

test('search without filters returns every provider in compact form', () => {
  const r = searchProviders(data, {});
  assert.equal(r.count, 4);
  for (const p of r.providers) {
    assert.deepEqual(Object.keys(p).sort(), [
      'category', 'docs_url', 'free_tier', 'last_verified', 'name', 'rate_limits', 'slug', 'verified',
    ]);
  }
  assert.match(r.disclaimer, /authoritative/);
  assert.match(r.disclaimer, /not confirmed/);
});

test('every search result carries docs_url and last_verified (null kept as null)', () => {
  const r = searchProviders(data, {});
  const delta = r.providers.find((p) => p.slug === 'delta-free');
  assert.equal(delta.last_verified, null);
  assert.equal(delta.verified, false);
  assert.ok(r.providers.every((p) => 'docs_url' in p && 'last_verified' in p));
});

test('query matches all words across name, notes and sampled models', () => {
  assert.deepEqual(slugs(searchProviders(data, { query: 'alpha-1-large' })), ['alpha-ai']);
  assert.deepEqual(slugs(searchProviders(data, { query: 'GAMMA embeddings' })), ['gamma-labs']);
  assert.equal(searchProviders(data, { query: 'gamma chat' }).count, 0);
});

test('modality and category filters', () => {
  assert.deepEqual(slugs(searchProviders(data, { modality: 'embeddings' })), ['beta-cloud', 'gamma-labs']);
  assert.deepEqual(slugs(searchProviders(data, { category: 'trial' })), ['beta-cloud']);
  assert.throws(() => searchProviders(data, { modality: 'video' }), ToolError);
});

test('no_card: null card_required is excluded and counted, never treated as false', () => {
  const r = searchProviders(data, { no_card: true });
  assert.deepEqual(slugs(r), ['alpha-ai', 'delta-free']);
  assert.equal(r.excluded_unconfirmed.no_card, 1); // gamma-labs: card_required null
  assert.match(r.excluded_note, /not confirmed/);
});

test('no_card: false selects only providers confirmed to require a card', () => {
  const r = searchProviders(data, { no_card: false });
  assert.deepEqual(slugs(r), ['beta-cloud']);
  assert.equal(r.excluded_unconfirmed.no_card, 1);
});

test('commercial_ok: false does not pick up unconfirmed (null) providers', () => {
  const r = searchProviders(data, { commercial_ok: false });
  assert.deepEqual(slugs(r), ['gamma-labs']);
  assert.equal(r.excluded_unconfirmed.commercial_ok, 2); // beta-cloud, delta-free
});

test('no_phone and openai_compatible filters combine with AND', () => {
  const r = searchProviders(data, { no_phone: true, openai_compatible: true });
  assert.deepEqual(slugs(r), ['alpha-ai']);
});

test('without exclusions there is no excluded_unconfirmed key', () => {
  assert.equal('excluded_unconfirmed' in searchProviders(data, { category: 'trial' }), false);
});

test('tristateLabel never renders null as no', () => {
  assert.equal(tristateLabel(true), 'yes');
  assert.equal(tristateLabel(false), 'no');
  assert.equal(tristateLabel(null), 'not confirmed');
  assert.equal(tristateLabel(undefined), 'not confirmed');
});

test('get_provider returns the full entry with spelled-out flags', () => {
  const r = getProvider(data, { slug: 'beta-cloud' });
  assert.equal(r.provider.free_tier, '$10 credit');
  assert.equal(r.provider.docs_url, 'https://beta.example/pricing');
  assert.equal(r.provider.last_verified, '2026-07-01');
  assert.equal(r.provider.phone_required, null);
  assert.equal(r.flags.phone_required, 'not confirmed');
  assert.equal(r.flags.card_required, 'yes');
  assert.equal(r.flags.openai_compatible, 'no');
  assert.deepEqual(r.unconfirmed_fields, ['phone_required', 'commercial_ok']);
  assert.match(r.disclaimer, /authoritative/);
});

test('get_provider: unknown slug is a clear error with suggestions', () => {
  assert.throws(() => getProvider(data, { slug: 'nope' }), (err) => err instanceof ToolError && /Unknown provider slug "nope"/.test(err.message));
  assert.throws(() => getProvider(data, { slug: 'alpha' }), /Did you mean: alpha-ai/);
});

test('openai_client_config for a verified compatible provider', () => {
  const r = openaiClientConfig(data, { slug: 'alpha-ai' });
  assert.equal(r.available, true);
  assert.equal(r.base_url, 'https://api.alpha.example/v1');
  assert.equal(r.env_var, 'ALPHA_AI_API_KEY');
  assert.equal(r.model, 'alpha-1-small');
  assert.match(r.python, /base_url="https:\/\/api\.alpha\.example\/v1"/);
  assert.match(r.python, /os\.environ\["ALPHA_AI_API_KEY"\]/);
  assert.match(r.javascript, /process\.env\.ALPHA_AI_API_KEY/);
  assert.equal(r.docs_url, 'https://alpha.example/docs/limits');
  assert.equal(r.last_verified, '2026-09-30');
  assert.match(r.model_note, /sample/);
});

test('openai_client_config honours an explicit model and flags an unsampled one', () => {
  const r = openaiClientConfig(data, { slug: 'alpha-ai', model: 'alpha-2' });
  assert.equal(r.model, 'alpha-2');
  assert.match(r.javascript, /model: "alpha-2"/);
  assert.match(r.model_note, /not in the sampled free models/);
});

test('openai_client_config refuses a non-compatible provider and says why', () => {
  const r = openaiClientConfig(data, { slug: 'beta-cloud' });
  assert.equal(r.available, false);
  assert.match(r.reason, /not OpenAI-compatible \(openai_compatible: false\)/);
  assert.equal(r.docs_url, 'https://beta.example/pricing');
  assert.equal(r.last_verified, '2026-07-01');
  assert.equal('python' in r, false);
});

test('openai_client_config: null compatibility is reported as unconfirmed, not as "not compatible"', () => {
  const r = openaiClientConfig(data, { slug: 'gamma-labs' });
  assert.equal(r.available, false);
  assert.match(r.reason, /not confirmed \(openai_compatible: null\)/);
  assert.doesNotMatch(r.reason, /is not OpenAI-compatible/);
});

test('openai_client_config refuses an unverified provider even with a base URL', () => {
  const r = openaiClientConfig(data, { slug: 'delta-free' });
  assert.equal(r.available, false);
  assert.match(r.reason, /not verified/);
  assert.equal(r.last_verified, null);
});

test('openai_client_config: unknown slug is an error', () => {
  assert.throws(() => openaiClientConfig(data, { slug: 'zzz' }), ToolError);
});

test('envVarName', () => {
  assert.equal(envVarName('google-gemini'), 'GOOGLE_GEMINI_API_KEY');
});

test('dataset_info: version, counts and freshness', () => {
  const r = datasetInfo(data);
  assert.equal(r.version, '9.9.9');
  assert.equal(r.generated, '2026-10-01');
  assert.deepEqual(
    { providers: r.counts.providers, ongoing: r.counts.ongoing, trial: r.counts.trial, verified: r.counts.verified, unverified: r.counts.unverified, openai_client_ready: r.counts.openai_client_ready },
    { providers: 4, ongoing: 3, trial: 1, verified: 3, unverified: 1, openai_client_ready: 1 },
  );
  assert.deepEqual(r.counts.unconfirmed, { phone_required: 1, card_required: 1, commercial_ok: 2, openai_compatible: 1 });
  assert.equal(r.freshness.oldest_last_verified, '2026-07-01');
  assert.equal(r.freshness.median_last_verified, '2026-08-15');
  assert.equal(r.freshness.newest_last_verified, '2026-09-30');
  assert.equal(r.freshness.never_verified, 1);
  assert.deepEqual(r.freshness.oldest_providers, [
    { slug: 'beta-cloud', last_verified: '2026-07-01', docs_url: 'https://beta.example/pricing' },
  ]);
});
