// update-contributors.mjs — regenerate data/contributors.json from the git
// history. Run this locally after merging a contribution (the same on-demand
// model as reverify/badge/probe — no Actions, no secrets).
//
// Why a committed JSON instead of mining git during the build: build.mjs runs
// inside the "Dataset integrity" gate, where the checkout is the PR's merge
// commit. Mining `git log` there is auto-referential — the contributor's own
// unmerged commit appears in the log, rewrites the README Contributors section,
// and the "generated files must be in sync" step fails (this blocked PR #183).
// Rendering from data/contributors.json keeps the build deterministic; the list
// advances one step at a time, whenever a maintainer runs this script.

import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const BOT_AUTHORS = new Set(['github-actions[bot]', 'dependabot[bot]', 'coderabbitai[bot]']);

// Manual GitHub logins for contributors whose author email is a personal
// address (the profile URL can't be derived from it). Keyed by author email.
const LOGIN_OVERRIDES = {
  'nandiswarnabha@gmail.com': 'Swarnabha753',
};
const MAINTAINER_EMAILS = new Set([
  'manusanchezhl@gmail.com',
  '253313177+pacocartones@users.noreply.github.com',
]);

// Mine from origin/main when available so unmerged local commits are excluded;
// fall back to HEAD (tarball/CI checkout without the remote ref).
const REF = process.argv[2] || 'origin/main';
const refs = [REF, 'HEAD'];
let log = '';
for (const ref of refs) {
  try {
    log = execSync(`git log ${ref} --reverse --no-merges --pretty=format:%an%x1f%ae%x1f%s`, {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 8,
    });
    break;
  } catch (_) {
    /* try the next ref */
  }
}

const byEmail = new Map();
for (const line of (log || '').split('\n')) {
  const [name, email, subject] = line.split('\x1f');
  if (!name || !email || !subject) continue;
  if (BOT_AUTHORS.has(name) || MAINTAINER_EMAILS.has(email)) continue;
  if (!byEmail.has(email)) byEmail.set(email, { name, email, subject });
}

const contributors = [...byEmail.values()].map((c) => ({
  ...c,
  ...(LOGIN_OVERRIDES[c.email] ? { login: LOGIN_OVERRIDES[c.email] } : {}),
}));
writeFileSync(join(ROOT, 'data/contributors.json'), JSON.stringify({ contributors }, null, 2) + '\n');
console.log(`Wrote ${contributors.length} external contributor(s) to data/contributors.json`);
for (const c of contributors) console.log(`  - ${c.name} <${c.email}>`);
