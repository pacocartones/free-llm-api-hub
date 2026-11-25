import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { makeTmpDir } from './lib/tmp.mjs';
import { readProviderRevisions, historyFromRevisions } from './lib/history.mjs';

// A repository where two pull request branches are open at the same time and
// both edit data/providers.json: their commits interleave by date (A1, B1, A2)
// before main merges A, then B, with merge commits.
function overlappingBranches(t) {
  const cwd = makeTmpDir('history-');
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (date, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env,
    GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.com',
    GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.com',
    GIT_AUTHOR_DATE: `${date}T10:00:00Z`, GIT_COMMITTER_DATE: `${date}T10:00:00Z` } }).trim();
  git('2026-10-30', 'init', '-q');
  git('2026-10-30', 'symbolic-ref', 'HEAD', 'refs/heads/main');
  mkdirSync(join(cwd, 'data'));
  // One field per line and a provider between the two edited ones, so git
  // merges the two branches without a conflict.
  const providers = {
    alpha: { slug: 'alpha', name: 'Alpha', rate_limits: '10 rpm', notes: 'none' },
    filler: { slug: 'filler', name: 'Filler', rate_limits: '1 rpm', notes: 'none' },
    beta: { slug: 'beta', name: 'Beta', rate_limits: '5 rpm', notes: 'none' },
  };
  const commit = (date, message, edit = {}) => {
    for (const [slug, fields] of Object.entries(edit)) Object.assign(providers[slug], fields);
    writeFileSync(join(cwd, 'data/providers.json'), JSON.stringify({ providers: Object.values(providers) }, null, 2) + '\n');
    git(date, 'add', '.');
    git(date, 'commit', '-qm', message);
  };
  commit('2026-10-30', 'base');
  const snapshot = () => JSON.parse(JSON.stringify(providers));
  const base = snapshot();
  git('2026-11-02', 'checkout', '-qb', 'branch-a');
  commit('2026-11-02', 'A1', { alpha: { rate_limits: '20 rpm' } });
  const afterA1 = snapshot();
  git('2026-11-03', 'checkout', '-q', 'main');
  Object.assign(providers.alpha, base.alpha); // branch B starts from main, without A1
  git('2026-11-03', 'checkout', '-qb', 'branch-b');
  commit('2026-11-03', 'B1', { beta: { notes: 'phone needed' } });
  git('2026-11-04', 'checkout', '-q', 'branch-a');
  Object.assign(providers.alpha, afterA1.alpha); Object.assign(providers.beta, base.beta);
  commit('2026-11-04', 'A2', { alpha: { notes: 'card needed' } });
  git('2026-11-05', 'checkout', '-q', 'main');
  git('2026-11-05', 'merge', '-q', '--no-ff', '-m', 'Merge branch-a', 'branch-a');
  git('2026-11-06', 'merge', '-q', '--no-ff', '-m', 'Merge branch-b', 'branch-b');
  return cwd;
}

test('the history follows main\'s first-parent line: two overlapping merged branches count each field change once, on the day it landed', (t) => {
  const cwd = overlappingBranches(t);
  const revisions = readProviderRevisions(cwd);
  assert.deepEqual(revisions.map((r) => r.date), ['2026-10-30', '2026-11-05', '2026-11-06'],
    'one revision per merge, none from inside the branches');
  const { historyBySlug, monthEnd } = historyFromRevisions(revisions);
  const changes = (slug) => historyBySlug[slug].filter((e) => e.kind === 'changed').map((e) => ({ date: e.date, changes: e.changes }));
  assert.deepEqual(changes('alpha'), [{ date: '2026-11-05', changes: [
    { field: 'rate_limits', from: '10 rpm', to: '20 rpm' },
    { field: 'notes', from: 'none', to: 'card needed' },
  ] }], 'no flip back to 10 rpm from branch B\'s revision');
  assert.deepEqual(changes('beta'), [{ date: '2026-11-06', changes: [{ field: 'notes', from: 'none', to: 'phone needed' }] }]);
  assert.deepEqual(changes('filler'), []);
  for (const slug of ['alpha', 'beta', 'filler']) {
    assert.deepEqual(historyBySlug[slug].filter((e) => e.kind === 'added').map((e) => e.date), ['2026-10-30'], `${slug} is added once`);
  }
  const november = monthEnd['2026-11'];
  assert.equal(november.date, '2026-11-06', 'the month-end snapshot is main after both merges');
  const bySlug = Object.fromEntries(november.providers.map((p) => [p.slug, p]));
  assert.equal(bySlug.alpha.rate_limits, '20 rpm');
  assert.equal(bySlug.alpha.notes, 'card needed');
  assert.equal(bySlug.beta.notes, 'phone needed');
});
