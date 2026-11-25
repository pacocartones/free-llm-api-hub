import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MAX_ROWS, candidatesIssue, candidatesTitle, cell, changesIssue, changesTitle, monthChanges, monthOf,
  monthlyIssues, nonTextShare, previousMonth, publishIssue,
} from './monthly-issues.mjs';

const SHA = 'a'.repeat(40);
const prov = (slug, name, modalities = ['text']) => ({ slug, name, modalities });

// Three month-end snapshots: September (a, b, c), October has no revision, November (a, c, d).
const monthEnd = {
  '2026-09': { date: '2026-09-30', providers: [prov('alpha', 'Alpha'), prov('beta', 'Beta'), prov('gamma', 'Gamma')] },
  '2026-11': { date: '2026-11-20', providers: [prov('alpha', 'Alpha'), prov('gamma', 'Gamma'), prov('delta', 'Delta')] },
};
const historyBySlug = {
  alpha: [
    { date: '2026-09-02', kind: 'added', text: 'Added' },
    { date: '2026-09-10', kind: 'changed', fields: ['rate_limits'], changes: [{ field: 'rate_limits', from: '10 RPM', to: '20 RPM' }] },
    { date: '2026-11-15', kind: 'changed', fields: ['card_required'], changes: [{ field: 'card_required', from: null, to: true }] },
  ],
  gamma: [
    { date: '2026-11-03', kind: 'changed', fields: ['free_tier', 'notes'], changes: [{ field: 'free_tier', from: 'a | b', to: 'c @user' }, { field: 'notes', from: 'x', to: 'y' }] },
  ],
  beta: [{ date: '2026-11-01', kind: 'changed', fields: ['notes'], changes: [{ field: 'notes', from: 'old', to: 'new' }] }],
};

test('months: the run month and the month before, across a year boundary', () => {
  assert.equal(monthOf(new Date('2026-12-01T06:37:00Z')), '2026-12');
  assert.equal(previousMonth('2026-12'), '2026-11');
  assert.equal(previousMonth('2027-01'), '2026-12');
  assert.throws(() => previousMonth('2026-13'), /Invalid month/);
  assert.throws(() => monthOf(new Date('nope')), /Invalid clock/);
});

test('titles name the month in words', () => {
  assert.equal(changesTitle('2026-11'), 'Free tier changes — November 2026');
  assert.equal(candidatesTitle('2026-12'), 'New provider candidates — December 2026');
});

test('monthChanges compares month-end snapshots and keeps field changes of the month, oldest first', () => {
  const c = monthChanges({ month: '2026-11', historyBySlug, monthEnd });
  assert.deepEqual(c.added, [{ slug: 'delta', name: 'Delta' }]);
  assert.deepEqual(c.removed, [{ slug: 'beta', name: 'Beta' }]);
  assert.deepEqual(c.fieldChanges.map((x) => `${x.date} ${x.slug} ${x.field}`), [
    '2026-11-01 beta notes', '2026-11-03 gamma free_tier', '2026-11-03 gamma notes', '2026-11-15 alpha card_required',
  ]);
  assert.equal(c.fieldChanges[0].name, 'Beta', 'a removed provider keeps its name from the snapshot');
});

test('a month without a committed revision changed nothing', () => {
  assert.deepEqual(monthChanges({ month: '2026-10', historyBySlug, monthEnd }), { month: '2026-10', added: [], removed: [], fieldChanges: [] });
});

test('cells are one line, bounded, and cannot break the table or mention anyone', () => {
  assert.equal(cell('a | b'), 'a \\| b');
  assert.equal(cell('ping @someone'), 'ping &#64;someone');
  assert.equal(cell('two\nlines'), 'two lines');
  assert.equal(cell(null), 'unknown');
  assert.equal(cell(true), 'yes');
  assert.equal(cell('<img src=x>'), '&lt;img src=x>');
  const long = cell('x'.repeat(500));
  assert.ok(long.length <= 120 && long.endsWith('…'));
});

test('the changes issue lists additions, removals and field changes, with labels and a call for reports', () => {
  const c = monthChanges({ month: '2026-11', historyBySlug, monthEnd });
  const issue = changesIssue(c, { current: new Set(['alpha', 'gamma', 'delta']), sourceSha: SHA });
  assert.equal(issue.title, 'Free tier changes — November 2026');
  assert.deepEqual(issue.labels, ['data', 'help wanted']);
  assert.match(issue.body, /1 provider added, 1 provider removed, 4 field changes across 3 providers/);
  assert.match(issue.body, /- \[Delta\]\(https:\/\/freellmapihub\.com\/p\/delta\) \(`delta`\)/);
  assert.match(issue.body, /## Removed\n\n- Beta \(`beta`\)/);
  assert.match(issue.body, /\| 2026-11-15 \| \[Alpha\]\(https:\/\/freellmapihub\.com\/p\/alpha\) \| card requirement \| unknown \| yes \|/);
  assert.match(issue.body, /\| 2026-11-01 \| Beta \| the catch \| old \| new \|/, 'a removed provider is not linked');
  assert.ok(!issue.body.includes('@user'));
  assert.match(issue.body, /state\/2026-11\//);
  assert.match(issue.body, new RegExp(`blob/${SHA}/data/providers\\.json`));
  assert.match(issue.body, /template=inaccuracy\.yml/);
  assert.match(issue.body, /UTC day/);
  assert.throws(() => changesIssue(c, { sourceSha: 'main' }), /Invalid source SHA/);
});

test('an empty month says so, and a busy one is capped with a pointer to the full data', () => {
  const empty = changesIssue({ month: '2026-10', added: [], removed: [], fieldChanges: [] }, { sourceSha: SHA });
  assert.match(empty.body, /## Added\n\n_None\._/);
  assert.match(empty.body, /_No field changes\._/);
  const many = Array.from({ length: MAX_ROWS + 5 }, (_, i) => ({ date: '2026-11-02', slug: 's', name: 'S', field: 'notes', label: 'the catch', from: `${i}`, to: `${i + 1}` }));
  const busy = changesIssue({ month: '2026-11', added: [], removed: [], fieldChanges: many }, { sourceSha: SHA });
  assert.equal(busy.body.split('\n').filter((l) => l.startsWith('| 2026-11-02')).length, MAX_ROWS);
  assert.match(busy.body, /and 5 more/);
  assert.ok(busy.body.length < 65536, 'fits GitHub issue body limit');
});

test('non-text share and the room left under the 35% guardrail', () => {
  const ps = (text, other) => [...Array.from({ length: text }, (_, i) => prov(`t${i}`, 'T')), ...Array.from({ length: other }, (_, i) => prov(`n${i}`, 'N', ['audio']))];
  assert.deepEqual(nonTextShare(ps(46, 24)), { total: 70, nonText: 24, share: 24 / 70, room: 0 });
  assert.equal(nonTextShare(ps(65, 30)).room, 5); // 30/95 today; 35/100 = 35% fits exactly, 36/101 does not
  assert.equal(nonTextShare(ps(65, 35)).room, 0);
  assert.equal(nonTextShare(ps(10, 10)).room, 0, 'already over the cap');
});

test('the candidates issue links the criteria and form, states the cap, and is not a good first issue', () => {
  const full = candidatesIssue('2026-12', [...Array.from({ length: 46 }, (_, i) => prov(`t${i}`, 'T')), ...Array.from({ length: 24 }, (_, i) => prov(`n${i}`, 'N', ['ocr']))]);
  assert.equal(full.title, 'New provider candidates — December 2026');
  assert.deepEqual(full.labels, ['help wanted']);
  assert.ok(!full.labels.includes('good first issue'));
  assert.match(full.body, /docs\/inclusion-criteria\.md/);
  assert.match(full.body, /template=new-provider\.yml/);
  assert.match(full.body, /one provider per comment/);
  assert.match(full.body, /24 of 70 providers \(34\.3%\) are non-text/);
  assert.match(full.body, /\*\*no room\*\*/);
  const roomy = candidatesIssue('2026-12', [prov('a', 'A'), prov('b', 'B'), prov('c', 'C')]);
  assert.match(roomy.body, /room for \*\*1\*\* more non-text provider /);
});

test('monthlyIssues reports the month before and invites candidates for the run month', () => {
  const providers = monthEnd['2026-11'].providers;
  const [changes, candidates] = monthlyIssues({ now: new Date('2026-12-01T06:37:00Z'), providers, historyBySlug, monthEnd, sourceSha: SHA });
  assert.equal(changes.title, 'Free tier changes — November 2026');
  assert.equal(candidates.title, 'New provider candidates — December 2026');
});

function fakeGh(existing) {
  const calls = [];
  const runGh = (args, input) => {
    calls.push({ args, input });
    if (args[1] === 'list') return JSON.stringify(existing);
    if (args[1] === 'create') return 'https://github.com/pacocartones/free-llm-api-hub/issues/901\n';
    throw new Error(`unexpected gh ${args.join(' ')}`);
  };
  return { calls, runGh };
}

test('publishIssue opens the issue with its labels and the body on stdin', () => {
  const { calls, runGh } = fakeGh([{ number: 12, title: 'Free tier changes — October 2026', state: 'closed' }]);
  const r = publishIssue({ title: 'Free tier changes — November 2026', labels: ['data', 'help wanted'], body: 'BODY' }, runGh);
  assert.deepEqual(r, { created: true, number: 901 });
  const create = calls.find((c) => c.args[1] === 'create');
  assert.equal(create.input, 'BODY');
  assert.deepEqual(create.args.slice(create.args.indexOf('--label')), ['--label', 'data', '--label', 'help wanted']);
  assert.ok(create.args.includes('--repo'));
  assert.ok(calls[0].args.includes('all'), 'searches open and closed issues');
});

test('publishIssue is idempotent: an issue with the same title, even closed, is not opened again', () => {
  const { calls, runGh } = fakeGh([{ number: 900, title: 'Free tier changes — November 2026', state: 'closed' }]);
  assert.deepEqual(publishIssue({ title: 'Free tier changes — November 2026', labels: [], body: 'x' }, runGh), { created: false, number: 900 });
  assert.equal(calls.filter((c) => c.args[1] === 'create').length, 0);
});

test('publishIssue fails on an unexpected gh answer instead of guessing', () => {
  assert.throws(() => publishIssue({ title: 't', labels: [], body: 'b' }, () => '{}'), /Unexpected issue list/);
  const runGh = (args) => (args[1] === 'list' ? '[]' : 'not a url');
  assert.throws(() => publishIssue({ title: 't', labels: [], body: 'b' }, runGh), /no issue URL/);
});

test('the workflow runs monthly from main with full history and the least permissions it needs', () => {
  const wf = readFileSync(new URL('../.github/workflows/monthly-issues.yml', import.meta.url), 'utf8');
  assert.match(wf, /cron: '[^']+ 1 \* \*'/, 'runs on the first of the month');
  assert.match(wf, /^permissions: \{\}$/m);
  assert.match(wf, /issues: write/);
  assert.doesNotMatch(wf, /contents: write|pull-requests: write/);
  assert.match(wf, /fetch-depth: 0/, 'the change history is mined from git log');
  assert.match(wf, /node --test scripts\/monthly-issues\.test\.mjs/);
  assert.match(wf, /node scripts\/monthly-issues\.mjs --publish/);
});
