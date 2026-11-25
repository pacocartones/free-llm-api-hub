#!/usr/bin/env node
// Builds CONTRIBUTORS.md from the merged pull requests of this repository.
// No services, no dependencies: it reads the JSON that `gh` prints.
//
//   npm run contributors        # release step: asks `gh` (read only) and rewrites CONTRIBUTORS.md
//
// or, from a saved list (this is what the tests use):
//
//   gh pr list --state merged --limit 1000 --json number,title,author,mergedAt > /tmp/merged.json
//   node scripts/contributors.mjs /tmp/merged.json > CONTRIBUTORS.md
//
// Maintainers, bots and apps are left out (see EXCLUDE). Only public GitHub handles
// are listed, never emails or real names. Counts are merged pull requests.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const EXCLUDE = new Set(['pacocartones', 'LeonMAG']);
const isBot = (author) => Boolean(author.is_bot) || author.login.startsWith('app/') || author.login.endsWith('[bot]');
const DEFAULT_REPO = 'pacocartones/free-llm-api-hub';

const write = process.argv[2] === '--write';
const file = process.argv[2];
if (!file) { console.error('usage: node scripts/contributors.mjs merged.json [owner/repo] | --write'); process.exit(2); }
const repo = process.env.GITHUB_REPOSITORY || (write ? DEFAULT_REPO : process.argv[3] || '');
const LIMIT = 5000;
const prs = write
  ? JSON.parse(execFileSync('gh', ['pr', 'list', '-R', repo, '--state', 'merged', '--limit', String(LIMIT),
    '--json', 'number,title,author,mergedAt'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }))
  : JSON.parse(readFileSync(file, 'utf8'));
if (write && prs.length >= LIMIT) { console.error(`contributors: ${prs.length} merged pull requests reached the limit; raise LIMIT`); process.exit(1); }

const people = new Map();
for (const pr of prs) {
  const login = pr.author?.login;
  if (!login || isBot(pr.author) || EXCLUDE.has(login)) continue;
  const p = people.get(login) ?? { login, prs: [], first: pr.mergedAt };
  p.prs.push(pr.number);
  if (pr.mergedAt < p.first) p.first = pr.mergedAt;
  people.set(login, p);
}

const link = (n) => (repo ? `[#${n}](https://github.com/${repo}/pull/${n})` : `#${n}`);
const rows = [...people.values()].sort((a, b) => (a.first < b.first ? -1 : a.first > b.first ? 1 : a.login.localeCompare(b.login)));

const out = [];
out.push('# Contributors', '');
out.push('Thank you to everyone whose pull request was merged here. This list is generated from the merged pull requests (`scripts/contributors.mjs`), so it only contains what is in the history; it is ordered by first merged contribution.', '');
out.push('| Contributor | Merged PRs | First merged |', '|---|---|---|');
for (const p of rows) {
  const nums = p.prs.sort((a, b) => a - b);
  const shown = nums.slice(0, 6).map(link).join(', ') + (nums.length > 6 ? `, and ${nums.length - 6} more` : '');
  out.push(`| [@${p.login}](https://github.com/${p.login}) | ${nums.length}: ${shown} | ${p.first.slice(0, 10)} |`);
}
out.push('', 'Issues, reviews, ideas and bug reports count too; they are not in this table because they are not in the git history. If you contributed that way and want to be named, open an issue.', '');
if (write) {
  writeFileSync(new URL('../CONTRIBUTORS.md', import.meta.url), out.join('\n'));
  console.error(`contributors: wrote CONTRIBUTORS.md with ${rows.length} people from ${prs.length} merged pull requests`);
} else {
  process.stdout.write(out.join('\n'));
}
