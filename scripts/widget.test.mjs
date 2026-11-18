import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../site/widget.js', import.meta.url), 'utf8');

function render(providers, attributes = {}, fetchImpl = async () => ({ ok: true, json: async () => ({ providers }) })) {
  return new Promise((resolve, reject) => {
    const element = {
      getAttribute: (name) => attributes[name] ?? null,
      set innerHTML(value) { resolve(value); },
    };
    try {
      runInNewContext(source, {
        document: { getElementById: () => element },
        window: {
          FLLM_RULES: { recScore: () => 0 },
          FLLM_SORT: { comparator: (_key, _direction, a, b) => a.name.localeCompare(b.name) },
        },
        fetch: fetchImpl,
      });
    } catch (error) { reject(error); }
  });
}

test('widget counts all verified providers, excluding false and unknown statuses before display filters', { timeout: 1000 }, async () => {
  const html = await render([
    { slug: 'alpha', name: 'Alpha', verified: true, modalities: ['text'] },
    { slug: 'beta', name: 'Beta', verified: true, modalities: ['audio'] },
    { slug: 'unverified', name: 'Unverified', verified: false, modalities: ['text'] },
    { slug: 'unknown', name: 'Unknown', modalities: ['text'] },
  ], { 'data-modality': 'text', 'data-count': '1' });
  assert.match(html, /1 of 2 verified · see all/);
  assert.match(html, /\/p\/alpha"/);
  for (const slug of ['beta', 'unverified', 'unknown']) assert.ok(!html.includes('/p/' + slug + '"'));
});

test('widget reports zero verified when no provider is verified', { timeout: 1000 }, async () => {
  const html = await render([{ slug: 'unverified', verified: false }, { slug: 'unknown', verified: null }]);
  assert.match(html, /0 of 0 verified · see all/);
  assert.doesNotMatch(html, /\/p\//);
});

test('widget keeps its load-error message for network, HTTP and invalid data failures', { timeout: 1000 }, async () => {
  for (const fetchImpl of [
    async () => { throw new Error('offline'); },
    async () => ({ ok: false }),
    async () => ({ ok: true, json: async () => ({}) }),
  ]) {
    const html = await render([], {}, fetchImpl);
    assert.match(html, /Could not load the Free LLM API Hub widget\./);
    assert.doesNotMatch(html, /verified · see all/);
  }
});
