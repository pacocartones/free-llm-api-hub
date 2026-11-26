// Provider pages (/p/<slug>) and the 404, audit 2026-11-25: the quickstart right after the free limits (Q3), one history
// entry per day and field with before → after (Q4), suggested comparisons of the same main modality (Q9), meta
// descriptions with the published numbers (Q11), the score as a place and a bar of its inputs (Q13), a useful 404 (Q16).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { historyFromRevisions, collapseSameDay } from './lib/history.mjs';
import { flattenFieldChanges, beforeAfter } from './lib/changes.mjs';
import { comparisonCategory, comparePeers } from './lib/compare.mjs';
import { providerMetaDescription, trimAtWord, compactNumber, shortDate } from './lib/provider-meta.mjs';
import { scoreBlockHtml } from './lib/score-bar.mjs';
import { SCORE_WEIGHTS } from './lib/score.mjs';
import { privateTree } from './lib/private-tree.mjs';

// The page checks read build outputs (site/p and site/404.html are written by the build). The build runs in a private
// copy of the tree, as in build.test.mjs, so it never races the other test files' builds.
const ROOT = privateTree(join(import.meta.dirname, '..'));
before(() => { execFileSync(process.execPath, [join(ROOT, 'scripts/build.mjs')], { cwd: ROOT, stdio: 'pipe' }); });

const base = { slug: 'acme', name: 'Acme', free_tier: 'Free', rate_limits: '10 RPM', notes: 'n0', free_type: 'renewing-quota', commercial_ok: true, card_required: false, phone_required: null, openai_compatible: true };
const rev = (date, over) => ({ date, parsed: { providers: [{ ...base, ...over }] } });

test('history: repeated commits of one day give one entry per field, with the day\'s first "before" and last "after"', () => {
  const { historyBySlug } = historyFromRevisions([
    rev('2026-11-01', {}),
    // five commits on one day: the catch edited four times, a flag flipped and flipped back, the limits changed once
    rev('2026-11-24', { notes: 'n1' }),
    rev('2026-11-24', { notes: 'n2', commercial_ok: null }),
    rev('2026-11-24', { notes: 'n3', commercial_ok: true }),
    rev('2026-11-24', { notes: 'n4', rate_limits: '30 RPM' }),
    rev('2026-11-24', { notes: 'n4', rate_limits: '30 RPM' }), // no change at all
    rev('2026-11-25', { notes: 'n4', rate_limits: '30 RPM', card_required: null }),
  ]);
  const events = historyBySlug.acme;
  assert.deepEqual(events.map((e) => [e.date, e.kind]), [['2026-11-01', 'added'], ['2026-11-24', 'changed'], ['2026-11-25', 'changed']]);
  const day = events[1];
  assert.deepEqual(day.fields, ['rate_limits', 'notes'], 'one entry per field, in the HISTORY_FIELDS order; the flag that came back is gone');
  assert.deepEqual(day.changes, [{ field: 'rate_limits', from: '10 RPM', to: '30 RPM' }, { field: 'notes', from: 'n0', to: 'n4' }]);
  assert.equal(day.text, 'Updated rate limits, the catch');
  // the change feed and the monthly counts read the same history: 3 field changes, not 6
  assert.equal(flattenFieldChanges(historyBySlug).length, 3);
  // a day whose only change was undone the same day leaves no event
  const undone = collapseSameDay([
    { date: '2026-11-24', kind: 'changed', fields: ['card_required'], text: 'x', changes: [{ field: 'card_required', from: false, to: true }] },
    { date: '2026-11-24', kind: 'changed', fields: ['card_required'], text: 'x', changes: [{ field: 'card_required', from: true, to: false }] },
  ]);
  assert.deepEqual(undone, []);
});

test('history: a limits or flag change spells out before → after; paragraphs keep their label only', () => {
  const e = { kind: 'changed', changes: [{ field: 'notes', from: 'a', to: 'b' }, { field: 'rate_limits', from: '10 RPM', to: '30 RPM' }, { field: 'commercial_ok', from: true, to: null }] };
  assert.deepEqual(beforeAfter(e), [{ label: 'rate limits', from: '10 RPM', to: '30 RPM' }, { label: 'commercial-use terms', from: 'yes', to: 'unknown' }]);
  assert.deepEqual(beforeAfter({ kind: 'added' }), []);
});

test('the built Groq page: one history entry per day, and its limits change shows before → after', () => {
  const html = readFileSync(join(ROOT, 'site/p/groq.html'), 'utf8');
  const list = html.slice(html.indexOf('<h2>Change history</h2>'));
  const dates = [...list.matchAll(/<li class="upd"><span class="upd-date">(\d{4}-\d{2}-\d{2})<\/span>/g)].map((m) => m[1]);
  assert.ok(dates.length > 1);
  assert.equal(new Set(dates).size, dates.length, 'no day appears twice');
  assert.match(list, /<ul class="upd-diff"><li><span class="upd-field">rate limits:<\/span> <del>[^<]+<\/del> → <ins>[^<]+<\/ins><\/li>/);
});

test('Q3: the quickstart follows the free limits, before speed, data policy and the about text', () => {
  for (const slug of ['groq', 'google-gemini', 'jina-ai']) {
    const html = readFileSync(join(ROOT, `site/p/${slug}.html`), 'utf8');
    const at = (re) => { const m = html.match(re); return m ? m.index : -1; };
    const quick = at(/<h2 id="quickstart">/);
    assert.ok(quick > 0, `${slug}: a quickstart`);
    assert.ok(at(/<h2 id="whats-free">/) < quick, `${slug}: after what's free`);
    const limits = at(/<h2[^>]*>Free limits/);
    if (limits > 0) assert.ok(limits < quick, `${slug}: after the free limits`);
    for (const later of [/<h2[^>]*>Published speed/, /<h2[^>]*>Data policy/, /<h2[^>]*>About /]) {
      const i = at(later);
      if (i > 0) assert.ok(quick < i, `${slug}: the quickstart comes before ${later}`);
    }
  }
});

test('Q9: the main modality respects is_text_llm, and suggested comparisons share it', () => {
  assert.equal(comparisonCategory({ is_text_llm: true, modalities: ['text', 'audio'] }), 'text');
  assert.equal(comparisonCategory({ is_text_llm: false, modalities: ['text', 'image', 'embeddings', 'rerank'] }), 'embeddings', 'Jina AI is an embeddings API');
  assert.equal(comparisonCategory({ modalities: ['ocr', 'text'] }), 'ocr');
  assert.equal(comparisonCategory({ is_text_llm: false, modalities: ['text'] }), 'text');
  assert.equal(comparisonCategory({ modalities: [] }), null);
  const llm = (slug, extra = {}) => ({ slug, name: slug, verified: true, is_text_llm: true, modalities: ['text'], category: 'ongoing', free_type: 'renewing-quota', ...extra });
  const groq = llm('groq', { published_speed: [{}] });
  const peers = comparePeers(groq, [
    groq, llm('fast', { published_speed: [{}], category: 'trial', free_type: 'trial-credit' }), llm('plain'),
    { slug: 'jina', name: 'jina', verified: true, is_text_llm: false, modalities: ['text', 'embeddings'] },
    llm('unverified', { verified: false, published_speed: [{}] }),
  ], { staticPaths: new Set(['plain-vs-groq']), limit: 3 });
  assert.deepEqual(peers.map((x) => [x.other.slug, x.path]), [['fast', null], ['plain', 'plain-vs-groq']], 'same modality only, speed peers first, the published page when there is one');
  const providers = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8')).providers;
  const bySlug = new Map(providers.map((p) => [p.slug, p]));
  for (const slug of ['groq', 'jina-ai', 'google-gemini', 'deepgram']) {
    const html = readFileSync(join(ROOT, `site/p/${slug}.html`), 'utf8');
    const block = html.slice(html.indexOf('<h2>Compare</h2>'), html.indexOf('</div>', html.indexOf('<h2>Compare</h2>')));
    const others = [...block.matchAll(/href="\.\.\/compare\/(?:\?compare=[a-z0-9-]+,([a-z0-9-]+)|([a-z0-9-]+)-vs-([a-z0-9-]+)\/)"/g)]
      .map((m) => m[1] || (m[2] === slug ? m[3] : m[2]));
    for (const o of others) assert.equal(comparisonCategory(bySlug.get(o)), comparisonCategory(bySlug.get(slug)), `${slug} suggests ${o} of the same main modality`);
  }
  assert.doesNotMatch(readFileSync(join(ROOT, 'site/p/groq.html'), 'utf8').split('<h2>Compare</h2>')[1].split('</div>')[0], /jina-ai/, 'Groq no longer suggests Jina AI');
});

test('Q11: the meta description leads with the published limits, else trims the free tier at a word', () => {
  assert.equal(compactNumber(1000), '1,000');
  assert.equal(compactNumber(14400), '14.4K');
  assert.equal(compactNumber(200000), '200K');
  assert.equal(compactNumber(1500000), '1.5M');
  assert.equal(shortDate('2026-11-24'), '24 Nov 2026');
  const groq = { name: 'Groq', verified: true, last_verified: '2026-11-24', card_required: false, free_tier: 'x', free_limits: { requests_per_minute: 30, requests_per_day: 1000, tokens_per_day: 200000, checked: '2026-11-24' } };
  assert.equal(providerMetaDescription(groq), 'Groq free tier: 30 RPM, 1,000 RPD, 200K TPD, no card. Verified 24 Nov 2026 with source.');
  assert.equal(providerMetaDescription({ ...groq, card_required: null }), 'Groq free tier: 30 RPM, 1,000 RPD, 200K TPD. Verified 24 Nov 2026 with source.', 'an unknown card requirement says nothing');
  const long = 'word '.repeat(60).trim();
  const out = providerMetaDescription({ name: 'Acme', free_tier: long });
  assert.ok(out.length <= 160 && out.endsWith('…') && !/ wor…$/.test(out) && /word…$/.test(out), 'cut at a word boundary');
  assert.equal(trimAtWord('short text'), 'short text');
  const html = readFileSync(join(ROOT, 'site/p/groq.html'), 'utf8');
  assert.match(html, /<meta name="description" content="Groq free tier: [^"]*RPM[^"]*\. Verified \d{1,2} [A-Z][a-z]{2} \d{4} with source\.">/);
});

test('Q13: the score reads as a place with a bar of its six inputs, unknowns in grey', () => {
  const fractions = { quality: { frac: 0.75, known: true }, limits: { frac: 0, known: false }, friction: { frac: 0.5, known: true }, commercial: { frac: 0.5, known: false }, openai: { frac: 1, known: true }, stability: { frac: 0, known: false } };
  const out = scoreBlockHtml({ position: 1, of: 69, total: 62.4, editorial: 15, fractions, weights: SCORE_WEIGHTS, topRank: 1 });
  assert.match(out, /<strong>#1 of 69<\/strong> scored <span class="muted">\(62\.4 \/ 100\)<\/span>/);
  assert.equal((out.match(/class="sb-seg/g) || []).length, 6, 'six segments');
  assert.equal((out.match(/class="sb-seg sb-unknown"/g) || []).length, 3, 'the three unknown inputs are grey');
  assert.match(out, /style="flex-grow:22"><span class="sb-fill" style="width:75%">/, 'a segment is as wide as its weight and filled as far as earned');
  assert.match(out, /Unknowns lower the score on purpose/);
  assert.match(out, /role="img" aria-label="Score inputs: Model quality 16\.5 of 22; Free limits not confirmed, 0 of 18;/);
  const html = readFileSync(join(ROOT, 'site/p/groq.html'), 'utf8');
  assert.match(html, /<p class="score-rank"><strong>#\d+ of \d+<\/strong> scored/);
  assert.doesNotMatch(html, /<span class="best-score" title="Out of 100">/, 'no bare "N / 100" badge');
});

test('Q16: the 404 offers a search that lands on the explorer and six popular providers', () => {
  const html = readFileSync(join(ROOT, 'site/404.html'), 'utf8');
  assert.match(html, /<form class="nf-search" action="\/" method="get" role="search"><label for="nf-q">[^<]+<\/label><input type="search" id="nf-q" name="q"/);
  const nav = html.match(/<nav class="colls" aria-label="Popular providers">([\s\S]*?)<\/nav>/);
  assert.ok(nav, 'the popular providers');
  assert.equal((nav[1].match(/<a href="\/p\/[a-z0-9-]+">/g) || []).length, 6, 'six root-absolute provider links');
});
