// Integrity tests for the editorial ranking (data/best.json).
// The /best page, the README top-20 and /api/v1/best.json all claim every pick
// is a verified provider with editorial copy. These tests pin that invariant
// to the data and to the shared checker in lib/best.mjs (#165).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bestPickErrors, assertBestPicks, resolveBestEntries } from './lib/best.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data/providers.json');

test('every editorial /best pick is verified and carries why + tag', () => {
  const data = JSON.parse(readFileSync(DATA, 'utf8'));
  const best = JSON.parse(readFileSync(join(ROOT, 'data/best.json'), 'utf8'));
  assert.deepEqual(bestPickErrors(best, data.providers), []);
  const bySlug = new Map(data.providers.map((x) => [x.slug, x]));
  for (const e of best.entries) {
    const p = bySlug.get(e.slug);
    assert.equal(p.verified, true, `${e.slug}: editorial pick must be verified`);
    assert.ok(typeof e.why === 'string' && e.why.trim().length > 0, `${e.slug}: missing why`);
    assert.ok(typeof e.tag === 'string' && e.tag.trim().length > 0, `${e.slug}: missing tag`);
  }
});

test('assertBestPicks rejects an unverified, copy-empty, unknown or duplicate pick', () => {
  const providers = [
    { slug: 'alpha', name: 'Alpha', verified: true },
    { slug: 'beta', name: 'Beta', verified: false },
  ];
  const ok = { entries: [{ slug: 'alpha', why: 'solid free tier', tag: "Editor's pick" }] };
  assert.deepEqual(bestPickErrors(ok, providers), []);
  assert.equal(resolveBestEntries(ok, providers)[0].p.slug, 'alpha');

  const unverified = { entries: [{ slug: 'beta', why: 'looks fine', tag: 'Sleeper' }] };
  assert.match(bestPickErrors(unverified, providers)[0], /not verified/);
  assert.throws(() => assertBestPicks(unverified, providers), /not verified/);

  const noWhy = { entries: [{ slug: 'alpha', why: '   ', tag: "Editor's pick" }] };
  assert.match(bestPickErrors(noWhy, providers)[0], /"why"/);

  const noTag = { entries: [{ slug: 'alpha', why: 'solid free tier', tag: '' }] };
  assert.match(bestPickErrors(noTag, providers)[0], /"tag"/);

  const unknown = { entries: [{ slug: 'ghost', why: 'nope', tag: 'Nope' }] };
  assert.match(bestPickErrors(unknown, providers)[0], /unknown slug: ghost/);

  const dup = { entries: [
    { slug: 'alpha', why: 'one', tag: 'A' },
    { slug: 'alpha', why: 'two', tag: 'B' },
  ] };
  assert.match(bestPickErrors(dup, providers)[0], /more than once/);

  assert.match(bestPickErrors({ entries: [] }, providers)[0], /non-empty entries array/);
});

test('the validator and check-best consume the shared best-pick checker', () => {
  const validate = readFileSync(join(ROOT, 'scripts/validate.mjs'), 'utf8');
  assert.match(validate, /from '\.\/lib\/best\.mjs'/, 'validate.mjs must import lib/best.mjs');
  assert.match(validate, /bestPickErrors/, 'validate.mjs must run bestPickErrors on the real dataset');
  const check = readFileSync(join(ROOT, 'scripts/check-best.mjs'), 'utf8');
  assert.match(check, /from '\.\/lib\/best\.mjs'/, 'check-best.mjs must import lib/best.mjs');
  assert.match(check, /assertBestPicks/, 'check-best.mjs must call assertBestPicks');
});

test('/api/v1/best.json does not expose an unverified pick', () => {
  const p = join(ROOT, 'site/api/v1/best.json');
  if (!existsSync(p)) {
    execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: ROOT, stdio: 'pipe' });
  }
  const payload = JSON.parse(readFileSync(p, 'utf8'));
  assert.ok(payload.picks.length > 0, 'best.json should list editorial picks');
  for (const pick of payload.picks) {
    assert.equal(pick.verified, true, `${pick.slug}: /api/v1/best.json must not expose an unverified pick`);
    assert.ok(pick.why && String(pick.why).trim(), `${pick.slug}: pick is missing why`);
  }
});

// ---------- the FLLMAPIHUB score (lib/score.mjs) ----------
// These pin properties of the method, never a position: a re-verification must not turn CI red
// because a provider moved one place.
import {
  SCORE_WEIGHTS, EDITORIAL_WEIGHT, EDITORIAL_DEFAULT, MATH_INPUTS, TOP_SIZE,
  MIN_CONFIRMED, EDITORIAL_CAP_BASE, EDITORIAL_NOTE_THRESHOLD, STABILITY_MIN_DAYS, STABILITY_MIN_SAMPLES, editorialCap,
  scoreProvider, rankProviders, topProviders, editorialRating, stabilityFromProbe, inputFractions, editorialErrors, isEligible,
} from './lib/score.mjs';

const scoreData = () => JSON.parse(readFileSync(DATA, 'utf8'));
const editorialData = () => JSON.parse(readFileSync(join(ROOT, 'data/editorial.json'), 'utf8'));
const probeData = () => JSON.parse(readFileSync(join(ROOT, 'data/probe-report.json'), 'utf8'));
const NOW = new Date('2026-10-08T12:00:00Z');
// A provider with five of the six inputs confirmed (everything but stability), so it clears the minimum.
const confirmed5 = (over = {}) => blank({ model_tier: 2, card_required: false, phone_required: false, commercial_ok: true, openai_compatible: true, free_limits: { requests_per_day: 100, source: 'https://x.example/', checked: '2026-10-08' }, ...over });
const blank = (over = {}) => ({ slug: 'acme', name: 'Acme', verified: true, last_verified: '2026-10-08', is_text_llm: true, card_required: null, phone_required: null, commercial_ok: null, openai_compatible: null, model_tier: null, ...over });

test('score weights: the six mathematical inputs and the editorial share add up to 100', () => {
  assert.deepEqual(MATH_INPUTS, ['quality', 'limits', 'friction', 'commercial', 'openai', 'stability']);
  assert.equal(Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0), 70);
  assert.equal(EDITORIAL_WEIGHT, 30);
  assert.equal(Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0) + EDITORIAL_WEIGHT, 100);
  assert.equal(TOP_SIZE, 10);
});

test('every score stays inside 0..100 and no part exceeds its weight', () => {
  const ed = editorialData();
  for (const r of rankProviders(scoreData().providers, { editorial: ed, probeReport: probeData(), now: NOW })) {
    assert.ok(r.total >= 0 && r.total <= 100, `${r.slug}: ${r.total}`);
    for (const k of MATH_INPUTS) assert.ok(r.parts[k] >= 0 && r.parts[k] <= SCORE_WEIGHTS[k], `${r.slug}.${k}`);
    assert.ok(r.confirmed >= 0 && r.confirmed <= r.of);
  }
  const top = scoreProvider(blank({ model_tier: 4, card_required: false, phone_required: false, commercial_ok: true, openai_compatible: true, free_limits: { requests_per_day: 10000, tokens_per_day: 10000000, source: 'https://x.example/', checked: '2026-10-08' } }), { editorial: { ratings: { acme: { score: 30 } } }, stability: 1 });
  assert.equal(top.total, 100, 'the best possible provider scores exactly 100');
});

test('being a partner adds nothing: toggling the flag leaves every score identical', () => {
  const ed = editorialData();
  const base = scoreData().providers;
  const run = (partner) => rankProviders(base.map((p) => ({ ...p, partner })), { editorial: ed, probeReport: probeData(), now: NOW }).map((r) => [r.slug, r.total, r.math]);
  assert.deepEqual(run(true), run(false));
  assert.deepEqual(run(undefined), run(false));
  const one = blank();
  assert.equal(scoreProvider({ ...one, partner: true }).total, scoreProvider({ ...one, partner: false }).total);
});

test('deterministic: the same data gives the same order, whatever order it arrives in', () => {
  const ed = editorialData();
  const base = scoreData().providers;
  const order = (list) => rankProviders(list, { editorial: ed, probeReport: probeData(), now: NOW }).map((r) => r.slug);
  assert.deepEqual(order([...base].reverse()), order(base));
  assert.deepEqual(order([...base.slice(20), ...base.slice(0, 20)]), order(base));
  // ties break by the mathematical score, then by name
  const tied = [confirmed5({ slug: 'b', name: 'Beta' }), confirmed5({ slug: 'a', name: 'Alpha' })];
  assert.deepEqual(rankProviders(tied, { now: NOW }).map((r) => r.slug), ['a', 'b']);
});

test('a provider with no editorial rating gets exactly 15, and the file starts everyone at 15', () => {
  assert.equal(EDITORIAL_DEFAULT, 15);
  assert.equal(editorialRating({ ratings: {} }, 'nobody'), 15);
  assert.equal(editorialRating(null, 'nobody'), 15);
  assert.equal(editorialRating({ ratings: { a: { score: 'x' } } }, 'a'), 15, 'a malformed rating falls back to the default');
  assert.equal(editorialRating({ ratings: { a: { score: 31 } } }, 'a'), 15, 'out of range falls back too');
  assert.equal(editorialRating({ ratings: { a: { score: 22 } } }, 'a'), 22);
  const ed = editorialData();
  const { providers } = scoreData();
  assert.equal(ed.default, 15);
  assert.deepEqual(Object.keys(ed.ratings).sort(), providers.map((p) => p.slug).sort(), 'every provider has an entry');
  assert.ok(Object.values(ed.ratings).every((r) => r.score === 15), 'at the start nobody is rated: the editorial part does not discriminate');
  assert.deepEqual(editorialErrors(ed, providers), []);
  assert.ok(editorialErrors({ default: 15, ratings: { ghost: { score: 15 } } }, providers).length > 0, 'a rating for an unknown provider is an error');
  assert.ok(editorialErrors({ default: 15, ratings: { [providers[0].slug]: { score: 31 } } }, providers).length > 0, 'a rating above 30 is an error');
  assert.ok(editorialErrors({ default: 14, ratings: {} }, providers).length > 0, 'the default cannot drift from the constant');
});

test('missing data scores zero, or neutral for the two yes/no requirements, and lowers the confidence', () => {
  const empty = scoreProvider(blank(), { now: NOW });
  assert.equal(empty.parts.quality, 0);
  assert.equal(empty.parts.limits, 0);
  assert.equal(empty.parts.openai, 0);
  assert.equal(empty.parts.stability, 0);
  assert.equal(empty.parts.friction, SCORE_WEIGHTS.friction / 2, 'unknown friction is neither rewarded nor punished');
  assert.equal(empty.parts.commercial, SCORE_WEIGHTS.commercial / 2);
  assert.equal(empty.confirmed, 0);
  const full = scoreProvider(blank({ model_tier: 2, card_required: true, phone_required: false, commercial_ok: false, openai_compatible: true }));
  assert.equal(full.confirmed, 4, 'quality, friction, commercial and openai are confirmed; limits and stability are not');
  assert.equal(inputFractions(blank({ model_tier: 0 })).quality.known, true, 'tier 0 is sourced, unlike null');
  assert.equal(scoreProvider(blank({ model_tier: 0 })).parts.quality, 0);
  // a confirmed requirement subtracts what a confirmed absence adds
  const yes = scoreProvider(blank({ card_required: true })).parts.friction;
  const no = scoreProvider(blank({ card_required: false })).parts.friction;
  assert.ok(no > empty.parts.friction && empty.parts.friction > yes);
  assert.ok(Math.abs((no - empty.parts.friction) - (empty.parts.friction - yes)) < 1e-9, 'symmetric around unknown');
});

test('limits: only published allowances count, per-minute speed is not converted', () => {
  const lim = (fl) => scoreProvider(blank({ free_limits: { ...fl, source: 'https://x.example/', checked: '2026-10-08' } })).parts.limits;
  assert.equal(lim({ requests_per_minute: 300 }), 0, 'a per-minute speed is not an allowance');
  assert.ok(lim({ requests_per_day: 1000 }) > lim({ requests_per_day: 50 }));
  assert.equal(lim({ requests_per_day: 10 }), 0);
  assert.equal(lim({ requests_per_day: 10000 }), SCORE_WEIGHTS.limits);
  assert.equal(lim({ requests_per_day: 100000 }), SCORE_WEIGHTS.limits, 'clamped at the ceiling');
  assert.ok(Math.abs(lim({ requests_per_month: 3000 }) - lim({ requests_per_day: 100 })) < 1e-9, 'a monthly figure counts as its daily share');
  assert.equal(scoreProvider(blank({ free_limits: null })).parts.limits, 0);
});

test('eligibility: verified, within the freshness SLA, and for the top 10 a text LLM', () => {
  assert.equal(isEligible(blank(), NOW), true);
  assert.equal(isEligible(blank({ verified: false, last_verified: null }), NOW), false);
  assert.equal(isEligible(blank({ last_verified: '2026-06-01' }), NOW), false, 'past 90 days');
  assert.equal(isEligible(blank({ last_verified: '2026-07-20' }), NOW), true, 'inside 90 days');
  const list = [confirmed5({ slug: 'llm', name: 'Llm' }), confirmed5({ slug: 'ocr', name: 'Ocr', is_text_llm: false, model_tier: 4 }), confirmed5({ slug: 'old', name: 'Old', last_verified: '2026-01-01' })];
  assert.deepEqual(topProviders(list, { now: NOW }).map((r) => r.slug), ['llm']);
  assert.deepEqual(rankProviders(list, { now: NOW }).map((r) => r.slug).sort(), ['llm', 'ocr'], 'the full ranking keeps non-LLM providers');
  const many = Array.from({ length: 14 }, (_, i) => confirmed5({ slug: `p${i}`, name: `P${String(i).padStart(2, '0')}` }));
  assert.equal(topProviders(many, { now: NOW }).length, 10, 'the top holds at most ten');
  const real = topProviders(scoreData().providers, { editorial: editorialData(), probeReport: probeData(), now: NOW });
  assert.ok(real.length > 0 && real.every((r) => r.provider.is_text_llm === true && r.provider.verified === true));
});

test('stability is null until a real series of probes exists; a single probe report never counts', () => {
  const single = { probed_at: '2026-10-07', results: [{ slug: 'acme', status: 'live' }] };
  assert.equal(stabilityFromProbe(single, 'acme', NOW), null, 'one fresh live probe is not a 30-day series');
  assert.equal(stabilityFromProbe(probeData(), 'acme', NOW), null);
  for (const p of scoreData().providers) assert.equal(stabilityFromProbe(probeData(), p.slug, NOW), null, `${p.slug}: unmeasured today`);
  assert.equal(stabilityFromProbe(null, 'acme', NOW), null);
  assert.equal(stabilityFromProbe({}, 'acme', NOW), null);
  const day = (n) => new Date(NOW.getTime() - n * 86400000).toISOString().slice(0, 10);
  const series = (days, status = 'live') => ({ history: days.map((n) => ({ date: day(n), slug: 'acme', status })) });
  const daily = Array.from({ length: 31 }, (_, i) => i);
  assert.equal(stabilityFromProbe(series(daily), 'acme', NOW), 1, 'a daily series of 31 days, all live');
  assert.equal(stabilityFromProbe(series(daily, 'auth-ok'), 'acme', NOW), 0.5);
  assert.equal(stabilityFromProbe(series(daily, 'error'), 'acme', NOW), 0);
  assert.equal(stabilityFromProbe(series(daily.slice(0, STABILITY_MIN_SAMPLES - 1)), 'acme', NOW), null, 'too few samples');
  assert.equal(stabilityFromProbe(series(Array.from({ length: 20 }, (_, i) => i)), 'acme', NOW), null, 'twenty days do not span thirty');
  assert.equal(stabilityFromProbe(series(daily, 'skipped-no-key'), 'acme', NOW), null, 'probes without a key are not samples');
  assert.equal(stabilityFromProbe(series(daily), 'other', NOW), null);
  assert.equal(STABILITY_MIN_DAYS, 30);
});

test('the minimum: a provider enters the ranking and the top only with at least 4 of the 6 inputs confirmed, and the top is not padded', () => {
  assert.equal(MIN_CONFIRMED, 4);
  const three = confirmed5({ slug: 'three', name: 'Three', model_tier: null, commercial_ok: null }); // friction, openai, nothing else
  assert.equal(scoreProvider(three).confirmed, 3, 'limits, friction and openai');
  const four = confirmed5({ slug: 'four', name: 'Four', model_tier: null });
  assert.equal(scoreProvider(four).confirmed, 4);
  const list = [three, four, confirmed5()];
  assert.deepEqual(rankProviders(list, { now: NOW }).map((r) => r.slug).sort(), ['acme', 'four']);
  assert.deepEqual(topProviders(list, { now: NOW }).map((r) => r.slug).sort(), ['acme', 'four'], 'the top has two entries, not ten');
  assert.deepEqual(rankProviders(list, { now: NOW, minConfirmed: 0 }).map((r) => r.slug).sort(), ['acme', 'four', 'three'], 'review mode lists everyone eligible');
  const real = topProviders(scoreData().providers, { editorial: editorialData(), probeReport: probeData(), now: NOW });
  assert.ok(real.length <= 10 && real.every((r) => r.confirmed >= MIN_CONFIRMED));
  assert.ok(real.length < 10, 'today fewer than ten text-LLM providers have their quality confirmed, and the top says so by being shorter');
});

test('the editorial cap: |rating - 15| <= 15 * confirmed / 6, enforced by clipping', () => {
  assert.equal(EDITORIAL_CAP_BASE, 15);
  assert.equal(editorialCap(6), 15);
  assert.equal(editorialCap(5), 12.5);
  assert.equal(editorialCap(4), 10);
  assert.equal(editorialCap(0), 0);
  assert.equal(editorialCap(9), 15, 'never above the base');
  const ed = (score) => ({ ratings: { acme: { score, note: 'x' } } });
  const five = confirmed5(); // 5 confirmed: cap 12.5
  assert.equal(scoreProvider(five, { editorial: ed(30) }).editorial, 27.5, 'a 30 is clipped to 15 + 12.5');
  assert.equal(scoreProvider(five, { editorial: ed(30) }).editorialClipped, true);
  assert.equal(scoreProvider(five, { editorial: ed(0) }).editorial, 2.5, 'and a 0 to 15 - 12.5');
  assert.equal(scoreProvider(five, { editorial: ed(25) }).editorial, 25, 'inside the cap it is untouched');
  assert.equal(scoreProvider(five, { editorial: ed(25) }).editorialClipped, false);
  const four = confirmed5({ model_tier: null });
  assert.equal(scoreProvider(four, { editorial: ed(30) }).editorial, 25, 'four confirmed: cap 10');
  const none = blank();
  assert.equal(scoreProvider(none, { editorial: ed(30) }).editorial, 15, 'nothing confirmed: the editorial part cannot move at all');
  // for every real provider the deviation never exceeds the cap, whatever the file says
  const wild = { ratings: Object.fromEntries(scoreData().providers.map((p, i) => [p.slug, { score: i % 2 ? 30 : 0, note: 'x' }])) };
  for (const r of rankProviders(scoreData().providers, { editorial: wild, probeReport: probeData(), now: NOW, minConfirmed: 0 })) {
    assert.ok(Math.abs(r.editorial - 15) <= editorialCap(r.confirmed) + 1e-9, `${r.slug}: ${r.editorial}`);
  }
});

test('a rating more than 5 points from the default needs a public note', () => {
  assert.equal(EDITORIAL_NOTE_THRESHOLD, 5);
  const providers = scoreData().providers;
  const slug = providers[0].slug;
  const file = (rating) => ({ default: 15, ratings: { [slug]: rating } });
  assert.deepEqual(editorialErrors(file({ score: 20, note: '' }), providers), [], 'exactly 5 away needs no note');
  assert.deepEqual(editorialErrors(file({ score: 10 }), providers), []);
  assert.equal(editorialErrors(file({ score: 21, note: '' }), providers).length, 1, 'more than 5 away with no note');
  assert.equal(editorialErrors(file({ score: 21 }), providers).length, 1);
  assert.equal(editorialErrors(file({ score: 9, note: '   ' }), providers).length, 1, 'a blank note is no note');
  assert.deepEqual(editorialErrors(file({ score: 21, note: 'Documented reason.' }), providers), []);
  assert.deepEqual(editorialErrors(editorialData(), providers), [], 'the shipped file starts at 15 for everyone');
});

test('a tier near a threshold is flagged and never penalised', () => {
  const near = confirmed5({ model_tier: 4, model_tier_source: { model: 'm', arena_model: 'm', match: 'exact', rating: 1452, ci: [1445, 1460], boundary: true, votes: 2000, snapshot: '2026-10-02', url: 'https://x.example/' } });
  const far = confirmed5({ model_tier: 4, model_tier_source: { ...near.model_tier_source, boundary: undefined } });
  assert.equal(scoreProvider(near).boundary, true);
  assert.equal(scoreProvider(far).boundary, false);
  assert.equal(scoreProvider(near).total, scoreProvider(far).total, 'the flag changes nothing in the score');
});
