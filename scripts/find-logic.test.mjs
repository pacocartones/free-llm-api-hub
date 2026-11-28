// Direct tests for the /find/ matching helpers in lib/find.mjs (#881).
// The core rule: "not confirmed" is never "yes". Pure functions, no build needed:
// `node --test scripts/find-logic.test.mjs`. USES and CONSTRAINTS are read from
// the module, never copied, so the tests track the real questions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { USES, CONSTRAINTS, activeConstraints, constraintState, usesMatch, evaluateProvider, answersSummary } from './lib/find.mjs';

const CARD = CONSTRAINTS.find((c) => c.key === 'card');
const PHONE = CONSTRAINTS.find((c) => c.key === 'phone');
const CHAT = USES.find((u) => u.text);
const EMBEDDINGS = USES.find((u) => u.mod === 'embeddings');

test('activeConstraints: no answers, one answer that turns a constraint on, one that does not', () => {
  assert.deepEqual(activeConstraints({}), []);
  assert.deepEqual(activeConstraints({ [CARD.key]: CARD.when }), [CARD]);
  assert.deepEqual(activeConstraints({ [CARD.key]: 'the opposite of when' }), []);
});

test('constraintState: confirmed value is yes, null is unknown, the opposite is no', () => {
  assert.equal(constraintState({ card_required: CARD.want }, CARD), 'yes');
  assert.equal(constraintState({ card_required: null }, CARD), 'unknown');
  assert.equal(constraintState({}, CARD), 'unknown', 'a missing field is not confirmed either');
  assert.equal(constraintState({ card_required: !CARD.want }, CARD), 'no');
});

test('usesMatch: text uses need is_text_llm, other uses need the modality, an unknown use matches everything', () => {
  const textLlm = { is_text_llm: true, modalities: ['text'] };
  const embeddingsOnly = { is_text_llm: false, modalities: ['embeddings'] };
  assert.equal(usesMatch(textLlm, CHAT.value), true);
  assert.equal(usesMatch(embeddingsOnly, CHAT.value), false);
  assert.equal(usesMatch(embeddingsOnly, EMBEDDINGS.value), true);
  assert.equal(usesMatch(textLlm, EMBEDDINGS.value), false);
  assert.equal(usesMatch(embeddingsOnly, 'not-a-use'), true, 'an unknown use matches everything');
});

test('evaluateProvider: a pass, an unknown flag lands in unknown (not failed), a contradiction fails', () => {
  const answers = { use: CHAT.value, [CARD.key]: CARD.when };
  assert.deepEqual(evaluateProvider({ is_text_llm: true, card_required: CARD.want }, answers),
    { use: true, unknown: [], failed: [] });
  assert.deepEqual(evaluateProvider({ is_text_llm: true, card_required: null }, answers),
    { use: true, unknown: [CARD.key], failed: [] }, 'not confirmed is never yes, and never a failure');
  assert.deepEqual(evaluateProvider({ is_text_llm: true, card_required: !CARD.want }, answers),
    { use: true, unknown: [], failed: [CARD.key] });
  assert.equal(evaluateProvider({ is_text_llm: false, modalities: ['embeddings'], card_required: CARD.want }, answers).use,
    false, 'a provider that does not offer the use is marked at use, not failed');
});

test('answersSummary: no answers start with "Any use"; two constraints join both phrases with " · "', () => {
  assert.match(answersSummary({}), /^Any use/);
  const summary = answersSummary({ [CARD.key]: CARD.when, [PHONE.key]: PHONE.when });
  assert.equal(summary, ['Any use', CARD.words.yes, PHONE.words.yes].join(' · '));
});
