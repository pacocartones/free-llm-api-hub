// Freshness histogram (lib/freshness-histogram.mjs) and the staggered weekly
// plan (lib/pacing.mjs weeklyPlan / clusterPullAge).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { freshnessHistogram, histogramMarkdown, weekStart, CLUSTER_LIMIT, HISTOGRAM_WEEKS } from './lib/freshness-histogram.mjs';
import { weeklyPlan, clusterPullAge, PACE_FLOOR, MIN_PULL_AGE, MIN_AGE_DAYS, WEEKLY_CAP } from './lib/pacing.mjs';
import { ageInDays, freshnessStatus, SLA_DAYS } from './lib/rules.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DAY = 86400000;
const iso = (d) => d.toISOString().slice(0, 10);
const entry = (slug, last_verified) => ({ slug, name: slug, verified: true, last_verified });

test('weekStart is the UTC Monday of the ISO week', () => {
  assert.equal(iso(weekStart(new Date('2026-11-30T00:00:00Z'))), '2026-11-30'); // Monday
  assert.equal(iso(weekStart(new Date('2026-12-06T23:59:00Z'))), '2026-11-30'); // Sunday
  assert.equal(iso(weekStart(new Date('2026-12-07T00:00:00Z'))), '2026-12-07');
});

test('histogram buckets agree with freshnessStatus at the day 60/61 and 90/91 boundaries', () => {
  // Verified on 2026-11-04: day 61 is Monday 2027-01-04, so day 60 falls in the week before.
  const verified = '2026-11-04';
  const h = freshnessHistogram([entry('x', verified)], new Date('2026-11-02T00:00:00Z'), { weeks: 20 });
  const due = new Date(Date.parse(verified + 'T00:00:00Z') + 61 * DAY);
  const stale = new Date(Date.parse(verified + 'T00:00:00Z') + 91 * DAY);
  assert.equal(freshnessStatus(ageInDays(verified, new Date(+due - DAY))), 'fresh'); // day 60
  assert.equal(freshnessStatus(ageInDays(verified, due)), 'due'); // day 61
  assert.equal(freshnessStatus(ageInDays(verified, new Date(+stale - DAY))), 'due'); // day 90
  assert.equal(freshnessStatus(ageInDays(verified, stale)), 'stale'); // day 91
  const dueRow = h.rows.findIndex((r) => r.due);
  const staleRow = h.rows.findIndex((r) => r.stale);
  assert.equal(h.rows[dueRow].week, iso(due));
  assert.equal(h.rows[staleRow].week, iso(weekStart(stale)));
  // Day 60 is the Sunday before: a different (earlier) week.
  assert.equal(iso(weekStart(new Date(+due - DAY))), h.rows[dueRow - 1].week);
});

test('histogram counts entries already due before the window and ignores unverified ones', () => {
  const from = new Date('2026-12-07T00:00:00Z');
  const h = freshnessHistogram([
    entry('old', '2026-08-01'), // due 10-01, stale 10-31: both before the window
    entry('due-only', '2026-10-01'), // due 12-01 (before), stale 12-31 (in window)
    { slug: 'u', name: 'u', verified: false, last_verified: null },
    entry('bad', 'not-a-date'),
  ], from);
  assert.equal(h.rows.length, HISTOGRAM_WEEKS);
  assert.equal(h.dueBefore, 2);
  assert.equal(h.staleBefore, 1);
  assert.equal(h.rows.reduce((n, r) => n + r.stale, 0), 1);
  assert.match(histogramMarkdown(h), /Already due when the window opens: 2 \(of which 1 overdue\)/);
});

test('a week with more than the cluster limit is flagged', () => {
  const many = Array.from({ length: CLUSTER_LIMIT + 1 }, (_, i) => entry(`c${i}`, '2026-11-19'));
  const h = freshnessHistogram([...many, entry('solo', '2026-11-25')], new Date('2026-11-23T00:00:00Z'));
  assert.equal(h.clustered, 1);
  const row = h.rows.find((r) => r.clustered);
  assert.equal(row.week, '2027-01-18');
  assert.equal(row.due, CLUSTER_LIMIT + 1);
  const exact = freshnessHistogram(many.slice(1), new Date('2026-11-23T00:00:00Z'));
  assert.equal(exact.clustered, 0, `exactly ${CLUSTER_LIMIT} is not a cluster`);
});

test('the histogram does not depend on the weekday it is computed on', () => {
  const data = [entry('a', '2026-11-19'), entry('b', '2026-11-20'), entry('c', '2026-11-24')];
  const mon = freshnessHistogram(data, new Date('2026-11-23T00:00:00Z'));
  const sun = freshnessHistogram(data, new Date('2026-11-29T22:00:00Z'));
  assert.deepEqual(mon, sun);
});

test('clusterPullAge: no cluster means no pull-forward', () => {
  assert.equal(clusterPullAge(Array(CLUSTER_LIMIT).fill(11)), Infinity);
  assert.equal(clusterPullAge([]), Infinity);
});

test('clusterPullAge: entries due up to the last clustered week may go early, never younger than the floor', () => {
  // 9 entries 11 days old reach day 61 in 50 days: window 7 (days 49–55 from now).
  const ages = [...Array(9).fill(11), 16, 5];
  const min = clusterPullAge(ages);
  assert.equal(min, MIN_PULL_AGE); // 61 - 56 + 1 = 6, floored at 7
  // 9 entries 40 days old reach day 61 in 21 days: window 3 (days 21–27), so ages 34 and up qualify.
  assert.equal(clusterPullAge(Array(9).fill(40)), 34);
});

test('weeklyPlan never asks for less than the approved pace when enough entries qualify', () => {
  const ages = Array.from({ length: 40 }, (_, i) => 30 + (i % 20));
  const plan = weeklyPlan(ages.map((age, i) => ({ slug: `e${i}`, age })), (e) => e.age, SLA_DAYS);
  assert.equal(plan.size, PACE_FLOOR);
  assert.equal(plan.batch.length, PACE_FLOOR);
  assert.equal(plan.pulling, false);
  assert.equal(plan.minAge, MIN_AGE_DAYS);
});

test('weeklyPlan is deterministic: ties are broken by slug, not by input order', () => {
  const entries = Array.from({ length: 20 }, (_, i) => ({ slug: `s${String(19 - i).padStart(2, '0')}`, age: 12 }));
  const a = weeklyPlan(entries, (e) => e.age, SLA_DAYS).batch.map((e) => e.slug);
  const b = weeklyPlan([...entries].reverse(), (e) => e.age, SLA_DAYS).batch.map((e) => e.slug);
  assert.deepEqual(a, b);
  assert.deepEqual(a, ['s00', 's01', 's02', 's03', 's04', 's05']);
});

// Do every weekly batch on the real dataset and check the promises of the
// plan: nothing goes stale, and nine weeks in (from 2027-01-31 when the
// simulation starts on 2026-11-30, the first approved week) no week has more
// than CLUSTER_LIMIT entries becoming due. The start moves to the Monday after
// the newest verification so the test keeps meaning something as data changes.
test('real dataset: weekly batches at the approved pace remove the February cliff', () => {
  const { providers } = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8'));
  const ps = providers.map((p) => ({ ...p }));
  const newest = ps.filter((p) => p.verified && p.last_verified).map((p) => p.last_verified).sort().at(-1);
  const first = new Date('2026-11-30T09:17:00Z');
  const afterNewest = new Date(+weekStart(new Date(newest + 'T00:00:00Z')) + 7 * DAY + (9 * 60 + 17) * 60000);
  const start = afterNewest > first ? afterNewest : first;
  for (let w = 0; w < 18; w++) {
    const now = new Date(+start + w * 7 * DAY);
    const verified = ps.filter((p) => p.verified && p.last_verified);
    const ageOf = (p) => ageInDays(p.last_verified, now);
    const plan = weeklyPlan(verified, ageOf, SLA_DAYS);
    assert.ok(plan.batch.length <= WEEKLY_CAP);
    assert.ok(verified.every((p) => freshnessStatus(ageOf(p)) !== 'stale'), `nothing stale on ${iso(now)}`);
    for (const p of plan.batch) p.last_verified = iso(now);
  }
  const after = freshnessHistogram(ps, new Date(+start + 9 * 7 * DAY), { weeks: 20 });
  assert.equal(after.clustered, 0, after.rows.map((r) => `${r.week}:${r.due}`).join(' '));
});

test('coverage page section: one row per week, clusters marked, nothing without a histogram', async () => {
  const { freshnessHistogramHtml } = await import('./lib/coverage.mjs');
  assert.equal(freshnessHistogramHtml(null, { repo: 'https://example.test/r' }), '');
  const many = Array.from({ length: CLUSTER_LIMIT + 1 }, (_, i) => entry(`c${i}`, '2026-11-19'));
  const h = { ...freshnessHistogram(many, new Date('2026-11-24T00:00:00Z')), limit: CLUSTER_LIMIT };
  const html = freshnessHistogramHtml(h, { repo: 'https://example.test/r' });
  assert.match(html, /<h2 id="freshness">/);
  assert.equal((html.match(/<tr[ >]/g) || []).length, HISTOGRAM_WEEKS + 1);
  assert.equal((html.match(/class="cov-cluster"/g) || []).length, 1);
  assert.match(html, /<th scope="row">2027-01-18<\/th><td class="num">9 <span class="muted">\(cluster\)<\/span>/);
  assert.match(html, /href="https:\/\/example\.test\/r\/issues\/4"/);
  assert.match(html, /href="\.\.\/quality\/#freshness-weeks"/, 'links the backward-looking view on /quality/');
  assert.match(html, /href="\.\.\/quality\/#freshness-weeks"/);
});

test('/coverage/ and /quality/ agree: every verified entry is counted once in each freshness view', async () => {
  const { quality } = await import('./lib/quality.mjs');
  const { providers, generated } = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8'));
  const asOf = providers.map((p) => p.last_verified).filter(Boolean).concat(generated).sort().at(-1);
  const q = quality(providers, asOf);
  // Wide enough that every due date lands inside the window or before it.
  const h = freshnessHistogram(providers, new Date(q.freshness.firstWeek + 'T00:00:00Z'), { weeks: 40 });
  const verifiedCount = q.freshness.weeks.reduce((n, w) => n + w.count, 0) + q.freshness.earlier;
  assert.equal(h.rows.reduce((n, r) => n + r.due, 0) + h.dueBefore, verifiedCount);
  // Each /quality/ week's due date range falls in the /coverage/ weeks that count those entries.
  for (const w of q.freshness.weeks.filter((x) => x.count)) {
    assert.ok(h.rows.some((r) => r.week === iso(weekStart(new Date(w.dueFrom + 'T00:00:00Z'))) && r.due > 0), `due week of ${w.start}`);
  }
});
