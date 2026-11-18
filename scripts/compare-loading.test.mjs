import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { clientBundle } from './lib/compare.mjs';
const source = readFileSync(new URL('../site/compare.js', import.meta.url), 'utf8');
const tick = () => new Promise(setImmediate);
function fixture() {
  let resolveScores, rejectScores;
  const scores = new Promise((resolve, reject) => { resolveScores = resolve; rejectScores = reject; });
  const providers = ['a', 'b', 'c'].map(slug => ({ slug }));
  const renders = [], calls = [];
  const select = () => ({ value: '', addEventListener(_name, fn) { this.change = fn; } });
  const selects = [select(), select()];
  const form = { querySelectorAll: () => selects, addEventListener() {} };
  const out = { innerHTML: '', textContent: '', appendChild() {} };
  const window = {};
  runInNewContext(clientBundle(), { window, URLSearchParams });
  window.FLLM_COMPARE.compareTableHtml = (list, opts) => { renders.push({ slugs: Array.from(list, p => p.slug), scores: opts.scores }); return 'table'; };
  const document = { getElementById: id => id === 'compare-form' ? form : out, createElement: () => ({}) };
  runInNewContext(source, { window, document, URLSearchParams, location: { search: '?compare=a,b', pathname: '/compare/' }, history: { replaceState() {} }, fetch: url => { calls.push(url); return url === '../scores.json' ? scores : Promise.resolve({ ok: true, json: async () => ({ providers }) }); } });
  return { calls, renders, selects, resolveScores, rejectScores };
}
test('comparison renders providers while optional scores remain pending', async () => {
  const f = fixture(); await tick();
  assert.ok(f.calls.includes('../providers.json'));
  assert.deepEqual(f.renders[0].slugs, ['a', 'b']);
  assert.equal(f.renders[0].scores, undefined);
  f.rejectScores(new Error('offline')); await tick();
  assert.deepEqual(f.renders.at(-1).slugs, ['a', 'b']);
});
test('late scores keep the current picker selection', async () => {
  const f = fixture(); await tick();
  f.selects[1].value = 'c'; f.selects[1].change();
  f.resolveScores({ ok: true, json: async () => ({ scores: { a: 10, c: 20 } }) }); await tick();
  assert.deepEqual(f.renders.at(-1).slugs, ['a', 'c']);
  assert.equal(f.renders.at(-1).scores.c, 20);
});
