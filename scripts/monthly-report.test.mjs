// The monthly "Free LLM API changes" report (lib/monthly-report.mjs) on /state/YYYY-MM/: the figures are computed from
// two month-end snapshots, the editorial file can only quote them ({{key}}), the generated sections exist for every
// month with a month before it, and a reviewed month gets its prose, an Article and a feed item.
import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { privateTree } from './lib/private-tree.mjs';
import { stripTags } from './lib/escape.mjs';
import { mineHistoryAndSnapshots } from './lib/history.mjs';
import { changesRss } from './lib/changes.mjs';
import { monthChanges } from './monthly-issues.mjs';
import {
  monthlyChangesReport, renderReport, renderGenerated, fillTokens, parseReportFile, releasesInMonth, removalReason,
  reportFeedItem, dayLabel,
} from './lib/monthly-report.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://freellmapihub.com';

// ---------- fixtures ----------
const prov = (slug, extra = {}) => ({
  slug, name: slug.toUpperCase(), category: 'ongoing', verified: true, last_verified: '2026-11-10', free_tier: `${slug} free`,
  notes: `${slug} notes`, docs_url: `https://${slug}.example/docs`, card_required: false, phone_required: null, commercial_ok: null,
  openai_compatible: false, modalities: ['text'], models_free: [], ...extra,
});
const BEFORE = { date: '2026-10-20', hash: 'a'.repeat(40), revisions: 3, providers: [
  prov('keep', { commercial_ok: true, phone_required: false, last_verified: '2026-10-01' }),
  prov('gone', { last_verified: '2026-10-05' }),
  prov('flip', { last_verified: '2026-10-09' }),
] };
const AFTER = { date: '2026-11-25', hash: 'b'.repeat(40), revisions: 7, providers: [
  prov('keep', { commercial_ok: null, phone_required: null, field_checks: { commercial_ok: { status: 'source_silent', checked: '2026-11-20', sources: ['https://keep.example/terms'], note: 'Terms say nothing' } } }),
  prov('flip', { verified: false, last_verified: '2026-11-12' }),
  prov('new', { openai_compatible: true, card_required: false, field_checks: { card_required: { status: 'stated', checked: '2026-11-21', sources: ['https://new.example'], quote: 'No card needed.' } }, data_policy: { trains_on_prompts: false, source: 'https://new.example/privacy' }, models_free: ['m1', 'm2'] }),
] };
const NOT_FREE = { entries: [
  { id: 'gone', name: 'Gone', group: 'removed', slug: null, short: 'paid plans only', checked: '2026-11-19', sources: [{ label: 'Pricing', url: 'https://gone.example/pricing' }] },
  { id: 'openai', name: 'OpenAI', group: 'no-free-tier', slug: null, short: 'prepaid', checked: '2026-11-20', sources: [] },
] };
const CHANGES = {
  month: '2026-11', added: [{ slug: 'new', name: 'NEW' }], removed: [{ slug: 'gone', name: 'GONE' }],
  fieldChanges: [{ date: '2026-11-20', slug: 'keep', field: 'commercial_ok' }, { date: '2026-11-20', slug: 'keep', field: 'phone_required' }, { date: '2026-11-21', slug: 'flip', field: 'notes' }],
};
const CHANGELOG = '## [Unreleased]\n\n## [2.14.0] — 2026-11-19\n\n## [2.13.0] — 2026-11-14\n\n## [2.11.0] — 2026-10-13\n';
const model = () => monthlyChangesReport({ month: '2026-11', before: BEFORE, after: AFTER, changes: CHANGES, notFree: NOT_FREE, changelog: CHANGELOG });

describe('figures come from the two snapshots', () => {
  test('counts, adds, removals, dates and flags', () => {
    const r = model();
    const f = r.figures;
    assert.equal(f.providers_before, 3);
    assert.equal(f.providers_after, 3);
    assert.equal(f.verified_after, 2);
    assert.equal(f.added_count, 1);
    assert.equal(f.added_names, 'NEW');
    assert.equal(f.added_openai_compatible, 1);
    assert.equal(f.removed_names, 'GONE');
    assert.equal(f.under_review_names, 'FLIP');
    assert.equal(f.field_changes, 3);
    assert.equal(f.providers_changed, 2);
    assert.equal(f.revisions, 7);
    assert.equal(f.before_hash, 'aaaaaaa');
    assert.equal(f.after_hash, 'bbbbbbb');
    assert.equal(f.data_as_of_day, '25 Nov 2026');
    assert.equal(f.newest_day_before, '9 Oct 2026');
    assert.equal(f.commercial_true_before, 1);
    assert.equal(f.commercial_true_after, 0);
    assert.equal(f.commercial_true_to_unknown, 'KEEP');
    assert.equal(f.data_policy_after, 1);
    assert.equal(f.no_train_after, 1);
    assert.equal(f.field_checks_after, 2);
    assert.equal(f.field_checks_stated_after, 1);
    assert.equal(f.phone_unknown_after, 3);
    assert.equal(f.model_ids_after, 2);
    assert.equal(f.releases, 'v2.13.0 (14 Nov 2026) and v2.14.0 (19 Nov 2026)');
    assert.deepEqual(r.toUnknown.map((x) => `${x.p.slug}:${x.field}`), ['keep:phone_required', 'keep:commercial_ok']);
    assert.deepEqual(r.policyChanged.map((p) => p.slug), ['new']);
  });

  test('helpers: release headings, removal reasons and day labels', () => {
    assert.deepEqual(releasesInMonth(CHANGELOG, '2026-10'), [{ version: 'v2.11.0', date: '2026-10-13' }]);
    assert.deepEqual(releasesInMonth(CHANGELOG, '2026-12'), []);
    assert.equal(removalReason({ slug: 'gone', name: 'GONE' }, NOT_FREE).id, 'gone');
    assert.equal(removalReason({ slug: 'hume-ai', name: 'Hume AI' }, { entries: [{ id: 'hume', name: 'Hume' }] }).id, 'hume');
    assert.equal(removalReason({ slug: 'x', name: 'X' }, NOT_FREE), null);
    assert.equal(dayLabel('2026-12-01'), '1 Dec 2026');
  });
});

describe('the editorial file can only quote the data', () => {
  const FILE = '---\ntitle: "Changes — {{month_label}}"\ndescription: "{{added_count}} added"\n---\n\n## Headlines\n\n1. **{{added_count}} joined:** {{added_names}}.\n\n{{block:new-providers}}\n\nSee [the hub](https://freellmapihub.com/not-free/).\n';

  test('figures fill the prose, the title and the description; blocks become tables', () => {
    const out = renderReport(FILE, model(), { site: SITE, repo: 'https://github.com/x/y', current: new Set(['new']) });
    assert.equal(out.title, 'Changes — November 2026');
    assert.equal(out.description, '1 added');
    assert.match(out.html, /<strong>1 joined:<\/strong> NEW\./);
    assert.match(out.html, /<td class="name"><a href="\.\.\/\.\.\/p\/new">NEW<\/a><\/td>/);
    assert.match(out.html, /No: “No card needed\.”/);
    assert.doesNotMatch(out.html, /\{\{/);
  });

  test('an unknown figure or block fails instead of printing a guess', () => {
    assert.throws(() => fillTokens('{{nope}}', model().figures), /unknown figure \{\{nope\}\}/);
    assert.throws(() => renderReport(FILE.replace('{{block:new-providers}}', '{{block:made-up}}'), model(), { site: SITE }), /unknown block/);
    assert.throws(() => parseReportFile('no front matter'), /front matter/);
    assert.throws(() => parseReportFile('---\ntitle: "x"\n---\nbody'), /description/);
  });

  test('raw HTML in the file is text, not markup', () => {
    const out = renderReport(FILE.replace('## Headlines', '## <script>alert(1)</script>'), model(), { site: SITE });
    assert.ok(!out.html.toLowerCase().includes('<script'), 'no script element in the output');
  });

  test('every month with a month before it gets the generated sections without a file', () => {
    const html = renderGenerated(model(), { site: SITE, current: new Set(['new', 'keep']) });
    assert.match(html, /November 2026 against October 2026/);
    assert.match(html, /aria-label="November 2026 in numbers"/);
    assert.match(html, /Paid plans only/);
    assert.match(html, /<strong>Under review:<\/strong> FLIP is now unverified/);
    assert.match(html, /<a href="\.\.\/\.\.\/p\/keep">KEEP<\/a>, commercial use allowed: yes → unknown \(not stated by the provider: “Terms say nothing”/);
  });
});

describe('the feed', () => {
  test('a report is one item, dated the day after its month, between the weeks around it', () => {
    const item = reportFeedItem('2026-11', { title: 'Changes — November 2026', description: 'd' }, SITE);
    assert.deepEqual(item, { title: 'Changes — November 2026', description: 'd', link: `${SITE}/state/2026-11/`, guid: 'free-llm-api-hub-report-2026-11', date: '2026-12-01' });
    const weeks = [
      { week: '2026-W49', start: '2026-11-30', end: '2026-12-06', lastDate: '2026-12-03', count: 1, providers: 1, changes: [{ slug: 'a', name: 'A', field: 'notes', label: 'the catch' }] },
      { week: '2026-W48', start: '2026-11-23', end: '2026-11-29', lastDate: '2026-11-25', count: 1, providers: 1, changes: [{ slug: 'a', name: 'A', field: 'notes', label: 'the catch' }] },
    ];
    const xml = changesRss(weeks, { site: SITE, reports: [item] });
    const titles = [...xml.matchAll(/<item><title>([^<]*)<\/title>/g)].map((m) => m[1]);
    assert.equal(titles.length, 3);
    assert.equal(titles[1], 'Changes — November 2026');
    assert.ok(xml.includes('<guid isPermaLink="false">free-llm-api-hub-report-2026-11</guid>'));
    assert.equal(changesRss(weeks, { site: SITE }).match(/<item>/g).length, 2, 'no report, no extra item');
  });
});

// ---------- the built site (the real history) ----------
describe('the built /state/ pages', () => {
  let ROOT, mined, providers, reportMonths;
  before(() => {
    ROOT = privateTree(REPO);
    execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: ROOT, stdio: 'pipe' });
    mined = mineHistoryAndSnapshots({ cwd: ROOT });
    providers = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8')).providers;
    reportMonths = readdirSync(join(ROOT, 'content/state')).filter((f) => /^\d{4}-\d{2}\.md$/.test(f)).map((f) => f.slice(0, 7))
      .filter((m) => existsSync(join(ROOT, `site/state/${m}/index.html`)));
  });
  const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

  test('a reviewed month has its title, an Article, every figure filled and the computed numbers under it', (t) => {
    if (!Object.keys(mined.monthEnd).length) return t.skip('no git history in this checkout');
    assert.ok(reportMonths.includes('2026-11'), 'November 2026 has a report');
    for (const month of reportMonths) {
      const html = read(`site/state/${month}/index.html`);
      const { meta } = parseReportFile(read(`content/state/${month}.md`));
      const beforeKey = Object.keys(mined.monthEnd).filter((k) => k < month).sort().pop();
      const changes = monthChanges({ month, historyBySlug: mined.historyBySlug, monthEnd: mined.monthEnd });
      const r = monthlyChangesReport({ month, before: mined.monthEnd[beforeKey], after: mined.monthEnd[month], changes, notFree: JSON.parse(read('data/not-free.json')), changelog: read('CHANGELOG.md') });
      const title = fillTokens(meta.title, r.figures);
      assert.ok(html.includes(`<title>${title.replace(/&/g, '&amp;')} · Free LLM API Hub</title>`), `${month}: title`);
      assert.ok(html.includes(`<h1>${title}</h1>`), `${month}: h1`);
      const desc = html.match(/<meta name="description" content="([^"]*)"/)[1];
      assert.equal(desc, fillTokens(meta.description, r.figures), `${month}: the description fits the 155-character snippet uncut`);
      assert.doesNotMatch(html, /\{\{[a-z0-9_:-]+\}\}/, `${month}: a figure left unfilled`);
      const graph = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'];
      const article = graph.find((n) => n['@type'] === 'Article');
      assert.equal(article.headline, title);
      assert.equal(article.dateModified, mined.monthEnd[month].date);
      assert.ok(graph.some((n) => n['@type'] === 'BreadcrumbList'));
      assert.ok(html.indexOf('id="the-numbers"') > html.indexOf('class="month-report"'), `${month}: the computed numbers follow the report`);
      // The numbers in the prose are the data's.
      const text = stripTags(html).replace(/\s+/g, ' ');
      assert.ok(text.includes(`${r.figures.removed_count} providers left the list and ${r.figures.added_count} joined`), `${month}: headline counts`);
      assert.ok(text.includes(`recording ${changes.fieldChanges.length} changes to the tracked fields`), `${month}: field changes`);
      for (const p of r.added) assert.ok(html.includes(`>${p.name.replace(/&/g, '&amp;')}<`), `${month}: new provider ${p.slug}`);
      for (const p of r.removed) assert.ok(html.includes(p.name.replace(/&/g, '&amp;')), `${month}: removed provider ${p.slug}`);
    }
  });

  test('every internal link of a report page resolves', (t) => {
    if (!reportMonths.length) return t.skip('no report page in this checkout');
    for (const month of reportMonths) {
      const html = read(`site/state/${month}/index.html`);
      for (const [, raw] of html.matchAll(/<a [^>]*href="([^"]+)"/g)) {
        let href = raw.replace(/&amp;/g, '&');
        if (href === SITE || href.startsWith(SITE + '/')) href = href.slice(SITE.length) || '/';
        else if (/^(https?:|mailto:|#)/.test(href)) continue;
        const path = href.split(/[?#]/)[0];
        const target = path.startsWith('/') ? join(ROOT, 'site', path) : resolve(join(ROOT, `site/state/${month}`), path);
        const ok = [target, `${target}.html`, join(target, 'index.html')].some((c) => existsSync(c) && statSync(c).isFile());
        assert.ok(ok, `${month}: ${raw} has no page`);
      }
    }
  });

  test('the change feed carries one item per report, and /changes/ marks the month', (t) => {
    if (!reportMonths.length) return t.skip('no report page in this checkout');
    const xml = read('site/changes.xml');
    const changes = read('site/changes/index.html');
    for (const month of reportMonths) {
      assert.equal(xml.split(`<guid isPermaLink="false">free-llm-api-hub-report-${month}</guid>`).length - 1, 1, `${month}: one feed item`);
      assert.ok(xml.includes(`<link>${SITE}/state/${month}/</link>`));
      assert.match(changes, new RegExp(`href="\\.\\./state/${month}/"[^>]*aria-label="[^"]*monthly report`));
    }
  });

  test('months without a file keep the computed page, with the generated sections when there is a month before', (t) => {
    const months = readdirSync(join(ROOT, 'site/state')).filter((f) => /^\d{4}-\d{2}$/.test(f)).sort();
    if (months.length < 2) return t.skip('not enough history');
    for (const month of months.filter((m) => !reportMonths.includes(m))) {
      const html = read(`site/state/${month}/index.html`);
      assert.ok(html.includes(`<h1>State of free LLM APIs — `), `${month}: computed title kept`);
      assert.doesNotMatch(html, /class="month-report"/);
      const hasRevision = Boolean(mined.monthEnd[month]);
      const hasBefore = Object.keys(mined.monthEnd).some((k) => k < month);
      assert.equal(/ against [A-Z][a-z]+ \d{4}<\/h2>/.test(html), hasRevision && hasBefore, `${month}: generated sections`);
    }
    assert.ok(providers.length > 0);
  });
});
