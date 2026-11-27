import { test } from 'node:test';
import assert from 'node:assert/strict';
import { andList, cardWords, commercialWords, exampleChatModel, escProse } from './lib/long-guides.mjs';
import { REASON_LABEL } from './lib/field-checks.mjs';

test('andList formats zero, one, two, and three parts', () => {
  assert.equal(andList([]), '');
  assert.equal(andList(['A']), 'A');
  assert.equal(andList(['A', 'B']), 'A and B');
  assert.equal(andList(['A', 'B', 'C']), 'A, B and C');
});

test('cardWords formats false, true, phone-required, and field_checks reasons', () => {
  assert.equal(cardWords({ card_required: false }), 'No');
  assert.equal(cardWords({ card_required: true }), 'Yes');
  assert.equal(cardWords({ card_required: true, phone_required: true }), 'Yes (phone required)');

  const withoutCheck = cardWords({ card_required: null });
  assert.ok(withoutCheck.startsWith('Unknown ('));
  assert.ok(withoutCheck.includes(REASON_LABEL.not_checked));

  for (const status of ['source_silent', 'needs_account', 'sources_disagree']) {
    const label = cardWords({
      card_required: null,
      field_checks: { card_required: { status } },
    });
    assert.ok(label.startsWith('Unknown ('));
    assert.ok(label.includes(REASON_LABEL[status]), `expected ${REASON_LABEL[status]} in ${label}`);
  }
});

test('commercialWords renders true, false, conditional, and null states', () => {
  assert.equal(commercialWords({ commercial_ok: true }), 'Yes');
  assert.equal(commercialWords({ commercial_ok: false }), '<strong>No</strong>');
  assert.equal(commercialWords({ commercial_ok: 'conditional' }), 'Conditional');
  assert.equal(commercialWords({ commercial_ok: null }), 'Not confirmed');
});

test('exampleChatModel skips non-chat models and handles missing lists', () => {
  assert.equal(
    exampleChatModel({ models_free: ['whisper-large-v3', 'bge-m3', 'llama-3.3-70b-versatile'] }),
    'llama-3.3-70b-versatile',
  );
  assert.equal(exampleChatModel({ models_free: ['whisper-large-v3', 'tts-1'] }), null);
  assert.equal(exampleChatModel({}), null);
});

test('escProse escapes HTML and adds <wbr> after slashes in long tokens', () => {
  assert.equal(escProse('<b>hello</b>'), '&lt;b&gt;hello&lt;/b&gt;');
  assert.equal(escProse('short phrase here'), 'short phrase here');
  assert.equal(
    escProse('https://example.com/v1/chat/completions/free'),
    'https:/<wbr>/<wbr>example.com/<wbr>v1/<wbr>chat/<wbr>completions/<wbr>free',
  );
});
