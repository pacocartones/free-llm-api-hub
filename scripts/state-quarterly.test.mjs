// The quarterly "State of Free LLM APIs" report (/state/YYYY-qN/): the math on fixtures, the editorial file's rules,
// the charts against their tables, and the built page against the data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { privateTree } from './lib/private-tree.mjs';
import { fillMonths } from './lib/state.mjs';
import {
  reportQuarters, quarterlyReport, quarterFigures, classifyChange, snapshotFigures, quarterOf, quarterMonths, quarterLabel,
} from './lib/state-quarterly.mjs';
import { quarterCharts, quarterBlocks, quarterJsonLd } from './lib/state-quarterly-page.mjs';
import { chartSvg, chartTable, chartFigure, validateChart } from './lib/state-charts.mjs';
import { renderEditorial, fillFigures, parseEditorial, REQUIRED_BLOCKS, DEFAULT_FILE, EDITORIAL_DIR } from './lib/state-editorial.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---------- fixtures ----------
const prov = (slug, o = {}) => ({ slug, name: slug.toUpperCase(), category: 'ongoing', modalities: ['text'], card_required: false, phone_required: null, commercial_ok: true, verified: true, ...o });
const rev = (date, providers) => ({ date, providers });

test('quarters: a quarter needs the month before it, and closes only when a later revision exists', () => {
  assert.equal(quarterOf('2026-11'), '2026-q4');
  assert.deepEqual(quarterMonths('2027-q1'), ['2027-01', '2027-02', '2027-03']);
  assert.equal(quarterLabel('2026-q4'), 'Q4 2026');
  const a = [prov('a')];
  const months = fillMonths({ '2026-08': rev('2026-08-14', a), '2026-10': rev('2026-10-19', a), '2026-12': rev('2026-12-31', a), '2027-01': rev('2027-01-05', a) });
  const qs = reportQuarters(months);
  // Q3 has no June snapshot: left out. Q4 starts from September (carried from August). Q1 2027 is in progress.
  assert.deepEqual(qs.map((q) => q.quarter), ['2026-q4', '2027-q1']);
  assert.equal(qs[0].start.date, '2026-08-14');
  assert.equal(qs[0].end.date, '2026-12-31');
  assert.equal(qs[0].closed, true);
  assert.equal(qs[1].closed, false);
  // The newest month ending mid-month is in progress, so its quarter is too, even with all three months present.
  const open = reportQuarters(fillMonths({ '2026-09': rev('2026-09-30', a), '2026-10': rev('2026-10-02', a), '2026-12': rev('2026-12-20', a) }));
  assert.equal(open[0].quarter, '2026-q4');
  assert.equal(open[0].closed, false);
  assert.deepEqual(open[0].monthEnds.map((m) => [m.month, m.carried]), [['2026-09', false], ['2026-10', false], ['2026-11', true], ['2026-12', false]]);
});

test('headline figures: friendly answers, other stated answers and not stated, never mixed', () => {
  const f = snapshotFigures([
    prov('a', { card_required: false, phone_required: false, commercial_ok: true, data_policy: { trains_on_prompts: false } }),
    prov('b', { category: 'trial', card_required: true, phone_required: null, commercial_ok: 'conditional', data_policy: { trains_on_prompts: true } }),
    prov('c', { card_required: null, phone_required: null, commercial_ok: null, modalities: ['text', 'vision'], verified: false }),
  ]);
  assert.equal(f.total, 3);
  assert.deepEqual([f.ongoing, f.trial, f.verified], [2, 1, 2]);
  assert.deepEqual(f.flags.card, { friendly: 1, other: 1, notStated: 1 });
  assert.deepEqual(f.flags.phone, { friendly: 1, other: 0, notStated: 2 });
  assert.deepEqual(f.flags.commercial, { friendly: 1, other: 1, notStated: 1 }, 'conditional is stated, not a plain yes');
  assert.deepEqual(f.flags.training, { friendly: 1, other: 1, notStated: 1 }, 'no data_policy is not stated');
  assert.equal(f.notStatedCells, 5);
  assert.equal(f.flagCells, 12);
  assert.equal(f.byModality.find((m) => m.modality === 'vision').count, 1);
});

test('changes are sorted by rule only where a rule exists', () => {
  assert.equal(classifyChange({ field: 'card_required', from: false, to: true }), 'cut');
  assert.equal(classifyChange({ field: 'phone_required', from: true, to: false }), 'improvement');
  assert.equal(classifyChange({ field: 'card_required', from: false, to: null }), 'to_unknown');
  assert.equal(classifyChange({ field: 'commercial_ok', from: null, to: true }), 'clarified');
  assert.equal(classifyChange({ field: 'commercial_ok', from: true, to: 'conditional' }), 'cut');
  assert.equal(classifyChange({ field: 'commercial_ok', from: false, to: 'conditional' }), 'improvement');
  assert.equal(classifyChange({ field: 'free_type', from: 'renewing-quota', to: 'trial-credit' }), 'cut');
  assert.equal(classifyChange({ field: 'free_type', from: 'trial-credit', to: 'perpetual' }), 'improvement');
  assert.equal(classifyChange({ field: 'free_type', from: 'perpetual', to: 'renewing-quota' }), 'other');
  assert.equal(classifyChange({ field: 'rate_limits', from: '10 RPM', to: '5 RPM' }), 'other', 'text is never judged');
});

const fixtureReport = () => {
  const start = [prov('a'), prov('b'), prov('gone')];
  const end = [prov('a', { card_required: true }), prov('b', { commercial_ok: null }), prov('new', { category: 'trial' })];
  const months = fillMonths({ '2026-09': rev('2026-09-30', start), '2026-11': rev('2026-11-20', end), '2026-12': rev('2026-12-31', end), '2027-01': rev('2027-01-02', end) });
  const history = {
    a: [{ date: '2026-11-20', kind: 'changed', fields: ['card_required'], changes: [{ field: 'card_required', from: false, to: true }] }],
    b: [
      { date: '2026-09-29', kind: 'changed', fields: ['rate_limits'], changes: [{ field: 'rate_limits', from: 'x', to: 'y' }] },
      { date: '2026-11-20', kind: 'changed', fields: ['commercial_ok', 'notes'], changes: [{ field: 'commercial_ok', from: true, to: null }, { field: 'notes', from: 'n', to: 'm' }] },
    ],
  };
  const q = reportQuarters(months).find((x) => x.quarter === '2026-q4');
  return quarterlyReport(q, { historyBySlug: history, notFree: [{ id: 'gone-co', slug: 'gone', name: 'GONE', short: 'paid plans only' }] });
};

test('the quarterly report: added, removed with its reason, field changes of the quarter only, by kind, field and month', () => {
  const r = fixtureReport();
  assert.equal(r.closed, true);
  assert.deepEqual(r.added.map((p) => p.slug), ['new']);
  assert.deepEqual(r.removed, [{ slug: 'gone', name: 'GONE', reason: 'paid plans only', notFreeId: 'gone-co' }]);
  assert.equal(r.changes.length, 3, 'the September change is outside the quarter');
  assert.deepEqual(Object.fromEntries(Object.entries(r.changesByKind).map(([k, v]) => [k, v.length])), { cut: 1, improvement: 0, to_unknown: 1, clarified: 0, other: 1 });
  assert.equal(r.providersChanged, 2);
  assert.deepEqual(r.changesByMonth.map((m) => m.count), [0, 3, 0]);
  assert.equal(r.unknowns.find((u) => u.key === 'commercial').count, 1);
  const f = quarterFigures(r);
  assert.equal(f.providers, '3');
  assert.equal(f.added_names, 'NEW');
  assert.equal(f.removed_count, '1');
  assert.equal(f.cut_count, '1');
  assert.equal(f.status, 'closed');
  for (const v of Object.values(f)) assert.equal(typeof v, 'string');
});

// ---------- charts ----------
// Reads [series, category, value] back from an SVG and from its table.
const svgData = (svg) => [...svg.matchAll(/<rect class="[^"]+" x="[^"]+" y="[^"]+" width="[^"]+" height="\d+" data-series="([^"]*)" data-category="([^"]*)" data-value="([^"]*)"/g)].map((m) => [m[1], m[2], Number(m[3])]);
const tableData = (html) => {
  const head = [...html.slice(html.indexOf('<thead>'), html.indexOf('</thead>')).matchAll(/<th[^>]*>([^<]*)<\/th>/g)].map((m) => m[1]);
  const body = html.slice(html.indexOf('<tbody>'), html.indexOf('</tbody>'));
  const out = [];
  for (const row of body.split('</tr>').filter((x) => x.includes('<th'))) {
    const cat = row.match(/<th scope="row">([^<]*)<\/th>/)[1];
    const cells = [...row.matchAll(/<td class="num">([^<]*)<\/td>/g)].map((m) => Number(m[1]));
    head.slice(1).forEach((series, i) => { if (series !== 'Total') out.push([series, cat, cells[i]]); });
  }
  return out;
};
const sorted = (rows) => [...rows].map((r) => JSON.stringify(r)).sort();

test('a chart and its table come from one spec and hold the same numbers, in both layouts', () => {
  for (const spec of quarterCharts(fixtureReport())) {
    assert.deepEqual(validateChart(spec), [], spec.id);
    const table = tableData(chartTable(spec));
    assert.deepEqual(sorted(svgData(chartSvg(spec, 'wide'))), sorted(table), `${spec.id}: wide`);
    assert.deepEqual(sorted(svgData(chartSvg(spec, 'narrow'))), sorted(table), `${spec.id}: narrow`);
    const fig = chartFigure(spec);
    assert.match(fig, /<svg class="chart-svg chart-wide"[^>]* role="img" aria-labelledby="[^"]+-title [^"]+-desc"/);
    assert.match(fig, /<figcaption/);
    assert.match(fig, /<details class="chart-data"><summary>Data table/);
  }
  assert.throws(() => chartSvg({ id: 'x', title: 't', summary: 's', categories: ['a'], series: [{ name: 'n', cls: 'c-ok', values: [-1] }] }), /non-negative/);
  assert.throws(() => chartSvg({ id: 'x', title: 't', summary: 's', categories: ['a'], series: [{ name: 'n', cls: 'red', values: [1] }] }), /colour class/);
  assert.throws(() => chartSvg({ id: 'x', title: 't', summary: 's', categories: ['a much too long label for the chart'], series: [{ name: 'n', cls: 'c-ok', values: [1] }] }), /longer than/);
});

// ---------- the editorial file ----------
test('the editorial file can only quote figures and must place every required block', () => {
  const figures = { providers: '77', quarter_label: 'Q4 2026' };
  const blocks = Object.fromEntries([...REQUIRED_BLOCKS, 'status', 'data-links'].map((b) => [b, `<section data-b="${b}"></section>`]));
  const doc = (body, fm = 'title: "State — {{quarter_label}}"\ndescription: "{{providers}} providers"') => `---\n${fm}\n---\n${body}`;
  const all = REQUIRED_BLOCKS.map((b) => `{{block:${b}}}`).join('\n\n');
  const ok = renderEditorial(doc(`We track {{providers}} <b>providers</b>.\n\n${all}`), { figures, blocks, ctx: { repo: 'https://github.com/x/y', site: 'https://e.com' } });
  assert.equal(ok.title, 'State — Q4 2026');
  assert.equal(ok.description, '77 providers');
  assert.match(ok.html, /We track 77 &lt;b&gt;providers&lt;\/b&gt;/, 'raw HTML is text');
  for (const b of REQUIRED_BLOCKS) assert.ok(ok.html.includes(`data-b="${b}"`));
  const r = (body) => renderEditorial(doc(body), { figures, blocks, ctx: {} });
  assert.throws(() => r(`{{nope}}\n${all}`), /unknown figure \{\{nope\}\}/);
  assert.throws(() => r(`{{block:nope}}\n${all}`), /unknown block/);
  assert.throws(() => r(`{{block:headline}}\n${all}`), /used twice/);
  assert.throws(() => r(`{{block:headline}}`), /required block\(s\) missing/);
  assert.throws(() => r(`Text {{block:headline}}\n${all}`), /alone on its line/);
  assert.throws(() => parseEditorial('no front matter'), /front matter/);
  assert.throws(() => fillFigures('{{providers_typo}}', figures), /unknown figure/);
});

test('the default editorial file and every quarter file render against real figures', () => {
  const r = fixtureReport();
  const figures = quarterFigures(r);
  const blocks = quarterBlocks(r, { provLink: (s, n) => n, links: { notFree: 'nf/', methodology: 'm/', data: 'data.json', changesJson: 'c.json', history: 'h.json', month: (m) => `../${m}/` } });
  const files = [DEFAULT_FILE, ...execFileSync('git', ['ls-files', '--others', '--cached', '--exclude-standard', EDITORIAL_DIR], { cwd: REPO, encoding: 'utf8' })
    .split('\n').map((f) => posix.basename(f)).filter((f) => /^\d{4}-q[1-4]\.md$/.test(f))];
  for (const f of new Set(files)) {
    const out = renderEditorial(readFileSync(join(REPO, EDITORIAL_DIR, f), 'utf8'), { figures, blocks, file: f, ctx: { repo: 'https://github.com/x/y', site: 'https://freellmapihub.com' } });
    assert.ok(out.title && out.description, f);
    assert.doesNotMatch(out.html + out.title + out.description, /\{\{/, `${f}: nothing left unfilled`);
  }
});

test('structured data: Article, Dataset and breadcrumb; no Product, Offer or rating', () => {
  const ld = JSON.parse(quarterJsonLd(fixtureReport(), { site: 'https://freellmapihub.com', title: 'T', description: 'D' }));
  const types = ld['@graph'].map((n) => n['@type']);
  assert.deepEqual(types, ['Article', 'Dataset', 'BreadcrumbList']);
  assert.doesNotMatch(JSON.stringify(ld), /"Product"|"Offer"|aggregateRating|"Review"/);
  const ds = ld['@graph'][1];
  assert.equal(ds.isBasedOn['@id'], 'https://freellmapihub.com/#dataset', 'based on the site dataset, same @id as the home page');
  assert.equal(ld['@graph'][0].about['@id'], ds['@id']);
});

// ---------- the built site ----------
const ROOT = privateTree(REPO);
let built = false;
const build = () => { if (!built) { execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: ROOT, stdio: 'pipe' }); built = true; } };
const quarterDirs = () => {
  const out = execFileSync('git', ['log', '--first-parent', '--format=%ad', '--date=short', '--', 'data/providers.json'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n');
  return { lastRevision: out[0] };
};

// An internal href of a page under site/state/<q>/ resolves to a file of the built site.
const resolves = (pageDir, href) => {
  const clean = href.split('#')[0].split('?')[0];
  if (!clean) return true;
  const target = posix.normalize(posix.join(pageDir, clean));
  const abs = join(ROOT, 'site', target);
  if (existsSync(abs) && statSync(abs).isFile()) return true;
  if (existsSync(join(abs, 'index.html'))) return true;
  return existsSync(abs + '.html');
};

test('the built quarterly page: figures equal the data, charts equal their tables, links resolve', () => {
  build();
  const q = '2026-q4';
  const page = join(ROOT, `site/state/${q}/index.html`);
  assert.ok(existsSync(page), 'the Q4 2026 page is built');
  const html = readFileSync(page, 'utf8');
  const data = JSON.parse(readFileSync(join(ROOT, `site/state/${q}/data.json`), 'utf8'));
  assert.doesNotMatch(html, /\{\{/, 'no unfilled figure or block');

  // Figures: when the end snapshot is the last revision, it IS data/providers.json; count straight from it.
  const { lastRevision } = quarterDirs();
  if (data.snapshots.end === lastRevision) {
    const providers = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8')).providers;
    const end = data.figures.end;
    assert.equal(end.total, providers.length);
    assert.equal(end.ongoing, providers.filter((p) => p.category === 'ongoing').length);
    assert.equal(end.trial, providers.filter((p) => p.category === 'trial').length);
    assert.equal(end.flags.card.friendly, providers.filter((p) => p.card_required === false).length);
    assert.equal(end.flags.phone.friendly, providers.filter((p) => p.phone_required === false).length);
    assert.equal(end.flags.commercial.friendly, providers.filter((p) => p.commercial_ok === true).length);
    assert.equal(end.flags.training.friendly, providers.filter((p) => p.data_policy && p.data_policy.trains_on_prompts === false).length);
    const nulls = providers.reduce((n, p) => n + [p.card_required, p.phone_required, p.commercial_ok, p.data_policy ? p.data_policy.trains_on_prompts : null].filter((v) => v === null || v === undefined).length, 0);
    assert.equal(end.notStatedCells, nulls);
    assert.match(html, new RegExp(`<div class="num">${end.total}</div><div class="lbl">providers tracked`));
    assert.match(html, new RegExp(`<div class="num">${Math.round((nulls / (providers.length * 4)) * 1000) / 10}%</div><div class="lbl">of these answers not stated`));
  }
  // Every added and removed provider is named on the page.
  for (const p of [...data.added, ...data.removed]) assert.ok(html.includes(p.name.replace(/&/g, '&amp;')), `${p.name} is on the page`);

  // Six to eight charts, each SVG (both layouts) holding exactly the numbers of its table and of data.json.
  const figures = [...html.matchAll(/<figure class="chart" id="([^"]+)">([\s\S]*?)<\/figure>/g)];
  assert.ok(figures.length >= 6 && figures.length <= 8, `${figures.length} charts`);
  assert.equal(figures.length, data.charts.length);
  for (const [, id, fig] of figures) {
    const wide = fig.match(/<svg class="chart-svg chart-wide"[\s\S]*?<\/svg>/)[0];
    const narrow = fig.match(/<svg class="chart-svg chart-narrow"[\s\S]*?<\/svg>/)[0];
    const table = tableData(fig.slice(fig.indexOf('<table')));
    assert.ok(table.length > 0, `${id}: has a table`);
    assert.deepEqual(sorted(svgData(wide)), sorted(table), `${id}: wide SVG = table`);
    assert.deepEqual(sorted(svgData(narrow)), sorted(table), `${id}: narrow SVG = table`);
    const json = data.charts.find((c) => c.id === id);
    const fromJson = json.series.flatMap((s) => s.values.map((v, i) => [s.name, json.categories[i], v]));
    assert.deepEqual(sorted(fromJson.map(([s, c, v]) => [s, c.replace(/&/g, '&amp;'), v])), sorted(table), `${id}: data.json = table`);
    assert.match(wide, /<title id="[^"]+">[^<]+<\/title><desc id="[^"]+">[^<]+<\/desc>/, `${id}: named and described`);
  }

  // Sections the editorial file must keep.
  for (const id of ['headline', 'changes', 'modality', 'unknowns', 'methodology']) assert.match(html, new RegExp(`<h2 id="${id}"`), `section ${id}`);

  // Links: every internal href resolves to a built file; the stylesheet and the OG image are referenced.
  const hrefs = [...html.matchAll(/\s(?:href|src)="([^"]+)"/g)].map((m) => m[1]).filter((h) => !/^(https?:|mailto:|#|data:)/.test(h));
  assert.ok(hrefs.length > 20);
  const broken = hrefs.filter((h) => !resolves(`state/${q}`, h.replace(/&amp;/g, '&')));
  assert.deepEqual(broken, [], 'internal links resolve');
  assert.match(html, /<link rel="stylesheet" href="\.\.\/\.\.\/charts\.css\?v=[0-9a-f]{8}">/);
  assert.match(html, /<meta property="og:image" content="https:\/\/freellmapihub\.com\/og\/state-quarterly\.png">/);

  // JSON-LD on the page: Article + Dataset + breadcrumb, nothing commercial.
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.deepEqual(ld['@graph'].map((n) => n['@type']), ['Article', 'Dataset', 'BreadcrumbList']);
  assert.doesNotMatch(JSON.stringify(ld), /"Product"|"Offer"/);

  // Indexing follows the quarter: noindex and out of the sitemap while in progress, in it once closed.
  const sitemap = readFileSync(join(ROOT, 'site/sitemap-state.xml'), 'utf8');
  const listed = sitemap.includes(`/state/${q}/</loc>`);
  if (data.status === 'closed') { assert.doesNotMatch(html, /name="robots"/); assert.ok(listed); }
  else { assert.match(html, /<meta name="robots" content="noindex,follow">/); assert.ok(!listed); assert.match(html, /In progress\./); }

  // /changes/ links every quarterly page.
  const changes = readFileSync(join(ROOT, 'site/changes/index.html'), 'utf8');
  assert.match(changes, new RegExp(`href="\\.\\./state/${q}/"`));
});
