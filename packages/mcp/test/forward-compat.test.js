// Forward compatibility: a value the server does not know, such as
// commercial_ok: "conditional" (proposed in #327), must read as "not confirmed",
// never as "no" and never as "yes", and it must be counted, not silently dropped.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDataset } from '../src/data.js';
import { getProvider, searchProviders, tristateLabel } from '../src/tools.js';

const base = { name: 'X', category: 'ongoing', free_tier: 't', docs_url: 'https://x.example/', verified: true, last_verified: '2026-10-01', modalities: ['text'] };
const data = normalizeDataset(
  {
    version: '9.9.9',
    generated: '2026-10-01',
    providers: [
      { ...base, slug: 'cond', commercial_ok: 'conditional', commercial_ok_condition: 'per-model licence', card_required: false },
      { ...base, slug: 'yes', commercial_ok: true, card_required: false },
      { ...base, slug: 'no', commercial_ok: false, card_required: false },
      { ...base, slug: 'unk', commercial_ok: null, card_required: false },
    ],
  },
  'inline',
);

test('an unknown tri-state value is labelled "not confirmed"', () => {
  assert.equal(tristateLabel('conditional'), 'not confirmed');
});

test('get_provider lists an unknown tri-state value among the unconfirmed fields', () => {
  const r = getProvider(data, { slug: 'cond' });
  assert.equal(r.flags.commercial_ok, 'not confirmed');
  assert.ok(r.unconfirmed_fields.includes('commercial_ok'));
  assert.equal(r.provider.commercial_ok_condition, 'per-model licence');
});

test('commercial_ok: true never matches an unknown value, and the provider is counted as unconfirmed', () => {
  const r = searchProviders(data, { commercial_ok: true });
  assert.deepEqual(r.providers.map((p) => p.slug), ['yes']);
  assert.equal(r.excluded_unconfirmed.commercial_ok, 2); // null + "conditional"
});

test('commercial_ok: false never matches an unknown value and counts it too', () => {
  const r = searchProviders(data, { commercial_ok: false });
  assert.deepEqual(r.providers.map((p) => p.slug), ['no']);
  assert.equal(r.excluded_unconfirmed.commercial_ok, 2);
});
