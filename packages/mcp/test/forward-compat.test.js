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

// field_checks (dataset 2.15.0): why a flag is unconfirmed. Additive output; older datasets read not_checked.
const base2 = { ...base, phone_required: false, openai_compatible: true };
const withChecks = normalizeDataset(
  {
    version: '9.9.9',
    generated: '2026-11-24',
    providers: [
      { ...base2, slug: 'silent', commercial_ok: null, card_required: null, field_checks: { commercial_ok: { status: 'source_silent', checked: '2026-11-24', sources: ['https://x.example/terms'] } } },
      { ...base2, slug: 'account', commercial_ok: null, card_required: false, field_checks: { commercial_ok: { status: 'needs_account', checked: '2026-11-24', sources: ['https://x.example/'] } } },
      { ...base2, slug: 'bare', commercial_ok: null, card_required: false },
      { ...base2, slug: 'cond2', commercial_ok: 'conditional', commercial_ok_condition: 'licence', card_required: false, field_checks: { commercial_ok: { status: 'stated', checked: '2026-11-24', sources: ['https://x.example/terms'], quote: 'q' } } },
    ],
  },
  'inline',
);

test('get_provider says why each unconfirmed flag is unknown, defaulting to not_checked', () => {
  assert.deepEqual(getProvider(withChecks, { slug: 'silent' }).unconfirmed_reasons, { card_required: 'not_checked', commercial_ok: 'source_silent' });
  assert.deepEqual(getProvider(withChecks, { slug: 'bare' }).unconfirmed_reasons, { commercial_ok: 'not_checked' });
  // a conditional value is projected to null; its check is stated, which is reported as is
  assert.deepEqual(getProvider(withChecks, { slug: 'cond2' }).unconfirmed_reasons, { commercial_ok: 'stated' });
  assert.equal(getProvider(withChecks, { slug: 'silent' }).flags.commercial_ok, 'not confirmed', 'a reason never turns null into no');
});

test('search_providers splits excluded_unconfirmed by reason, keeping the old count', () => {
  const r = searchProviders(withChecks, { commercial_ok: true });
  assert.equal(r.excluded_unconfirmed.commercial_ok, 4);
  assert.deepEqual(r.excluded_unconfirmed_by_reason.commercial_ok, { source_silent: 1, needs_account: 1, not_checked: 1, stated: 1 });
  assert.equal('excluded_unconfirmed_by_reason' in searchProviders(withChecks, { category: 'trial' }), false);
});
