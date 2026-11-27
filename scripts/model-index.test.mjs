import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { groupModels } from './lib/model-keys.mjs';
import { familyGroups } from './lib/model-families.mjs';
import {
  MODEL_INDEX_COLUMNS, modelIndexRows, modelIndexStats, modelIndexAnswer, modelIndexAnswerHtml,
  modelIndexRowHtml, modelIndexTableHtml, modelIndexDescription,
} from './lib/model-index.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const base = { free_type: 'renewing-quota', modalities: ['text', 'embeddings'], verified: true };
const alpha = { ...base, slug: 'alpha', name: 'Alpha', models_free: ['meta-llama/Llama-3.3-70B-Instruct', 'Qwen/Qwen3-4B'] };
const beta = { ...base, slug: 'beta', name: 'Beta <b>', free_type: 'trial-credit', modalities: [], models_free: ['llama-3.3-70b-instruct', 'phi-4-mini'] };
const gamma = { ...base, slug: 'gamma', name: 'Gamma', models_free: ['Qwen/Qwen3-4B'] };
const providers = [alpha, beta, gamma, { ...base, slug: 'none', name: 'None', models_free: [] }];
const groups = groupModels(providers);
const families = familyGroups(providers);

test('the answer-first line comes from the data: distinct models, providers, most widely available first', () => {
  const stats = modelIndexStats(providers, groups);
  assert.equal(stats.providers, 3, 'a provider with no free model is not counted');
  assert.equal(stats.models, 3, 'the same model under two deployment names counts once');
  assert.deepEqual(stats.widest.map((w) => w.providers), [2, 2], 'only models with two or more providers, most first');
  assert.equal(modelIndexAnswer(stats), `3 models free across 3 providers; most widely available: ${stats.widest[0].name} (2 providers) and ${stats.widest[1].name} (2).`);
  const html = modelIndexAnswerHtml(stats);
  assert.match(html, /^<p class="answer"><strong>3 models free across 3 providers; most widely available: <a href="[a-z0-9.-]+\/">/);
  assert.equal(modelIndexAnswer({ models: 1, providers: 1, widest: [] }), '1 model free across 1 provider.');
});

test('the description targets "free AI models API" and fits a search snippet', () => {
  const d = modelIndexDescription(modelIndexStats(providers, groups));
  assert.match(d, /^Free AI models API index: 3 models free across 3 providers/);
  assert.ok(d.length <= 155);
});

test('each row carries its column name in data-label for the phone card layout, with explicit roles', () => {
  const rows = modelIndexRows(providers);
  assert.equal(rows.length, 5);
  const html = modelIndexRowHtml(rows.find((r) => r.p.slug === 'beta' && r.m === 'phi-4-mini'), { families });
  for (const label of MODEL_INDEX_COLUMNS) assert.ok(html.includes(`data-label="${label}"`), label);
  assert.match(html, /^<tr role="row"[^>]*><th scope="row" role="rowheader" class="name"/);
  assert.equal((html.match(/role="cell"/g) || []).length, 3);
  assert.ok(html.includes('Beta &lt;b&gt;'), 'provider name escaped');
  assert.ok(html.includes('>One-time trial credit<'), 'free type in words, not the raw enum');
  assert.ok(html.includes('data-label="Modalities">not stated<'), 'no modalities reads "not stated"');
});

test('a model of an open family links to /free-api/<family>/; others do not', () => {
  const rows = modelIndexRows(providers);
  const opts = { families, familyPrefix: '../' };
  const llama = modelIndexRowHtml(rows.find((r) => r.m === 'llama-3.3-70b-instruct'), opts);
  assert.ok(llama.includes('<a class="model-fam" href="../free-api/llama/">Llama family</a>'));
  const qwen = modelIndexRowHtml(rows.find((r) => r.m === 'Qwen/Qwen3-4B'), opts);
  assert.ok(qwen.includes('href="../free-api/qwen/"'));
  const phi = modelIndexRowHtml(rows.find((r) => r.m === 'phi-4-mini'), opts);
  assert.ok(!phi.includes('model-fam'), 'no family page, no link');
  const noPage = modelIndexRowHtml(rows.find((r) => r.m === 'llama-3.3-70b-instruct'), { families: families.filter((f) => f.slug !== 'llama') });
  assert.ok(!noPage.includes('model-fam'), 'only where the family page exists');
});

test('the table sits in a keyboard-focusable, labelled scroll region with column headers', () => {
  const html = modelIndexTableHtml(modelIndexRows(providers), { families });
  assert.match(html, /^<div class="table-scroll model-scroll" role="region" aria-label="[^"]+" tabindex="0"><table class="model-table" role="table"><caption class="sr-only">/);
  for (const c of MODEL_INDEX_COLUMNS) assert.ok(html.includes(`<th scope="col" role="columnheader">${c}</th>`), c);
});

test('the stylesheet turns the rows into cards under 560px and keeps words whole', () => {
  const css = readFileSync(join(ROOT, 'site/styles.css'), 'utf8').replace(/\s+/g, ' ');
  assert.ok(!/\.model-table th, \.model-table td \{ overflow-wrap: anywhere;/.test(css), 'anywhere broke words mid-word at 375px');
  const phone = css.slice(css.indexOf('@media (max-width: 560px) { .model-table thead'));
  assert.ok(phone.length > 0);
  assert.match(phone, /\.model-table, \.model-table tbody, \.model-table tr, \.model-table th\.name, \.model-table td \{ display: block; width: 100%; \}/);
  assert.match(phone, /\.model-table td::before \{ content: attr\(data-label\); content: attr\(data-label\) \/ "";/);
  assert.match(css, /@media \(min-width: 561px\) \{ \.model-scroll \{ overflow: visible; \} \}/, 'desktop keeps the sticky header');
});

test('the built /models/ page carries the answer line, the family links and the new title', () => {
  const html = readFileSync(join(ROOT, 'site/models/index.html'), 'utf8');
  assert.match(html, /<title>Free AI models API index/);
  assert.match(html, /<meta name="description" content="Free AI models API index: \d+ models? free across \d+ providers?/);
  assert.match(html, /<p class="answer"><strong>\d+ models? free across \d+ providers?; most widely available: <a href=/);
  assert.match(html, /<a class="model-fam" href="\.\.\/free-api\/[a-z-]+\/">/);
  assert.match(html, /<div class="table-scroll model-scroll" role="region"[^>]*tabindex="0">/);
});
