import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { tmpFile } from './lib/tmp.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'contributors.mjs');

const pr = (number, login, mergedAt) => ({ number, title: `PR ${number}`, author: { login }, mergedAt });

// Run the script on a fixture list, as `npm run contributors` does from `gh`'s JSON, and return the table rows.
function rows(prs, env = {}) {
  const file = tmpFile('merged.json');
  writeFileSync(file, JSON.stringify(prs));
  const { GITHUB_REPOSITORY: _ignored, ...base } = process.env;
  const out = execFileSync(process.execPath, [SCRIPT, file], { encoding: 'utf8', env: { ...base, ...env } });
  return out.split('\n').filter((line) => line.startsWith('| [@'));
}

const login = (row) => row.match(/^\| \[@([^\]]+)\]/)[1];

test('contributors: the maintainers are not listed', () => {
  const listed = rows([
    pr(1, 'pacocartones', '2026-01-01T00:00:00Z'),
    pr(2, 'LeonMAG', '2026-01-02T00:00:00Z'),
    pr(3, 'alice', '2026-01-03T00:00:00Z'),
  ]).map(login);
  assert.deepEqual(listed, ['alice']);
});

test('contributors: apps and bots are not listed', () => {
  const listed = rows([
    pr(1, 'app/dependabot', '2026-01-01T00:00:00Z'),
    pr(2, 'renovate[bot]', '2026-01-02T00:00:00Z'),
    pr(3, 'alice', '2026-01-03T00:00:00Z'),
  ]).map(login);
  assert.deepEqual(listed, ['alice']);
});

test('contributors: rows are ordered by first merged date, ties broken by login', () => {
  const listed = rows([
    pr(1, 'zoe', '2026-03-01T00:00:00Z'),
    pr(2, 'carol', '2026-02-01T00:00:00Z'),
    pr(3, 'bob', '2026-02-01T00:00:00Z'),
    pr(4, 'zoe', '2026-01-15T00:00:00Z'),
  ]).map(login);
  // zoe's first merge (Jan 15) puts her first; bob and carol tie on Feb 1 and sort by login.
  assert.deepEqual(listed, ['zoe', 'bob', 'carol']);
});

test('contributors: more than 6 merged PRs shows the first 6 and "and N more"', () => {
  const prs = [9, 3, 8, 1, 7, 2, 6, 5].map((n) => pr(n, 'alice', `2026-01-0${n}T00:00:00Z`));
  const [row] = rows(prs);
  assert.match(row, /\| 8: #1, #2, #3, #5, #6, #7, and 2 more \|/);
});

test('contributors: with GITHUB_REPOSITORY set, PR numbers link to that repository', () => {
  const [row] = rows([pr(42, 'alice', '2026-01-01T00:00:00Z')], { GITHUB_REPOSITORY: 'owner/repo' });
  assert.ok(row.includes('[#42](https://github.com/owner/repo/pull/42)'), row);
});
