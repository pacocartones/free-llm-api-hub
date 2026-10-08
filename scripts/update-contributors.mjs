// update-contributors.mjs — regenerate data/contributors.json from the repository's commits.
// Run this locally after merging a contribution (the same on-demand model as
// reverify/badge/probe — no Actions, no secrets).
//
// Why a committed JSON instead of mining during the build: build.mjs runs inside the
// "Dataset integrity" gate, where the checkout is the PR's merge commit. Mining there is
// auto-referential — the contributor's own unmerged commit appears, rewrites the README
// Contributors section, and the "generated files must be in sync" step fails (this blocked
// PR #183). Rendering from data/contributors.json keeps the build deterministic; the list
// advances one step at a time, whenever a maintainer runs this script.
//
// Identity is the GitHub login. The commits API links every commit to the account that
// made it, so no e-mail address is read, kept or printed; the maintainer is excluded by
// login (MAINTAINER_LOGINS). Only merged history is visible to the API, which is what we want.
//
//   node scripts/update-contributors.mjs [owner/repo]
// An optional GITHUB_TOKEN raises the rate limit; none is needed for a public repo.

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { externalContributors } from './lib/contributors.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = process.argv[2] || 'pacocartones/free-llm-api-hub';
const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'free-llm-api-hub-update-contributors' };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

const commits = [];
for (let page = 1; ; page++) {
  const res = await fetch(`https://api.github.com/repos/${REPO}/commits?per_page=100&page=${page}`, { headers });
  if (!res.ok) throw new Error(`GitHub commits API: HTTP ${res.status} for ${REPO} (page ${page})`);
  const batch = await res.json();
  if (!batch.length) break;
  for (const c of batch) {
    if ((c.parents || []).length > 1) continue; // merge commits
    commits.push({
      login: c.author?.login ?? null,
      name: c.commit?.author?.name ?? '',
      subject: (c.commit?.message || '').split('\n')[0],
    });
  }
  if (batch.length < 100) break;
}

const contributors = externalContributors(commits.reverse()); // API is newest-first
writeFileSync(join(ROOT, 'data/contributors.json'), JSON.stringify({ contributors }, null, 2) + '\n');
console.log(`Wrote ${contributors.length} external contributor(s) to data/contributors.json`);
for (const c of contributors) console.log(`  - ${c.name}${c.login ? ' (@' + c.login + ')' : ' (no linked account)'}`);
