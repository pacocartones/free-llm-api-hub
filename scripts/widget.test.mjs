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

test('widget box style stays one well-formed attribute: no double quote inside it (the font stack quotes Segoe UI with single quotes)', { timeout: 1000 }, async () => {
  const html = await render([{ slug: 'alpha', name: 'Alpha', verified: true, modalities: ['text'] }]);
  const m = html.match(/^<div style="([^"]*)">/);
  assert.ok(m, 'the outer div opens with a quoted style attribute');
  const style = m[1];
  assert.match(style, /^font:14px\/1\.5 /);
  assert.ok(style.includes("'Segoe UI'"), 'Segoe UI is quoted with single quotes');
  assert.ok(style.endsWith('box-sizing:border-box'), 'the attribute holds every declaration, up to the last one');
  for (const decl of ['color:#d8e2dc', 'background:#0f1512', 'border-radius:10px', 'max-width:440px']) assert.ok(style.includes(decl), decl);
  // Every style attribute the widget writes is closed by the same quote character it opens with.
  for (const attr of html.match(/style="[^"]*"/g)) assert.doesNotMatch(attr.slice(7, -1), /["<>]/, attr);
});
