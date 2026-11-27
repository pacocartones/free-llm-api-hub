#!/usr/bin/env node
// Writes data/contributors.json and CONTRIBUTORS.md from the git history of main. The build renders /contributors/ from
// the committed JSON only (no git history, no network); run this at release time, or whenever you want the page current.
//
//   npm run contributors              # reads git (needs the full history: git fetch --unshallow), writes both files
//   npm run contributors -- --gh      # also asks `gh` (read only) who opened each merged pull request
//   npm run contributors -- --pr-author 193=login   # name the author of a squash-merged pull request git cannot tell
//   node scripts/contributors.mjs --stdout   # print the JSON instead of writing
//
// How handles are found and who is left out: scripts/lib/contributors.mjs. No email or real name is ever written.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  GIT_LOG_FORMAT, parseGitLog, parseMergeSubject, squashPr, collectContributors, knownPrAuthors, contributorsMarkdown,
  DEFAULT_EXCLUDE,
} from './lib/contributors.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_SLUG = process.env.GITHUB_REPOSITORY || 'pacocartones/free-llm-api-hub';
const REPO = `https://github.com/${REPO_SLUG}`;
const SITE = 'https://freellmapihub.com';
const args = new Set(process.argv.slice(2));
const ref = process.env.CONTRIBUTORS_REF || 'HEAD';

const git = (a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

if (git(['rev-parse', '--is-shallow-repository']).trim() === 'true') {
  console.error('contributors: this clone is shallow, so older contributors would be missing. Run `git fetch --unshallow` first.');
  process.exit(1);
}

// Every non-merge commit reachable from ref, with its changed paths.
const commits = parseGitLog(git(['log', '--no-merges', '--name-only', `--format=${GIT_LOG_FORMAT}`, ref]));

// Pull requests: a merge commit "Merge pull request #N from owner/branch" brings in the commits of P1..P2 (oldest merge
// first, so a commit belongs to the first pull request that brought it to main); a squash merge ends its subject in (#N).
const prOf = new Map();
const prs = new Map();
const merges = git(['log', '--merges', '--reverse', '--format=%H%x1f%P%x1f%cI%x1f%s', ref]).split('\n').filter(Boolean);
for (const line of merges) {
  const [, parents, date, subject] = line.split('\x1f');
  const m = parseMergeSubject(subject);
  if (!m) continue;
  const [p1, p2] = parents.split(' ');
  if (!p2) continue;
  prs.set(m.pr, { merged: date.slice(0, 10), owner: m.owner });
  for (const sha of git(['rev-list', '--no-merges', `${p1}..${p2}`]).split('\n').filter(Boolean)) {
    if (!prOf.has(sha)) prOf.set(sha, m.pr);
  }
}
for (const c of commits) {
  if (prOf.has(c.sha)) continue;
  const n = squashPr(c.subject);
  if (n == null) continue;
  prOf.set(c.sha, n);
  if (!prs.has(n)) prs.set(n, { merged: c.date });
}

// Who opened each pull request: from the previous file, else the old pull-request table of CONTRIBUTORS.md, and with
// --gh from GitHub itself. Used for squash-merged pull requests and addresses that are not GitHub noreply addresses.
const jsonPath = join(ROOT, 'data/contributors.json');
const mdPath = join(ROOT, 'CONTRIBUTORS.md');
const authors = existsSync(jsonPath) ? knownPrAuthors(JSON.parse(readFileSync(jsonPath, 'utf8'))) : new Map();
if (existsSync(mdPath)) {
  for (const line of readFileSync(mdPath, 'utf8').split('\n')) {
    const who = /^\| \[@([A-Za-z0-9-]+)\]/.exec(line);
    if (!who) continue;
    for (const m of line.matchAll(/\[#(\d+)\]/g)) if (!authors.has(Number(m[1]))) authors.set(Number(m[1]), who[1]);
  }
}
if (args.has('--gh')) {
  const list = JSON.parse(execFileSync('gh', ['pr', 'list', '-R', REPO_SLUG, '--state', 'merged', '--limit', '5000', '--json', 'number,author'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
  for (const pr of list) if (pr.author?.login) authors.set(pr.number, pr.author.login);
}
// --pr-author 193=login: name the author of a squash-merged pull request git cannot tell (one run is enough: the
// next run reads it back from data/contributors.json).
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] !== '--pr-author') continue;
  const m = /^(\d+)=([A-Za-z0-9-]+)$/.exec(argv[i + 1] || '');
  if (!m) { console.error('contributors: --pr-author expects NUMBER=login'); process.exit(2); }
  authors.set(Number(m[1]), m[2]);
}
for (const [n, pr] of prs) if (authors.has(n)) pr.author = authors.get(n);

const { contributors, unresolved } = collectContributors({ commits, prOf, prs, exclude: DEFAULT_EXCLUDE });
const generated = git(['log', '-1', '--format=%cI', ref]).trim().slice(0, 10);
const data = {
  generated,
  source: 'The git history of main: commit authors and Co-authored-by trailers, credited by public GitHub handle. Written by `npm run contributors`; never edit by hand.',
  contributors,
};
const json = JSON.stringify(data, null, 2) + '\n';

if (args.has('--stdout')) {
  process.stdout.write(json);
} else {
  writeFileSync(jsonPath, json);
  writeFileSync(mdPath, contributorsMarkdown(data, { repo: REPO, site: SITE }));
  console.error(`contributors: wrote data/contributors.json and CONTRIBUTORS.md: ${contributors.length} people, ${commits.length} commits, ${prs.size} pull requests`);
}
if (unresolved) console.error(`contributors: ${unresolved} author or co-author lines had no GitHub handle (assistants, local addresses, or an unknown pull request author) and are not listed`);
