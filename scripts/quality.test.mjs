import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { privateTree } from './lib/private-tree.mjs';
import { quality, qualityMainHtml, weekStart, percent1 } from './lib/quality.mjs';

// The public /quality/ page (roadmap F5): every number comes from the data, dated by the dataset's as-of day.
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = privateTree(REPO);
const SITE = 'https://freellmapihub.com';
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

before(() => { execFileSync(process.execPath, [join(ROOT, 'scripts/build.mjs')], { cwd: ROOT, stdio: 'pipe' }); });

// A small dataset whose every count is written out by hand below.
const base = { modalities: ['text'], is_text_llm: true, free_type: 'renewing-quota', verified: true };
const FIXTURE = [
  // fresh (age 0), all flags stated, full fine print
  { ...base, slug: 'a', last_verified: '2026-11-25', card_required: false, phone_required: false, commercial_ok: true, openai_compatible: true,
    field_checks: { card_required: { status: 'stated', checked: '2026-11-25', sources: ['https://a.example/'] } },
    data_policy: { trains_on_prompts: false, retention: '30 days', source: 'https://a.example/', checked: '2026-11-25' },
    free_limits: { requests_per_day: 10, scope: 'all', source: 'https://a.example/', checked: '2026-11-25' }, models_free: ['m1', 'm2'] },
  // due (age 61): phone null with a reason, commercial null unchecked; data_policy recorded without retention; free_limits null
  { ...base, slug: 'b', last_verified: '2026-09-25', card_required: true, phone_required: null, commercial_ok: null, openai_compatible: true,
    field_checks: { phone_required: { status: 'source_silent', checked: '2026-09-25', sources: ['https://b.example/'] } },
    data_policy: { trains_on_prompts: true, retention: null, source: 'https://b.example/', checked: '2026-09-25' },
    free_limits: null, models_free: ['m2', 'm3'] },
  // stale (age 91): a trial credit (outside the free_limits population), data_policy null, no models
  { ...base, slug: 'c', free_type: 'trial-credit', last_verified: '2026-08-26', card_required: null, phone_required: true, commercial_ok: false, openai_compatible: null,
    field_checks: { card_required: { status: 'needs_account', checked: '2026-08-26', sources: ['https://c.example/'] } },
    data_policy: null, models_free: [] },
  // a verified non-text provider (speech): outside every text-LLM population
  { slug: 'd', modalities: ['audio'], is_text_llm: false, free_type: 'perpetual', verified: true, last_verified: '2026-11-24',
    card_required: false, phone_required: false, commercial_ok: true, openai_compatible: false },
  // an embeddings provider: text modality, but not a text LLM
  { slug: 'e', modalities: ['text', 'embeddings'], is_text_llm: false, free_type: 'perpetual', verified: true, last_verified: '2026-11-23',
    card_required: false, phone_required: null, commercial_ok: null, openai_compatible: true,
    field_checks: { commercial_ok: { status: 'sources_disagree', checked: '2026-11-23', sources: ['https://e.example/1', 'https://e.example/2'], note: 'x' } } },
  // unverified: no age, in no verified population; its text LLM has no data_policy key at all
  { ...base, slug: 'f', verified: false, last_verified: null, card_required: null, phone_required: null, commercial_ok: null, openai_compatible: null },
];
const ASOF = '2026-11-25';

test('weekStart is the Monday (UTC) of the week', () => {
  assert.equal(weekStart('2026-11-25'), '2026-11-23'); // a Wednesday
  assert.equal(weekStart('2026-11-23'), '2026-11-23'); // a Monday
  assert.equal(weekStart('2026-11-29'), '2026-11-23'); // a Sunday
  assert.equal(weekStart('2027-01-01'), '2026-12-28'); // across a year
});

test('verified share and freshness buckets follow freshnessStatus: day 61 is due, day 91 is stale', () => {
  const q = quality(FIXTURE, ASOF);
  assert.deepEqual([q.total, q.verified, q.unverified], [6, 5, 1]);
  assert.deepEqual([q.freshness.fresh, q.freshness.due, q.freshness.stale], [3, 1, 1]);
  assert.deepEqual([q.freshness.oldest, q.freshness.newest], ['2026-08-26', '2026-11-25']);
});

test('the week histogram runs from the oldest verification week to the as-of week, capped at 16 weeks', () => {
  const q = quality(FIXTURE, ASOF);
  const w = q.freshness.weeks;
  assert.equal(w.length, 14, 'from the week of 2026-08-24 to the week of 2026-11-23');
  assert.equal(w[0].start, '2026-08-24');
  assert.equal(w[w.length - 1].start, '2026-11-23');
  assert.equal(w.reduce((n, x) => n + x.count, 0), 5, 'every verified entry is in one week');
  const last = w[w.length - 1];
  assert.deepEqual([last.count, last.dueFrom, last.dueTo, last.staleFrom], [3, '2027-01-23', '2027-01-25', '2027-02-22']);
  assert.equal(q.freshness.earlier, 0);
  // An entry older than 16 weeks is counted in `earlier`, not in a row.
  const old = quality([...FIXTURE, { ...base, slug: 'g', last_verified: '2026-01-05' }], ASOF);
  assert.equal(old.freshness.weeks.length, 16);
  assert.equal(old.freshness.earlier, 1);
  assert.equal(old.freshness.firstWeek, '2026-08-10');
});

test('tri-state flags: answered, null with a reason, not checked, over all verified providers', () => {
  const byKey = Object.fromEntries(quality(FIXTURE, ASOF).flags.map((f) => [f.key, f]));
  const pick = (f) => [f.total, f.answered, f.withReason, f.unchecked];
  assert.deepEqual(pick(byKey.card_required), [5, 4, 1, 0]);
  assert.deepEqual([byKey.card_required.stated, byKey.card_required.unsourced, byKey.card_required.needs_account], [1, 3, 1]);
  assert.deepEqual(pick(byKey.phone_required), [5, 3, 1, 1]);
  assert.deepEqual(pick(byKey.commercial_ok), [5, 3, 1, 1]);
  assert.equal(byKey.commercial_ok.sources_disagree, 1);
  assert.deepEqual(pick(byKey.openai_compatible), [5, 4, 0, 1]);
  for (const f of Object.values(byKey)) assert.equal(f.answered + f.withReason + f.unchecked, f.total, `${f.key}: the three states add up`);
});

test('data_policy, free_limits and models_free use the populations of /coverage/', () => {
  const q = quality(FIXTURE, ASOF);
  // verified text LLMs: a, b, c
  assert.deepEqual(q.dataPolicy, { population: 'verified text LLMs', total: 3, recorded: 2, trainsKnown: 2, retentionKnown: 1, notRecorded: 1 });
  // verified text LLMs that are not trial credits: a, b
  assert.deepEqual([q.freeLimits.total, q.freeLimits.published, q.freeLimits.noneRecorded, q.freeLimits.absent], [2, 1, 1, 0]);
  assert.deepEqual([q.modelsFree.total, q.modelsFree.withSample, q.modelsFree.distinctModels], [3, 2, 3]);
});

test('the non-text ratio has two figures, each with its definition', () => {
  const q = quality(FIXTURE, ASOF);
  assert.deepEqual([q.nonText.noTextModality, q.nonText.notTextLlm, q.nonText.total, q.nonText.limitPct], [1, 2, 6, 35]);
  assert.equal(percent1(24, 70), '34.3');
  assert.equal(percent1(0, 0), '0.0');
});

test('the page markup puts every figure in a captioned table, with no script', () => {
  const html = qualityMainHtml(quality(FIXTURE, ASOF), { prefix: '../', repo: 'https://github.com/x/y' });
  assert.ok((html.match(/<table/g) || []).length >= 6, 'every figure is in a table');
  assert.equal((html.match(/<table/g) || []).length, (html.match(/<caption/g) || []).length, 'every table has a caption');
  assert.match(html, /<td class="q-barcell" aria-hidden="true">/, 'the bars are decoration');
  assert.match(html, /href="\.\.\/coverage\/"/, 'it links the task board instead of repeating it');
  assert.doesNotMatch(html, /<script/, 'no script');
});

// ---------- the built page, against an independent recount of data/providers.json ----------

test('/quality/ shows the numbers of a separate recount of the committed data', () => {
  const data = JSON.parse(read('data/providers.json'));
  const P = data.providers;
  const html = read('site/quality/index.html');
  const asOf = html.match(/Data of (\d{4}-\d{2}-\d{2})/)[1];
  const verified = P.filter((p) => p.verified === true && p.last_verified);
  assert.ok(html.includes(`Verified against the provider's own docs</th><td class="num">${verified.length} of ${P.length}</td>`), 'verified share');
  const age = (p) => Math.floor((Date.parse(asOf + 'T00:00:00Z') - Date.parse(p.last_verified + 'T00:00:00Z')) / 86400000);
  const fresh = verified.filter((p) => age(p) <= 60).length;
  const stale = verified.filter((p) => age(p) > 90).length;
  assert.ok(html.includes(`Fresh (60 days or less)</th><td class="num">${fresh} of ${verified.length}</td>`), 'fresh');
  assert.ok(html.includes(`Stale (over 90 days)</th><td class="num">${stale} of ${verified.length}</td>`), 'stale');
  for (const key of ['card_required', 'phone_required', 'commercial_ok', 'openai_compatible']) {
    const known = verified.filter((p) => p[key] !== null && p[key] !== undefined).length;
    const reason = verified.filter((p) => p[key] === null && ['source_silent', 'needs_account', 'sources_disagree'].includes(p.field_checks?.[key]?.status)).length;
    const m = html.match(new RegExp(`<th scope="row"><code>${key}</code></th><td class="num">(\\d+) of (\\d+)</td><td class="num">\\d+%</td><td class="num">(\\d+) of \\d+</td><td class="num">\\d+%</td><td class="num">(\\d+) of \\d+</td>`));
    assert.ok(m, `${key}: its row is on the page`);
    assert.deepEqual([+m[1], +m[2], +m[3], +m[4]], [known, verified.length, reason, verified.length - known - reason], key);
  }
  const noText = P.filter((p) => !p.modalities.includes('text')).length;
  assert.ok(html.includes(`<td class="num">${noText} of ${P.length}</td><td class="num">${(100 * noText / P.length).toFixed(1)}%</td>`), 'non-text ratio, as docs/inclusion-criteria.md computes it');
  const text = verified.filter((p) => p.is_text_llm === true);
  const dp = text.filter((p) => p.data_policy && typeof p.data_policy === 'object').length;
  assert.ok(html.includes(`Recorded from the provider's own terms</th><td class="num">${dp} of ${text.length}</td>`), 'data_policy');
  const weekTotal = [...html.matchAll(/<tr><th scope="row">\d{4}-\d{2}-\d{2}<\/th><td class="num">(\d+)<\/td>/g)].reduce((n, m) => n + +m[1], 0);
  const earlier = +(html.match(/(\d+) verified entr(?:y was|ies were) last verified before/)?.[1] || 0);
  assert.equal(weekTotal + earlier, verified.length, 'the histogram holds every verified entry');
});

test('/quality/ is in the sitemap (behind the sitemap index), linked from the footer and the methodology, and has WebPage structured data', () => {
  const html = read('site/quality/index.html');
  assert.match(html, /<link rel="canonical" href="https:\/\/freellmapihub\.com\/quality\/">/);
  assert.match(read('site/sitemap.xml'), /<loc>https:\/\/freellmapihub\.com\/quality\/<\/loc>/);
  assert.match(read('site/sitemap-index.xml'), /<loc>https:\/\/freellmapihub\.com\/sitemap\.xml<\/loc>/);
  assert.match(read('site/index.html'), /<a href="quality\/">Data quality<\/a>/, 'the home footer');
  assert.match(read('site/p/groq.html'), /<a href="\.\.\/quality\/">Data quality<\/a>/, 'the footer of a generated page');
  assert.match(read('site/methodology/index.html'), /href="https:\/\/freellmapihub\.com\/quality\/"/, 'the methodology');
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.deepEqual(ld['@graph'].map((n) => n['@type']), ['WebPage', 'BreadcrumbList']);
  assert.equal(ld['@graph'][0].url, `${SITE}/quality/`);
  // The same site and dataset nodes as every other page (#764): stable @id, publisher and creator.
  const page = ld['@graph'][0];
  assert.deepEqual([page.isPartOf['@id'], page.about['@id']], [`${SITE}/#website`, `${SITE}/#dataset`]);
  for (const r of [page.isPartOf, page.about]) {
    assert.equal(r.publisher['@id'], `${SITE}/#publisher`);
    assert.equal(r.creator['@id'], `${SITE}/#creator`);
  }
  assert.deepEqual(ld['@graph'][1].itemListElement.map((i) => i.item), [`${SITE}/`, `${SITE}/quality/`]);
  assert.doesNotMatch(html.replace(/<script type="application\/(ld\+)?json"[\s\S]*?<\/script>/g, ''), /<script[^>]+src="https?:/, 'no external script');
});
