// monthly-report.mjs — the monthly "Free LLM API changes" report on /state/YYYY-MM/.
//
// The /state/YYYY-MM/ pages (lib/state.mjs) are computed for every month from the git-mined history. A month can also
// have a reviewed editorial report in content/state/YYYY-MM.md: the prose a maintainer signs off (headlines, the
// "less free / more free" reading of each change, what we couldn't confirm). This module computes everything else from
// the data, so December and every later month get the same sections for free, and renders the editorial file into the
// page with its figures filled in from the data:
//
//   - figures: two month-end snapshots of data/providers.json (the month before and this one, lib/history.mjs) and the
//     month's changes (monthChanges() in scripts/monthly-issues.mjs, the same function the monthly issue uses).
//   - {{key}} in the editorial file is replaced by figure `key`; an unknown key fails the build, so the prose can only
//     quote numbers and lists the data gives.
//   - {{block:name}} on a line of its own is replaced by a generated section (tables and lists).
//
// Pure functions of their arguments; build.mjs reads the files and git.

import { fieldCheck, REASON_LABEL, FIELD_CHECK_FIELDS } from './field-checks.mjs';
import { markdownToHtml } from './markdown.mjs';
import { monthLabel, monthName, monthEndDate } from './state.mjs';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ESC[c]);
const httpsOnly = (u) => (typeof u === 'string' && /^https:\/\/[^\s"<>]+$/i.test(u) ? u : '');
const ext = (url, text) => (httpsOnly(url) ? `<a href="${esc(url)}" target="_blank" rel="noopener">${text}</a>` : text);
const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.slug < b.slug ? -1 : 1);
export const andList = (parts) => (parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`);
const time = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d || '') ? `<time datetime="${d}">${d}</time>` : esc(d || 'date not recorded'));
const table = (label, head, rows) =>
  `<div class="table-scroll" role="region" aria-label="${esc(label)}" tabindex="0"><table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>\n` +
  rows.map((r) => `<tr>${r.map((v, i) => `<td${i === 0 ? ' class="name"' : ''}>${v}</td>`).join('')}</tr>`).join('\n') + `\n</tbody></table></div>`;

const FLAG_WORDS = { card_required: 'card required', phone_required: 'phone required', commercial_ok: 'commercial use allowed', openai_compatible: 'OpenAI-compatible' };
const flagValue = (v) => (v === true ? 'yes' : v === false ? 'no' : v === 'conditional' ? 'conditional' : 'unknown');

/** "14 Nov 2026" style day, for prose. */
export const dayLabel = (iso) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return String(iso || '');
  return `${Number(iso.slice(8, 10))} ${monthName(iso.slice(0, 7)).slice(0, 3)} ${iso.slice(0, 4)}`;
};

// ---------- figures ----------
function snapshotFigures(list) {
  const verified = list.filter((p) => p.verified === true);
  const dates = verified.map((p) => p.last_verified).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '')).sort();
  const dp = list.filter((p) => p.data_policy && typeof p.data_policy === 'object');
  const checks = list.flatMap((p) => Object.values(p.field_checks || {}).filter((c) => c && typeof c === 'object'));
  const models = new Set(list.flatMap((p) => p.models_free || []));
  return {
    providers: list.length,
    verified: verified.length,
    ongoing: list.filter((p) => p.category === 'ongoing').length,
    trial: list.filter((p) => p.category === 'trial').length,
    oldest: dates[0] || null,
    newest: dates[dates.length - 1] || null,
    median: dates.length ? dates[Math.floor((dates.length - 1) / 2)] : null,
    data_policy: dp.length,
    no_train: dp.filter((p) => p.data_policy.trains_on_prompts === false).length,
    trains: dp.filter((p) => p.data_policy.trains_on_prompts === true).length,
    unsettled: dp.filter((p) => p.data_policy.trains_on_prompts == null).length,
    commercial_true: list.filter((p) => p.commercial_ok === true).length,
    commercial_false: list.filter((p) => p.commercial_ok === false).length,
    commercial_conditional: list.filter((p) => p.commercial_ok === 'conditional').length,
    commercial_unknown: list.filter((p) => p.commercial_ok == null).length,
    free_limits: list.filter((p) => p.free_limits && typeof p.free_limits === 'object').length,
    models_free: list.filter((p) => (p.models_free || []).length).length,
    model_ids: models.size,
    field_checks: checks.length,
    field_checks_providers: list.filter((p) => Object.keys(p.field_checks || {}).length).length,
    field_checks_stated: checks.filter((c) => c.status === 'stated').length,
    field_checks_silent: checks.filter((c) => c.status === 'source_silent').length,
    field_checks_account: checks.filter((c) => c.status === 'needs_account').length,
    field_checks_disagree: checks.filter((c) => c.status === 'sources_disagree').length,
    phone_unknown: list.filter((p) => p.phone_required == null).length,
    phone_unknown_checked: list.filter((p) => p.phone_required == null && fieldCheck(p, 'phone_required')).length,
    anonymous: list.filter((p) => p.anonymous_access).sort(byName),
    speed: list.filter((p) => (p.published_speed || []).length).sort(byName),
    models_url: list.filter((p) => p.models_url).length,
    playground: list.filter((p) => p.playground_url).sort(byName),
  };
}

/** Dataset releases whose CHANGELOG heading ("## [x.y.z] — YYYY-MM-DD") is dated in the month, oldest first. */
export function releasesInMonth(changelog, month) {
  return [...String(changelog || '').matchAll(/^## \[(\d+\.\d+\.\d+)\] — (\d{4}-\d{2}-\d{2})\s*$/gm)]
    .map((m) => ({ version: `v${m[1]}`, date: m[2] }))
    .filter((r) => r.date.startsWith(month + '-'))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.version < b.version ? -1 : 1));
}

/** The not-free.json entry that explains why a removed provider left, matched by slug, id or name. */
export function removalReason(p, notFree) {
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return ((notFree && notFree.entries) || []).find((e) => e.slug === p.slug || e.id === p.slug || p.slug.startsWith(`${e.id}-`) || norm(e.name) === norm(p.name)) || null;
}

/**
 * Everything the report computes for `month`.
 * before / after: month-end snapshots { date, providers, hash?, revisions? } (after is the month's own);
 * changes: monthChanges() of the month; notFree: data/not-free.json; changelog: CHANGELOG.md text.
 */
export function monthlyChangesReport({ month, before, after, changes, notFree, changelog = '' }) {
  const B = before ? before.providers : [];
  const A = after ? after.providers : [];
  const fb = snapshotFigures(B);
  const fa = snapshotFigures(A);
  const bySlugB = new Map(B.map((p) => [p.slug, p]));
  const bySlugA = new Map(A.map((p) => [p.slug, p]));
  const added = changes.added.map((x) => bySlugA.get(x.slug)).filter(Boolean).sort(byName);
  const removed = changes.removed.map((x) => bySlugB.get(x.slug)).filter(Boolean).sort(byName);
  const providersChanged = new Set(changes.fieldChanges.map((c) => c.slug));
  const underReview = A.filter((p) => p.verified !== true && bySlugB.get(p.slug) && bySlugB.get(p.slug).verified === true).sort(byName);

  // Flags that moved from a value to unknown this month (between the two snapshots), with the recorded reason.
  const toUnknown = [];
  for (const p of A) {
    const prior = bySlugB.get(p.slug);
    if (!prior) continue;
    for (const f of FIELD_CHECK_FIELDS) {
      if (prior[f] != null && p[f] == null) toUnknown.push({ p, field: f, from: prior[f], check: fieldCheck(p, f) });
    }
  }
  toUnknown.sort((a, b) => byName(a.p, b.p) || FIELD_CHECK_FIELDS.indexOf(a.field) - FIELD_CHECK_FIELDS.indexOf(b.field));
  const commercialTrueToUnknown = toUnknown.filter((x) => x.field === 'commercial_ok' && x.from === true).map((x) => x.p);

  // Checks dated in the month whose reason is that two pages disagree or that only an account would tell.
  const openChecks = A.flatMap((p) => FIELD_CHECK_FIELDS.map((f) => ({ p, field: f, c: fieldCheck(p, f) })))
    .filter(({ c }) => c && (c.status === 'sources_disagree' || c.status === 'needs_account') && String(c.checked || '').startsWith(month + '-'))
    .sort((a, b) => byName(a.p, b.p));

  // Data policies that are new this month or whose training answer changed.
  const policyChanged = A.filter((p) => {
    if (!p.data_policy) return false;
    const prior = bySlugB.get(p.slug);
    return !prior || !prior.data_policy || prior.data_policy.trains_on_prompts !== p.data_policy.trains_on_prompts;
  }).sort(byName);

  const releases = releasesInMonth(changelog, month);
  const names = (list) => andList(list.map((p) => p.name));
  const figures = {
    month_label: monthLabel(month),
    month_name: monthName(month),
    before_date: before ? before.date : '',
    before_day: before ? dayLabel(before.date) : '',
    data_as_of: after ? after.date : '',
    data_as_of_day: after ? dayLabel(after.date) : '',
    before_hash: (before && before.hash ? before.hash.slice(0, 7) : ''),
    after_hash: (after && after.hash ? after.hash.slice(0, 7) : ''),
    revisions: after && after.revisions != null ? after.revisions : '',
    added_count: added.length,
    added_names: names(added),
    added_openai_compatible: added.filter((p) => p.openai_compatible === true).length,
    removed_count: removed.length,
    removed_names: names(removed),
    under_review_names: names(underReview),
    field_changes: changes.fieldChanges.length,
    providers_changed: providersChanged.size,
    releases_count: releases.length,
    releases: andList(releases.map((r) => `${r.version} (${dayLabel(r.date)})`)),
    commercial_true_to_unknown: names(commercialTrueToUnknown),
    commercial_true_to_unknown_count: commercialTrueToUnknown.length,
    anonymous_names: names(fa.anonymous),
    speed_names: names(fa.speed),
    playground_names: names(fa.playground),
  };
  for (const [k, v] of Object.entries(fa)) if (typeof v !== 'object' || v === null) figures[`${k}_after`] = v ?? '';
  for (const [k, v] of Object.entries(fb)) if (typeof v !== 'object' || v === null) figures[`${k}_before`] = v ?? '';
  for (const k of ['oldest', 'newest', 'median']) {
    figures[`${k}_day_after`] = dayLabel(fa[k]);
    figures[`${k}_day_before`] = dayLabel(fb[k]);
  }
  figures.before_month_label = before ? monthLabel(before.date.slice(0, 7)) : '';
  figures.anonymous_count_after = fa.anonymous.length;
  figures.speed_count_after = fa.speed.length;
  figures.playground_count_after = fa.playground.length;

  return { month, before, after, fb, fa, added, removed, underReview, toUnknown, openChecks, policyChanged, releases, figures, notFree, changes };
}

// ---------- generated blocks (HTML) ----------
const provLink = (p, prefix, current) => (current.has(p.slug) ? `<a href="${prefix}p/${esc(p.slug)}">${esc(p.name)}</a>` : esc(p.name));
const cardCell = (p) => {
  if (p.card_required === false) return 'No';
  if (p.card_required === true) return 'Yes';
  const c = fieldCheck(p, 'card_required');
  return `Unknown (${REASON_LABEL[c && c.status] || REASON_LABEL.not_checked})`;
};
const commercialCell = (p) => {
  if (p.commercial_ok === true) return 'Allowed';
  if (p.commercial_ok === false) return 'Not allowed';
  if (p.commercial_ok === 'conditional') return `Conditional${p.commercial_ok_condition ? `: ${esc(p.commercial_ok_condition)}` : ''}`;
  const c = fieldCheck(p, 'commercial_ok');
  return `Unknown (${REASON_LABEL[c && c.status] || REASON_LABEL.not_checked})`;
};

export function reportBlocks(r, { prefix = '../../', current = new Set(), siteChanges = `${prefix}api/v1/changes.json` } = {}) {
  const { fb, fa } = r;
  const span = (f) => (f.oldest ? `${dayLabel(f.oldest)} → ${dayLabel(f.newest)}` : '—');
  const numbers = table(`${r.figures.month_label} in numbers`, ['', esc(r.figures.before_day || 'Before'), esc(r.figures.data_as_of_day || 'After')], [
    ['Providers in the dataset', fb.providers, fa.providers],
    ['Verified', fb.verified, fa.verified],
    ['Ongoing free tiers / trial credits', `${fb.ongoing} / ${fb.trial}`, `${fa.ongoing} / ${fa.trial}`],
    ['Last verification, oldest → newest', span(fb), span(fa)],
    ['Median last verification', esc(dayLabel(fb.median) || '—'), esc(dayLabel(fa.median) || '—')],
    ['Providers with a quoted data policy (<code>data_policy</code>)', fb.data_policy, fa.data_policy],
    ['… that say they <strong>do not</strong> train on free-tier prompts', fb.no_train, fa.no_train],
    ['… that say they <strong>do</strong> train on them', fb.trains, fa.trains],
    ['… with training not settled by their own pages', fb.unsettled, fa.unsettled],
    ['Commercial use allowed / not allowed / conditional / unknown', `${fb.commercial_true} / ${fb.commercial_false} / ${fb.commercial_conditional} / ${fb.commercial_unknown}`, `${fa.commercial_true} / ${fa.commercial_false} / ${fa.commercial_conditional} / ${fa.commercial_unknown}`],
    ['Providers with structured free limits (<code>free_limits</code>)', fb.free_limits, fa.free_limits],
    ['Providers with a free-model sample (<code>models_free</code>)', fb.models_free, fa.models_free],
    ['Distinct model IDs in the samples', fb.model_ids, fa.model_ids],
    ['Flags with a recorded reason (<code>field_checks</code>)', fb.field_checks ? `${fb.field_checks} on ${fb.field_checks_providers} providers` : '—', fa.field_checks ? `${fa.field_checks} on ${fa.field_checks_providers} providers` : '—'],
  ].map((row) => row.map(String)));

  const newProviders = r.added.length
    ? table(`New providers in ${r.figures.month_label}`, ['Provider', 'What’s free', 'Card?', 'Commercial use', 'Source (checked)'], r.added.map((p) => {
      const cq = fieldCheck(p, 'card_required');
      return [
        provLink(p, prefix, current),
        esc(p.free_tier),
        `${cardCell(p)}${cq && cq.status === 'stated' && cq.quote ? `: “${esc(cq.quote)}”` : ''}`,
        commercialCell(p),
        `${ext(p.docs_url, esc(httpsOnly(p.docs_url) ? new URL(p.docs_url).hostname : 'source'))} (${time(p.last_verified)})`,
      ];
    }))
    : `<p class="muted">No provider joined the dataset in ${esc(r.figures.month_label)}.</p>`;

  const removedRows = r.removed.map((p) => {
    const e = removalReason(p, r.notFree);
    const why = e ? esc(e.short.charAt(0).toUpperCase() + e.short.slice(1)) : 'See the changelog.';
    const src = e && e.sources && e.sources[0] ? ext(e.sources[0].url, 'source') : ext(p.docs_url, 'last source');
    return [esc(p.name), `${why}${e ? ` (<a href="${prefix}not-free/#${esc(e.id)}">details</a>)` : ''}`, `${e ? time(e.checked) : '—'} (${src})`];
  });
  const removed = r.removed.length
    ? table(`Providers removed in ${r.figures.month_label}`, ['Provider', 'Why it left', 'Checked']
      , removedRows)
    : `<p class="muted">No provider left the dataset in ${esc(r.figures.month_label)}.</p>`;
  const underReview = r.underReview.length
    ? `<p><strong>Under review:</strong> ${andList(r.underReview.map((p) => provLink(p, prefix, current)))} ${r.underReview.length === 1 ? 'is' : 'are'} now unverified and out of the ranking until a re-check settles ${r.underReview.length === 1 ? 'its' : 'their'} free access; the provider page says why.</p>`
    : '';
  const groups = (id) => ((r.notFree && r.notFree.entries) || []).filter((e) => e.group === id);
  const noTier = groups('no-free-tier');
  const prepay = groups('card-or-prepay');
  const latest = [...noTier, ...prepay].map((e) => e.checked).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '')).sort().pop();
  const notFree = (noTier.length || prepay.length)
    ? `<p><strong>Notably not free${latest ? ` (re-checked ${esc(dayLabel(latest))})` : ''}:</strong> ${noTier.length ? `${andList(noTier.map((e) => esc(e.name)))} offer no ongoing free API tier: API use is prepaid with credits. ` : ''}${prepay.length ? `${andList(prepay.map((e) => esc(e.name)))} require a card or prepayment before any API use, per their own docs. ` : ''}<a href="${prefix}not-free/">Which LLM APIs are not free, and why</a>.</p>`
    : '';

  const policy = (want, label) => {
    const list = r.policyChanged.filter((p) => (want === null ? p.data_policy.trains_on_prompts == null : p.data_policy.trains_on_prompts === want));
    return list.length ? `<li><strong>${label}:</strong> ${andList(list.map((p) => `${provLink(p, prefix, current)}${p.data_policy.source ? ` (${ext(p.data_policy.source, 'source')})` : ''}`))}.</li>` : '';
  };
  const dataPolicy = r.policyChanged.length
    ? `<ul>${policy(true, 'They say they train on free or trial prompts')}${policy(false, 'They say they don’t')}${policy(null, 'Their own pages don’t settle it')}</ul>`
    : `<p class="muted">No data policy was added or changed in ${esc(r.figures.month_label)}.</p>`;

  const unknownList = r.toUnknown.length
    ? `<ul>${r.toUnknown.map(({ p, field, from, check }) => `<li>${provLink(p, prefix, current)}, ${FLAG_WORDS[field]}: ${flagValue(from)} → unknown${check ? ` (${esc(REASON_LABEL[check.status] || check.status)}${check.note ? `: “${esc(check.note)}”` : ''}, read ${time(check.checked)})` : ''}.</li>`).join('')}</ul>`
    : `<p class="muted">No flag moved to unknown in ${esc(r.figures.month_label)}.</p>`;
  const openChecks = r.openChecks.length
    ? `<ul>${r.openChecks.map(({ p, field, c }) => `<li>${provLink(p, prefix, current)}, ${FLAG_WORDS[field]}: ${esc(REASON_LABEL[c.status])}${c.note ? ` — “${esc(c.note)}”` : ''} (read ${time(c.checked)}).</li>`).join('')}</ul>`
    : '';

  return {
    numbers,
    'new-providers': newProviders,
    removed: removed + underReview,
    'not-free': notFree,
    'data-policy': dataPolicy,
    'to-unknown': unknownList,
    'open-checks': openChecks,
    'field-changes-link': `<p class="muted">Every field change of the month, with its date, before and after, is listed under <a href="#the-numbers">The numbers</a> below and in <a href="${siteChanges}">api/v1/changes.json</a>.</p>`,
  };
}

// The generated sections every month gets (with a month before it to compare against), with or without an editorial
// file: what a maintainer reviews and signs off goes in content/state/YYYY-MM.md on top of these.
export const GENERATED_BODY = `## {{month_label}} against {{before_month_label}}

{{block:numbers}}

## Providers added

{{block:new-providers}}

## Providers removed

{{block:removed}}

## Data policies added or changed

{{block:data-policy}}

## Flags that moved to unknown

{{block:to-unknown}}
`;

/** The generated sections of a month as HTML (no editorial file). */
export function renderGenerated(r, opts = {}) {
  return renderReport(`---\ntitle: "x"\ndescription: "x"\n---\n${GENERATED_BODY}`, r, opts).html;
}

// ---------- the editorial file ----------
/** Parses content/state/YYYY-MM.md: a front matter block (key: "value" lines) and the markdown body. */
export function parseReportFile(text) {
  const m = String(text).replace(/\r\n?/g, '\n').match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error('monthly report: the file must start with a --- front matter block');
  const meta = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([a-z_]+):\s*(?:"((?:[^"\\]|\\.)*)"|(.*))\s*$/);
    if (kv) meta[kv[1]] = kv[2] !== undefined ? kv[2].replace(/\\"/g, '"') : kv[3].trim();
  }
  for (const k of ['title', 'description']) if (!meta[k]) throw new Error(`monthly report: front matter needs ${k}`);
  return { meta, body: m[2] };
}

const TOKEN = /\{\{([a-z0-9_]+)\}\}/g;
/** Replaces {{key}} with the figure; an unknown key is an error (the prose can only quote the data). */
export function fillTokens(text, figures, where = 'monthly report') {
  return String(text).replace(TOKEN, (_m, k) => {
    if (!(k in figures)) throw new Error(`${where}: unknown figure {{${k}}}`);
    return String(figures[k]);
  });
}

/**
 * The report body as HTML: the markdown rendered with the site's converter (links: http(s) or pages of the site only),
 * {{key}} figures filled from the data and each {{block:name}} line replaced by its generated block.
 */
export function renderReport(text, r, { site, repo, prefix = '../../', current = new Set() } = {}) {
  const { meta, body } = parseReportFile(text);
  const blocks = reportBlocks(r, { prefix, current });
  const parts = fillTokens(body, r.figures).split(/^\{\{block:([a-z-]+)\}\}\s*$/m);
  let html = '';
  parts.forEach((part, i) => {
    if (i % 2 === 1) {
      if (!(part in blocks)) throw new Error(`monthly report: unknown block {{block:${part}}}`);
      html += blocks[part];
    } else if (part.trim()) {
      html += markdownToHtml(part, { repo, site, pages: {} });
    }
  });
  return {
    title: fillTokens(meta.title, r.figures, 'monthly report title'),
    description: fillTokens(meta.description, r.figures, 'monthly report description'),
    html,
  };
}

/** The feed item of a published report: dated the day after the month ends (the earliest day it can be complete). */
export function reportFeedItem(month, { title, description }, site) {
  const end = new Date(monthEndDate(month) + 'T00:00:00Z');
  const pub = new Date(+end + 86400000).toISOString().slice(0, 10);
  return { title, description, link: `${site}/state/${month}/`, guid: `free-llm-api-hub-report-${month}`, date: pub };
}
