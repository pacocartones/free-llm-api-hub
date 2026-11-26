// The "Recommended" order (rules.mjs recommendedCmp): intent group first (text LLM + ongoing free tier + confirmed no
// card), then the flag score, then text LLMs before other modalities, then model quality, then free_type and name.
// It is shared by the server render, the explorer (shared-rules.js / shared-sort.js), the widget and the guides'
// "Top pick", so these tests pin the module, the serialised browser copy and the generated pages to one order.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { intentRank, recommendedCmp, recScore } from './lib/rules.mjs';
import { comparator, clientBundle } from './lib/sort.mjs';
import { privateTree } from './lib/private-tree.mjs';

// The pages under test are build outputs (several are gitignored). The build runs in a private copy of the tree, as in
// build.test.mjs: `node --test` runs the test files in parallel, and a build in the repository's own tree races the
// other files' builds and their checks that the repository's generated folders stay untouched.
const ROOT = privateTree(join(import.meta.dirname, '..'));
const providers = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8')).providers;
before(() => { execFileSync(process.execPath, [join(ROOT, 'scripts/build.mjs')], { cwd: ROOT, stdio: 'pipe' }); });

const base = { category: 'ongoing', free_type: 'renewing-quota', card_required: false, phone_required: null, commercial_ok: null, openai_compatible: true, is_text_llm: true, modalities: ['text'] };

test('intentRank: only a confirmed no-card, ongoing text LLM is in the intent group', () => {
  assert.equal(intentRank(base), 0);
  assert.equal(intentRank({ ...base, card_required: null }), 1, 'an unknown card requirement is not "no card"');
  assert.equal(intentRank({ ...base, card_required: true }), 1);
  assert.equal(intentRank({ ...base, category: 'trial' }), 1);
  assert.equal(intentRank({ ...base, is_text_llm: false }), 1);
  assert.equal(intentRank({}), 1, 'missing fields never throw and never qualify');
});

test('recommendedCmp: the intent group outranks a higher flag score, then score, modality and model tier decide', () => {
  const llm = { ...base, name: 'Llm' };
  const ocr = { ...base, name: 'Ocr', is_text_llm: false, modalities: ['ocr'], free_type: 'perpetual', phone_required: false, commercial_ok: true };
  assert.ok(recScore(ocr) > recScore(llm), 'the specialised API has the higher flag score');
  assert.ok(recommendedCmp(llm, ocr) < 0, 'yet the intent-group LLM comes first');
  // outside the intent group, a text LLM wins a tie on the flag score
  const trialLlm = { ...base, name: 'Zeta', category: 'trial', free_type: 'trial-credit' };
  const trialTts = { ...trialLlm, name: 'Alpha', is_text_llm: false, modalities: ['audio'] };
  assert.equal(recScore(trialLlm), recScore(trialTts));
  assert.ok(recommendedCmp(trialLlm, trialTts) < 0, 'modality tie-break: the text LLM first, despite the name');
  // a tie on everything above: a rated model beats an unrated one, a higher tier beats a lower one
  const rated = { ...base, name: 'Zed', model_tier: 2 }, better = { ...base, name: 'Zzz', model_tier: 3 }, unrated = { ...base, name: 'Aaa', model_tier: null };
  assert.ok(recommendedCmp(rated, unrated) < 0, 'an unrated provider never sorts above a rated one');
  assert.ok(recommendedCmp(better, rated) < 0);
  // total and deterministic: equal rows fall back to the name, and a row equals itself
  assert.ok(recommendedCmp({ ...base, name: 'A' }, { ...base, name: 'B' }) < 0);
  assert.equal(recommendedCmp(llm, llm), 0);
  assert.equal(comparator('recommended', -1, llm, ocr), recommendedCmp(llm, ocr), 'the column comparator delegates and ignores the direction');
});

test('on the dataset: the intent group opens the list and the general-purpose LLMs reach the top 10', () => {
  const order = [...providers].sort(recommendedCmp);
  const firstOutside = order.findIndex((p) => intentRank(p) === 1);
  assert.ok(firstOutside > 0, 'the list opens with the intent group');
  assert.ok(order.slice(firstOutside).every((p) => intentRank(p) === 1), 'no intent-group row after the first row outside it');
  assert.equal(order[0].is_text_llm, true);
  for (const slug of ['google-gemini', 'groq']) {
    const i = order.findIndex((p) => p.slug === slug);
    if (i >= 0) assert.ok(i < 10, `${slug} is in the top 10 (got #${i + 1})`);
  }
});

test('the browser copy (shared-rules.js + shared-sort.js) sorts the dataset exactly like the module', () => {
  const win = {};
  new Function('window', readFileSync(join(ROOT, 'site/shared-rules.js'), 'utf8'))(win);
  new Function('window', clientBundle())(win);
  const viaClient = [...providers].sort((a, b) => win.FLLM_SORT.comparator('recommended', 1, a, b)).map((p) => p.slug);
  const viaModule = [...providers].sort(recommendedCmp).map((p) => p.slug);
  assert.deepEqual(viaClient, viaModule);
  // the home inlines model_tier, the one extra field the order reads, so the first client repaint keeps the server order
  const inline = JSON.parse(readFileSync(join(ROOT, 'site/index.html'), 'utf8').match(/<script type="application\/json" id="providers-data">([\s\S]*?)<\/script>/)[1]);
  const viaInline = [...inline.providers].sort((a, b) => win.FLLM_SORT.comparator('recommended', 1, a, b)).map((p) => p.slug);
  assert.deepEqual(viaInline, viaModule, 'the inline payload carries every field the order needs');
});

test('the server-rendered home rows follow the shared order', () => {
  const html = readFileSync(join(ROOT, 'site/index.html'), 'utf8');
  const rows = html.slice(html.indexOf('<!-- AUTOGEN:rows:start -->'), html.indexOf('<!-- AUTOGEN:rows:end -->'));
  const shown = [...rows.matchAll(/<tr role="row"><td class="name"[^>]*><span class="name-row">(?:<span class="aura[^>]*>.*?<\/svg><\/span>)?<span class="name-main"><a class="name-link" href="p\/([a-z0-9-]+)"/g)].map((m) => m[1]);
  assert.deepEqual(shown, [...providers].sort(recommendedCmp).map((p) => p.slug));
});

test('guides: a "Top pick" is always of the guide\'s modality, and the text-LLM guides pick a text LLM', () => {
  const bySlug = new Map(providers.map((p) => [p.slug, p]));
  const byName = new Map(providers.map((p) => [p.name, p]));
  // The embeddings, speech, OCR and image guides are long-form guides with no top pick (long-guides.test.mjs).
  const modalityOf = { 'free-reranking-apis': 'rerank', 'free-vision-apis': 'vision' };
  const dir = join(ROOT, 'site/guides');
  let checked = 0;
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.html'))) {
    const slug = f.replace(/\.html$/, '');
    const html = readFileSync(join(dir, f), 'utf8');
    const m = html.match(/<div class="prov-summary"><h2>Top pick — ([^<]*)<\/h2><p>[\s\S]*?<a href="\.\.\/p\/([a-z0-9-]+)">/);
    if (!m) continue;
    const p = bySlug.get(m[2]);
    assert.ok(p, `${slug}: the pick links a known provider`);
    assert.ok(byName.has(m[1].replace(/&amp;/g, '&')), `${slug}: the pick is named`);
    const modality = modalityOf[slug];
    if (modality) assert.ok((p.modalities || []).includes(modality), `${slug}: ${p.slug} offers ${modality}`);
    else assert.equal(p.is_text_llm, true, `${slug}: ${p.slug} is a text LLM`);
    checked += 1;
  }
  assert.ok(checked >= 3, 'some guides still carry a top pick');
});
