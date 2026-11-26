// quality.mjs — the public /quality/ page: how much of the dataset is verified, how fresh it is, and how many of
// its answers are known, null with a recorded reason, or not checked yet.
//
// Every number is computed here from data/providers.json, dated by the dataset's own as-of day (datasetAsOf), never
// by the clock, so the page is byte-stable for a given dataset and can sit under the drift gate. The per-field task
// board stays on /coverage/ (lib/coverage.mjs); this page reuses its populations and links there for the open items.

import { escapeHtml } from './html.mjs';
import { FIELD_CHECK_FIELDS, fieldCheckCounts } from './field-checks.mjs';
import { COVERAGE_FIELDS, percent } from './coverage.mjs';
import { SLA_DAYS, DUE_SOON_DAYS, freshnessStatus } from './rules.mjs';

/** Weeks shown in the freshness histogram, counting back from the as-of week. 16 weeks cover the 90-day SLA. */
export const QUALITY_WEEKS = 16;
/** The editorial guardrail of docs/inclusion-criteria.md: providers without `text` in modalities stay at or under this share. */
export const NON_TEXT_LIMIT_PCT = 35;

const DAY_MS = 86400000;
const dayMs = (iso) => Date.parse(String(iso) + 'T00:00:00Z');
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const addDays = (iso, n) => isoDay(dayMs(iso) + n * DAY_MS);
/** The Monday (UTC) of the week that holds an ISO day. */
export const weekStart = (iso) => {
  const ms = dayMs(iso);
  const dow = (new Date(ms).getUTCDay() + 6) % 7; // Monday = 0
  return isoDay(ms - dow * DAY_MS);
};

const popOf = (key) => COVERAGE_FIELDS.find((f) => f.key === key);
const isVerified = (p) => p.verified === true && typeof p.last_verified === 'string' && !Number.isNaN(dayMs(p.last_verified));

/**
 * Every number of the page, from the providers and the as-of day (YYYY-MM-DD).
 * Ages are whole days from last_verified to asOf, graded with freshnessStatus (day 61 is due, day 91 is stale).
 */
export function quality(providers, asOf) {
  const total = providers.length;
  const verified = providers.filter(isVerified);
  const asOfMs = dayMs(asOf);
  const ageOf = (p) => Math.floor((asOfMs - dayMs(p.last_verified)) / DAY_MS);

  // Freshness buckets over the verified entries; an unverified entry has no age and is counted apart.
  const buckets = { fresh: 0, due: 0, stale: 0 };
  for (const p of verified) buckets[freshnessStatus(ageOf(p))] += 1;
  const dates = verified.map((p) => p.last_verified).sort();

  // Histogram: verified entries by the week of their last verification, from the week of the oldest one to the as-of
  // week, empty weeks included, and never more than QUALITY_WEEKS weeks (older ones are counted in `earlier`).
  const thisWeek = weekStart(asOf);
  const limitWeek = addDays(thisWeek, -7 * (QUALITY_WEEKS - 1));
  const oldestWeek = dates.length ? weekStart(dates[0]) : thisWeek;
  const firstWeek = oldestWeek > limitWeek ? oldestWeek : limitWeek;
  const nWeeks = Math.round((dayMs(thisWeek) - dayMs(firstWeek)) / (7 * DAY_MS)) + 1;
  const weeks = [];
  for (let i = 0; i < nWeeks; i++) {
    const start = addDays(firstWeek, 7 * i);
    const inWeek = dates.filter((d) => weekStart(d) === start);
    weeks.push({
      start,
      count: inWeek.length,
      // The day the first and last of them turn due (day 61) and stale (day 91), as freshnessStatus grades them.
      dueFrom: inWeek.length ? addDays(inWeek[0], DUE_SOON_DAYS + 1) : null,
      dueTo: inWeek.length ? addDays(inWeek[inWeek.length - 1], DUE_SOON_DAYS + 1) : null,
      staleFrom: inWeek.length ? addDays(inWeek[0], SLA_DAYS + 1) : null,
    });
  }
  const earlier = dates.filter((d) => d < firstWeek).length;

  // Tri-state flags, over the population /coverage/ counts them on (all verified providers).
  const flags = FIELD_CHECK_FIELDS.map((key) => {
    const pop = providers.filter(popOf(key).inPop);
    const c = fieldCheckCounts(pop, key);
    return {
      key, label: popOf(key).label, population: popOf(key).population, total: pop.length,
      answered: c.stated + c.unsourced, stated: c.stated, unsourced: c.unsourced,
      withReason: c.source_silent + c.needs_account + c.sources_disagree,
      source_silent: c.source_silent, needs_account: c.needs_account, sources_disagree: c.sources_disagree,
      unchecked: c.not_checked,
    };
  });

  // data_policy over verified text LLMs: a recorded object, an explicit null, or no key at all (both nulls mean nobody recorded it).
  const dpPop = providers.filter(popOf('data_policy').inPop);
  const dpRecorded = dpPop.filter((p) => p.data_policy && typeof p.data_policy === 'object');
  const dataPolicy = {
    population: popOf('data_policy').population, total: dpPop.length, recorded: dpRecorded.length,
    trainsKnown: dpRecorded.filter((p) => typeof p.data_policy.trains_on_prompts === 'boolean').length,
    retentionKnown: dpRecorded.filter((p) => p.data_policy.retention != null).length,
    notRecorded: dpPop.length - dpRecorded.length,
  };

  // free_limits over verified text LLMs that are not one-time trial credits: published numbers, null (the provider
  // publishes none), or absent (nobody has recorded it).
  const flPop = providers.filter(popOf('free_limits').inPop);
  const freeLimits = {
    population: popOf('free_limits').population, total: flPop.length,
    published: flPop.filter((p) => p.free_limits && typeof p.free_limits === 'object').length,
    noneRecorded: flPop.filter((p) => p.free_limits === null).length,
    absent: flPop.filter((p) => !('free_limits' in p)).length,
  };

  // models_free over verified text LLMs: providers with a non-empty sample, and the distinct model IDs listed.
  const mfPop = providers.filter(popOf('models_free').inPop);
  const mfWith = mfPop.filter((p) => Array.isArray(p.models_free) && p.models_free.length > 0);
  const modelsFree = {
    population: popOf('models_free').population, total: mfPop.length, withSample: mfWith.length,
    distinctModels: new Set(mfWith.flatMap((p) => p.models_free)).size,
  };

  // The two non-text figures, each with its own definition: the guardrail counts modalities; is_text_llm is stricter.
  const nonText = {
    total,
    noTextModality: providers.filter((p) => !(Array.isArray(p.modalities) && p.modalities.includes('text'))).length,
    notTextLlm: providers.filter((p) => p.is_text_llm === false).length,
    limitPct: NON_TEXT_LIMIT_PCT,
  };

  return {
    asOf, total, verified: verified.length, unverified: total - verified.length,
    freshness: { ...buckets, oldest: dates[0] ?? null, newest: dates[dates.length - 1] ?? null, weeks, earlier, firstWeek },
    flags, dataPolicy, freeLimits, modelsFree, nonText,
  };
}

/** A share with one decimal, for the guardrail where 34.3 and 35.0 must not both read 34 or 35. */
export const percent1 = (n, total) => (total > 0 ? (Math.round((1000 * n) / total) / 10).toFixed(1) : '0.0');

const num = (n) => `<td class="num">${n}</td>`;
const share = (n, total) => `<td class="num">${n} of ${total}</td><td class="num">${percent(n, total)}%</td>`;
// A bar beside the number: decoration only, the number in the same row is what assistive technology reads.
const bar = (n, max) => `<td class="q-barcell" aria-hidden="true"><span class="q-bar" style="width:${max > 0 ? Math.round((100 * n) / max) : 0}%"></span></td>`;

/** The main content of /quality/. `prefix` is the path from the page to the site root. */
export function qualityMainHtml(q, { prefix = '../', repo }) {
  const f = q.freshness;
  const maxWeek = Math.max(1, ...f.weeks.map((w) => w.count));
  const weekRows = f.weeks.map((w) =>
    `<tr><th scope="row">${escapeHtml(w.start)}</th>${num(w.count)}${bar(w.count, maxWeek)}` +
    `<td>${w.count ? (w.dueFrom === w.dueTo ? escapeHtml(w.dueFrom) : `${escapeHtml(w.dueFrom)} to ${escapeHtml(w.dueTo)}`) : '—'}</td></tr>`).join('');

  const flagRows = q.flags.map((r) =>
    `<tr><th scope="row"><code>${escapeHtml(r.key)}</code></th>${share(r.answered, r.total)}${share(r.withReason, r.total)}${share(r.unchecked, r.total)}</tr>`).join('');
  const reasonRows = q.flags.map((r) =>
    `<tr><th scope="row"><code>${escapeHtml(r.key)}</code></th>${num(r.stated)}${num(r.unsourced)}${num(r.source_silent)}${num(r.needs_account)}${num(r.sources_disagree)}</tr>`).join('');

  const dp = q.dataPolicy; const fl = q.freeLimits; const mf = q.modelsFree; const nt = q.nonText;
  const ntPct = percent1(nt.noTextModality, nt.total);

  return '<main id="main"><div class="wrap prose">' +
    `<p>How much of the dataset is verified, how fresh it is, and how many answers are known, unknown with a recorded reason, or not checked yet. Every number on this page is computed from <a href="${prefix}providers.json">providers.json</a> when the site is built. Data of ${escapeHtml(q.asOf)}; ages are counted to that day.</p>` +
    `<p>To fill a gap, use <a href="${prefix}coverage/">Data coverage</a>: it lists every open item with the provider's own docs and a prefilled issue. How an entry is checked is in the <a href="${prefix}methodology/">methodology</a>.</p>` +

    '<h2 id="verified">Verified entries</h2>' +
    '<table class="cov-table"><caption class="sr-only">Verified entries</caption><thead><tr><th>Entries</th><th class="num">Count</th><th class="num">Share</th></tr></thead><tbody>' +
    `<tr><th scope="row">Verified against the provider's own docs</th>${share(q.verified, q.total)}</tr>` +
    `<tr><th scope="row">Not verified yet</th>${share(q.unverified, q.total)}</tr>` +
    '</tbody></table>' +

    '<h2 id="freshness">Freshness</h2>' +
    `<p>An entry is <strong>fresh</strong> up to ${DUE_SOON_DAYS} days after its last verification, <strong>due</strong> for a re-check from day ${DUE_SOON_DAYS + 1}, and <strong>stale</strong> after ${SLA_DAYS} days (the SLA). Counted over verified entries.` +
    (f.oldest ? ` Oldest verification: ${escapeHtml(f.oldest)}; newest: ${escapeHtml(f.newest)}.` : '') + '</p>' +
    '<table class="cov-table"><caption class="sr-only">Verified entries by freshness</caption><thead><tr><th>State</th><th class="num">Entries</th><th class="num">Share</th></tr></thead><tbody>' +
    `<tr><th scope="row">Fresh (${DUE_SOON_DAYS} days or less)</th>${share(f.fresh, q.verified)}</tr>` +
    `<tr><th scope="row">Due for a re-check (${DUE_SOON_DAYS + 1} to ${SLA_DAYS} days)</th>${share(f.due, q.verified)}</tr>` +
    `<tr><th scope="row">Stale (over ${SLA_DAYS} days)</th>${share(f.stale, q.verified)}</tr>` +
    '</tbody></table>' +
    `<h3 id="freshness-weeks">Last verification, by week</h3>` +
    `<p>Verified entries by the week (Monday, UTC) of their last verification, from the week of the oldest one (at most ${QUALITY_WEEKS} weeks back), empty weeks included. The last column is when they turn due for a re-check, unless they are re-verified first: a tall bar is a week of re-checks coming due together. The same entries counted by the week they turn due, with clustered weeks marked, are on <a href="${prefix}coverage/#freshness">Data coverage</a>.</p>` +
    '<div class="table-scroll" role="region" aria-label="Last verification by week" tabindex="0"><table class="cov-table q-weeks"><caption class="sr-only">Verified entries by week of last verification</caption><thead><tr><th>Week of</th><th class="num">Entries</th><th class="q-barcell"><span class="sr-only">Bar</span></th><th>Due for a re-check</th></tr></thead><tbody>' +
    weekRows + '</tbody></table></div>' +
    (f.earlier ? `<p class="muted">${f.earlier} verified ${f.earlier === 1 ? 'entry was' : 'entries were'} last verified before ${escapeHtml(f.firstWeek)}.</p>` : '') +

    '<h2 id="flags">Yes/no flags: answered, unknown with a reason, not checked</h2>' +
    `<p>Each yes/no flag is <strong>answered</strong> (a known value), <strong>null with a recorded reason</strong> (the provider's pages were read on a stated day and do not settle it; see <code>field_checks</code>), or <strong>not checked</strong> yet. Unknown is never <em>no</em>. Counted over ${escapeHtml(q.flags[0]?.population ?? 'all verified providers')}.</p>` +
    '<div class="table-scroll" role="region" aria-label="Flags by state" tabindex="0"><table class="cov-table"><caption class="sr-only">Yes/no flags by state</caption><thead><tr><th>Flag</th><th class="num">Answered</th><th class="num">Share</th><th class="num">Null, with reason</th><th class="num">Share</th><th class="num">Not checked</th><th class="num">Share</th></tr></thead><tbody>' +
    flagRows + '</tbody></table></div>' +
    '<div class="table-scroll" role="region" aria-label="Flags by recorded status" tabindex="0"><table class="cov-table"><caption class="sr-only">Yes/no flags by recorded status</caption><thead><tr><th>Flag</th><th class="num">Stated, with source</th><th class="num">Known, unsourced</th><th class="num">Not stated by the provider</th><th class="num">Needs an account</th><th class="num">Pages disagree</th></tr></thead><tbody>' +
    reasonRows + '</tbody></table></div>' +

    '<h2 id="fine-print">Fine print fields</h2>' +
    '<table class="cov-table"><caption class="sr-only">Coverage of the fine print fields</caption><thead><tr><th>Field and state</th><th class="num">Count</th><th class="num">Share</th></tr></thead><tbody>' +
    `<tr><th scope="row" colspan="3"><code>data_policy</code>, counted over ${escapeHtml(dp.population)}</th></tr>` +
    `<tr><th scope="row">Recorded from the provider's own terms</th>${share(dp.recorded, dp.total)}</tr>` +
    `<tr><th scope="row">… says whether it trains on prompts</th>${share(dp.trainsKnown, dp.total)}</tr>` +
    `<tr><th scope="row">… says how long it keeps them</th>${share(dp.retentionKnown, dp.total)}</tr>` +
    `<tr><th scope="row">Not recorded yet</th>${share(dp.notRecorded, dp.total)}</tr>` +
    `<tr><th scope="row" colspan="3"><code>free_limits</code>, counted over ${escapeHtml(fl.population)}</th></tr>` +
    `<tr><th scope="row">Numbers published by the provider</th>${share(fl.published, fl.total)}</tr>` +
    `<tr><th scope="row">Recorded as publishing none (<code>null</code>)</th>${share(fl.noneRecorded, fl.total)}</tr>` +
    `<tr><th scope="row">Not recorded yet</th>${share(fl.absent, fl.total)}</tr>` +
    `<tr><th scope="row" colspan="3"><code>models_free</code>, counted over ${escapeHtml(mf.population)}</th></tr>` +
    `<tr><th scope="row">With a sample of free models</th>${share(mf.withSample, mf.total)}</tr>` +
    `<tr><th scope="row">Distinct model IDs in those samples</th>${num(mf.distinctModels)}<td class="num">—</td></tr>` +
    '</tbody></table>' +
    `<p class="muted">A sample of free models is a sample, not the full catalogue; see the <a href="${prefix}models/">free model index</a>.</p>` +

    '<h2 id="non-text">Text and non-text providers</h2>' +
    `<p>The project is about free <em>text</em> LLM APIs. By the <a href="${escapeHtml(repo)}/blob/main/docs/inclusion-criteria.md">inclusion criteria</a>, providers whose <code>modalities</code> do not include <code>text</code> (speech, image and similar) stay at or under ${nt.limitPct}% of the dataset. The stricter <code>is_text_llm: false</code> also counts embeddings, rerank and OCR services that take text but are not chat models.</p>` +
    '<table class="cov-table"><caption class="sr-only">Text and non-text providers</caption><thead><tr><th>Definition</th><th class="num">Providers</th><th class="num">Share</th></tr></thead><tbody>' +
    `<tr><th scope="row">No <code>text</code> in <code>modalities</code> (the ${nt.limitPct}% guardrail)</th><td class="num">${nt.noTextModality} of ${nt.total}</td><td class="num">${ntPct}%</td></tr>` +
    `<tr><th scope="row"><code>is_text_llm: false</code></th><td class="num">${nt.notTextLlm} of ${nt.total}</td><td class="num">${percent1(nt.notTextLlm, nt.total)}%</td></tr>` +
    '</tbody></table>' +
    '</div></main>';
}
