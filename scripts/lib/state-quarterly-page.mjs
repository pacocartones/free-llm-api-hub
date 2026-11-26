// state-quarterly-page.mjs — the generated sections, charts, data file and structured data of a quarterly report.
// Pure: it takes the report of lib/state-quarterly.mjs and returns strings and objects; build.mjs writes them and
// wraps the page in the site's header and footer. The wording around the sections comes from content/state/
// (lib/state-editorial.mjs).

import { monthLabel, pct } from './state.mjs';
import { escHtml as esc } from './markdown.mjs';
import { CHANGE_KINDS, HEADLINE_FLAGS, quarterEndDate, quarterStartDate } from './state-quarterly.mjs';
import { chartFigure } from './state-charts.mjs';
import { REASON_LABEL } from './field-checks.mjs';
import { CREATOR, PUBLISHER_NAME, SITE_NAME, datasetRef, entityIds, websiteRef } from './site-entity.mjs';
import { breadcrumbList } from './page-jsonld.mjs';

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const share = (n, d) => (d ? pct(n / d) : '0%');
const FLAG_FRIENDLY = { card: 'No card required', phone: 'No phone required', commercial: 'Commercial use allowed', training: 'No training on prompts' };
const FLAG_NOT_STATED = { card: 'Card requirement', phone: 'Phone requirement', commercial: 'Commercial-use terms', training: 'Training on prompts' };
const fmt = (v) => (v === null || v === undefined ? 'not stated' : typeof v === 'string' ? v : JSON.stringify(v));

// ---------- charts: one spec per chart; the SVG and the table are written from it ----------
export const quarterCharts = (r) => {
  const a = r.after, b = r.before;
  const startName = `Start (${r.start.date})`;
  const endName = `End (${r.end.date})`;
  const kindCount = (k) => r.changesByKind[k].length;
  const flags = HEADLINE_FLAGS.map((f) => f.key);
  return [
    {
      id: 'chart-access', title: 'Ongoing free tiers and trial credits',
      summary: `At the end of the quarter, ${a.ongoing} providers offer an ongoing free tier and ${a.trial} a trial credit, against ${b.ongoing} and ${b.trial} at the start.`,
      categoryHeader: 'Kind of free access', categories: ['Ongoing free tier', 'Trial credit'],
      series: [{ name: startName, cls: 'c-before', values: [b.ongoing, b.trial] }, { name: endName, cls: 'c-accent', values: [a.ongoing, a.trial] }],
    },
    {
      id: 'chart-flags', title: 'What the providers state, end of quarter', stacked: true,
      summary: `Of ${a.total} providers: ${flags.map((k) => `${FLAG_FRIENDLY[k].toLowerCase()} ${a.flags[k].friendly}, not stated ${a.flags[k].notStated}`).join('; ')}.`,
      categoryHeader: 'Question', categories: flags.map((k) => FLAG_FRIENDLY[k]),
      series: [
        { name: 'Yes', cls: 'c-ok', values: flags.map((k) => a.flags[k].friendly) },
        { name: 'No or conditional', cls: 'c-bad', values: flags.map((k) => a.flags[k].other) },
        { name: 'Not stated', cls: 'c-unk', values: flags.map((k) => a.flags[k].notStated) },
      ],
      note: '“Not stated” means the provider’s own pages do not say; it is never read as yes or no. Commercial use “conditional” counts under “No or conditional”.',
    },
    {
      id: 'chart-not-stated', title: 'Answers not stated, start and end of quarter',
      summary: `Providers whose pages do not state each answer: ${flags.map((k) => `${FLAG_NOT_STATED[k].toLowerCase()} ${b.flags[k].notStated} → ${a.flags[k].notStated}`).join('; ')}.`,
      categoryHeader: 'Answer', categories: flags.map((k) => FLAG_NOT_STATED[k]),
      series: [{ name: startName, cls: 'c-before', values: flags.map((k) => b.flags[k].notStated) }, { name: endName, cls: 'c-unk', values: flags.map((k) => a.flags[k].notStated) }],
    },
    {
      id: 'chart-modality', title: 'Providers by modality',
      summary: `End of quarter: ${a.byModality.map((m) => `${m.modality} ${m.count}`).join(', ')}. A provider counts once for every modality it offers free.`,
      categoryHeader: 'Modality', categories: a.byModality.map((m) => m.modality),
      series: [{ name: startName, cls: 'c-before', values: b.byModality.map((m) => m.count) }, { name: endName, cls: 'c-accent', values: a.byModality.map((m) => m.count) }],
    },
    {
      id: 'chart-change-kinds', title: 'What changed in the quarter',
      summary: `${plural(r.added.length, 'provider', 'providers')} added, ${r.removed.length} removed; field changes: ${CHANGE_KINDS.map((k) => `${k.label.toLowerCase()} ${kindCount(k.key)}`).join(', ')}.`,
      categoryHeader: 'Change', categories: ['Providers added', 'Providers removed', ...CHANGE_KINDS.map((k) => k.short || k.label)],
      series: [{ name: 'Count', cls: 'c-accent', values: [r.added.length, r.removed.length, ...CHANGE_KINDS.map((k) => kindCount(k.key))] }],
    },
    {
      id: 'chart-change-fields', title: 'Field changes by field',
      summary: `${plural(r.changes.length, 'field change', 'field changes')} across ${plural(r.providersChanged, 'provider', 'providers')}: ${r.changesByField.map((f) => `${f.label} ${f.count}`).join(', ')}.`,
      categoryHeader: 'Field', categories: r.changesByField.map((f) => f.label),
      series: [{ name: 'Field changes', cls: 'c-accent', values: r.changesByField.map((f) => f.count) }],
    },
    {
      id: 'chart-month-ends', title: 'Providers tracked at each month end',
      summary: `Providers in the dataset: ${r.monthEnds.map((m) => `${monthLabel(m.month)} ${m.total}`).join(', ')}.`,
      categoryHeader: 'Month end', categories: r.monthEnds.map((m) => `${monthLabel(m.month)}${m.carried ? ' (no rev.)' : ''}`),
      series: [{ name: 'Providers', cls: 'c-accent', values: r.monthEnds.map((m) => m.total) }],
      note: r.closed ? undefined : `The quarter is in progress: the last month shows the data to ${r.end.date}.`,
    },
    {
      id: 'chart-change-months', title: 'Field changes by month',
      summary: `Field changes per month: ${r.changesByMonth.map((m) => `${monthLabel(m.month)} ${m.count}`).join(', ')}.`,
      categoryHeader: 'Month', categories: r.changesByMonth.map((m) => monthLabel(m.month)),
      series: [{ name: 'Field changes', cls: 'c-accent', values: r.changesByMonth.map((m) => m.count) }],
    },
  ];
};

const table = (head, rows, cls = 'model-table') =>
  `<div class="table-wrap"><table class="${cls}"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>` +
  rows.map((row) => `<tr>${row.map((v, i) => (i === 0 ? `<th scope="row">${v}</th>` : `<td>${v}</td>`)).join('')}</tr>`).join('') + `</tbody></table></div>`;

const stat = (num, lbl) => `<div class="stat"><div class="num">${num}</div><div class="lbl">${lbl}</div></div>`;

// ---------- the generated sections ----------
// provLink(slug, name): a link to the provider page when it still exists, else the name. links: hrefs relative to
// the page (changes, months, notFree, methodology, history, changesJson, data).
export const quarterBlocks = (r, { provLink, links }) => {
  const a = r.after, b = r.before;
  const charts = Object.fromEntries(quarterCharts(r).map((c) => [c.id, chartFigure(c)]));
  const delta = (x, y) => (x - y > 0 ? `+${x - y}` : x - y < 0 ? `−${y - x}` : '0');
  const flagRow = (k) => [esc(FLAG_FRIENDLY[k]), `${b.flags[k].friendly} (${share(b.flags[k].friendly, b.total)})`, `${a.flags[k].friendly} (${share(a.flags[k].friendly, a.total)})`, delta(a.flags[k].friendly, b.flags[k].friendly)];

  const status = r.closed
    ? `<p class="quarter-status muted">Final figures: the last revision of the quarter is of ${r.end.date}.</p>`
    : `<p class="quarter-status notice" role="note"><strong>In progress.</strong> ${esc(r.label)} has not closed: the figures reach the revision of ${r.end.date} and will change until the quarter ends on ${quarterEndDate(r.quarter)}. This page is not indexed until then.</p>`;

  const headline =
    `<h2 id="headline">Headline figures</h2>` +
    `<div class="stats stats-quarter">` +
    stat(a.total, `providers tracked (${delta(a.total, b.total)} in the quarter)`) +
    stat(`${a.ongoing} / ${a.trial}`, 'ongoing free tier / trial credit') +
    stat(share(a.flags.card.friendly, a.total), 'no card required') +
    stat(share(a.flags.phone.friendly, a.total), 'no phone required') +
    stat(share(a.flags.commercial.friendly, a.total), 'commercial use allowed') +
    stat(share(a.flags.training.friendly, a.total), 'say they do not train on prompts') +
    stat(share(a.notStatedCells, a.flagCells), 'of these answers not stated') +
    stat(share(a.verified, a.total), 'verified against the provider’s pages') +
    `</div>` +
    table(['Figure', `Start (${r.start.date})`, `End (${r.end.date})`, 'Change'], [
      ['Providers tracked', b.total, a.total, delta(a.total, b.total)],
      ['Ongoing free tier', b.ongoing, a.ongoing, delta(a.ongoing, b.ongoing)],
      ['Trial credit', b.trial, a.trial, delta(a.trial, b.trial)],
      ...HEADLINE_FLAGS.map((f) => flagRow(f.key)),
      ['Answers not stated (4 questions × providers)', `${b.notStatedCells} of ${b.flagCells} (${share(b.notStatedCells, b.flagCells)})`, `${a.notStatedCells} of ${a.flagCells} (${share(a.notStatedCells, a.flagCells)})`, delta(a.notStatedCells, b.notStatedCells)],
      ['Verified', `${b.verified} (${share(b.verified, b.total)})`, `${a.verified} (${share(a.verified, a.total)})`, delta(a.verified, b.verified)],
    ], 'model-table quarter-figures') +
    charts['chart-access'] + charts['chart-flags'];

  const changeTable = (rows, empty) => (rows.length
    ? table(['Provider', 'Date', 'Field', 'Before', 'After'], rows.map((c) => [provLink(c.slug, c.name), c.date, esc(c.label), esc(fmt(c.from)), esc(fmt(c.to))]))
    : `<p class="muted">${empty}</p>`);
  const changes =
    `<h2 id="changes">Changes in the quarter</h2>` +
    `<p>From ${r.start.date} (the last revision before the quarter) to ${r.end.date}: ${plural(r.added.length, 'provider', 'providers')} added, ${r.removed.length} removed, and ${plural(r.changes.length, 'field change', 'field changes')} across ${plural(r.providersChanged, 'provider', 'providers')}.</p>` +
    charts['chart-change-kinds'] +
    `<h3 id="added">Added</h3>` +
    (r.added.length ? table(['Provider', 'Kind of free access'], r.added.map((p) => [provLink(p.slug, p.name), p.category === 'ongoing' ? 'Ongoing free tier' : 'Trial credit'])) : `<p class="muted">No provider was added.</p>`) +
    `<h3 id="removed">Removed</h3>` +
    (r.removed.length
      ? table(['Provider', 'Why, where recorded', 'Entry'], r.removed.map((p) => [esc(p.name), p.reason ? esc(p.reason) : 'No reason recorded in the dataset', p.notFreeId ? `<a href="${links.notFree}#${esc(p.notFreeId)}">Not free: ${esc(p.name)}</a>` : '—']))
      : `<p class="muted">No provider was removed.</p>`) +
    `<h3 id="cuts">Cuts</h3><p class="muted">A flag that moved against the user (a card or phone now required, commercial use narrowed) or a free tier that became a trial credit.</p>` +
    changeTable(r.changesByKind.cut, 'No cut was recorded.') +
    `<h3 id="improvements">Improvements</h3><p class="muted">The same rules the other way.</p>` +
    changeTable(r.changesByKind.improvement, 'No improvement was recorded.') +
    `<h3 id="to-unknown">Moved to not stated</h3><p class="muted">A flag that held a value and is now not stated: the pages no longer say, or say it unclearly. Not a cut.</p>` +
    changeTable(r.changesByKind.to_unknown, 'No flag moved to not stated.') +
    `<h3 id="clarified">Newly stated</h3><p class="muted">A flag that was not stated and now is, because a page now says it or was found.</p>` +
    changeTable(r.changesByKind.clarified, 'No flag became stated.') +
    `<h3 id="other-changes">Wording or limits changed</h3>` +
    `<p>${plural(r.changesByKind.other.length, 'change', 'changes')} to the free-tier text, rate limits, the catch, the commercial-use condition or OpenAI compatibility. They are not sorted into cuts or improvements: that needs reading. Each one, with its before and after, is in the monthly reports: ${r.monthEnds.filter((m) => r.months.includes(m.month)).map((m) => `<a href="${links.month(m.month)}">${monthLabel(m.month)}</a>`).join(', ')}.</p>` +
    charts['chart-change-fields'] + charts['chart-month-ends'] + charts['chart-change-months'];

  const modality =
    `<h2 id="modality">Breakdown by modality</h2>` +
    `<p>A provider counts once for every modality it offers free, so the counts add up to more than the ${a.total} providers.</p>` +
    charts['chart-modality'];

  const reasonText = (reasons) => Object.entries(reasons).sort((x, y) => y[1] - x[1]).map(([s, n]) => `${n} ${esc(REASON_LABEL[s] || s)}`).join(', ');
  const unknowns =
    `<h2 id="unknowns">What we don’t know</h2>` +
    `<p>${share(a.notStatedCells, a.flagCells)} of the answers to the four questions above are not stated (${share(b.notStatedCells, b.flagCells)} at the start of the quarter). We record what each provider’s own pages say; where they say nothing, the value stays not stated and is never counted as yes or no.</p>` +
    (b.total && b.flags.training.notStated === b.total
      ? `<p class="muted">At the start of the quarter no provider had a recorded data policy, so “training on prompts” starts at ${b.total} of ${b.total} not stated: the field was not yet collected, which is not the same as providers saying less.</p>`
      : '') +
    charts['chart-not-stated'] +
    table(['Question', 'Not stated', 'Why'], r.unknowns.map((u) => [esc(FLAG_NOT_STATED[u.key]), `${u.count} of ${a.total}`, u.key === 'training' ? 'No data policy recorded, or it does not say' : reasonText(u.reasons) || '—'])) +
    r.unknowns.filter((u) => u.count).map((u) => `<details class="quarter-unknown"><summary>${esc(FLAG_NOT_STATED[u.key])}: the ${u.count} providers</summary><p>${u.providers.map((p) => provLink(p.slug, p.name)).join(', ')}</p></details>`).join('');

  const methodology =
    `<h2 id="methodology">Methodology</h2>` +
    `<ul>` +
    `<li><strong>Snapshots.</strong> The start is the last revision of <code>data/providers.json</code> on <code>main</code> before ${quarterStartDate(r.quarter)} (${r.start.date}); the end is the last revision in the quarter (${r.end.date}). Revisions come from the first-parent history, so each merged pull request counts once, on the day it landed.</li>` +
    `<li><strong>Changes.</strong> Field changes are the git-mined history of the tracked fields, one entry per provider, day and field (a value changed and changed back the same day is not a change). Added and removed compare the two snapshots.</li>` +
    `<li><strong>Cuts and improvements</strong> are sorted by rule, only for the card, phone and commercial-use flags and the kind of free access. Text changes are not judged.</li>` +
    `<li><strong>Not stated</strong> is a value the provider’s own pages do not give. It is never read as yes or no.</li>` +
    `<li><strong>Numbers.</strong> Every figure, chart and table on this page is computed from the data at build time; the wording around them lives in a file that can only quote these figures.</li>` +
    `</ul>` +
    `<p>The full rules: <a href="${links.methodology}">methodology</a>. The data: <a href="${links.data}">this report as JSON</a>, <a href="${links.changesJson}">every field change</a>, <a href="${links.history}">the per-provider history</a>.</p>`;

  return { status, headline, changes, modality, unknowns, methodology, 'data-links': '' };
};

// ---------- the report as JSON (site/state/YYYY-qN/data.json) ----------
export const quarterDataJson = (r, { site }) => ({
  report: `State of Free LLM APIs — ${r.label}`,
  quarter: r.quarter,
  status: r.closed ? 'closed' : 'in_progress',
  period: { start: quarterStartDate(r.quarter), end: quarterEndDate(r.quarter) },
  snapshots: { start: r.start.date, end: r.end.date },
  url: `${site}/state/${r.quarter}/`,
  license: 'MIT',
  figures: { start: stripModality(r.before), end: stripModality(r.after) },
  modalities: r.after.byModality.map((m, i) => ({ modality: m.modality, start: r.before.byModality[i].count, end: m.count })),
  added: r.added,
  removed: r.removed.map(({ slug, name, reason }) => ({ slug, name, reason })),
  changes: r.changes,
  charts: quarterCharts(r).map((c) => ({ id: c.id, title: c.title, categories: c.categories, series: c.series.map((s) => ({ name: s.name, values: s.values })) })),
});
function stripModality({ byModality, ...rest }) { return rest; }

// ---------- structured data: the Article, the Dataset of its figures, the breadcrumb ----------
// No Product, Offer or rating (see page-jsonld.mjs). The Dataset is the figures of this report, based on the
// site's dataset (the same @id as the home page's).
export const quarterJsonLd = (r, { site, title, description }) => {
  const url = `${site}/state/${r.quarter}/`;
  const ids = entityIds(site);
  const author = { '@type': 'Person', '@id': ids.creator, name: CREATOR.name, url: CREATOR.url };
  const publisher = { '@type': 'Organization', '@id': ids.publisher, name: PUBLISHER_NAME };
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article', '@id': `${url}#article`, headline: title, description, url, inLanguage: 'en',
        ...(r.closed ? { datePublished: r.end.date } : {}), dateModified: r.end.date,
        author, publisher, isPartOf: websiteRef(site), about: { '@id': `${url}#data` }, image: `${site}/og/state-quarterly.png`,
      },
      {
        '@type': 'Dataset', '@id': `${url}#data`, name: `${SITE_NAME}: State of Free LLM APIs — ${r.label}`,
        description: `The figures of the ${r.label} report: provider counts, access and data-policy flags, modalities and the changes in the quarter, computed from the dataset.`,
        url, isAccessibleForFree: true, license: 'https://opensource.org/licenses/MIT',
        temporalCoverage: `${quarterStartDate(r.quarter)}/${r.end.date}`, dateModified: r.end.date,
        creator: author, publisher, isBasedOn: datasetRef(site),
        distribution: [{ '@type': 'DataDownload', name: `${r.label} report figures (JSON)`, encodingFormat: 'application/json', contentUrl: `${url}data.json` }],
      },
      breadcrumbList(site, [['What changed', `${site}/changes/`], [`State of Free LLM APIs — ${r.label}`, url]]),
    ],
  });
};
