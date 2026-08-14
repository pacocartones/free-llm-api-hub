// contributors.mjs — the external-contributor count, mined from the git
// history of data/providers.json. No longer rendered into the README (that is
// a live shields.io badge now, so it cannot go stale); this remains the
// canonical definition, used for local reporting and pinned by tests.
//
// "External" means a human who touched data/providers.json and is neither the
// maintainer nor an automation account. Deterministic given the history, so a
// fixed checkout always renders the same number (PR CI never flakes); returns 0
// when git is unavailable (tarball build).

import { execSync } from 'node:child_process';

const BOT_AUTHORS = new Set(['github-actions[bot]', 'dependabot[bot]', 'coderabbitai[bot]']);
const MAINTAINER_EMAILS = new Set([
  'manusanchezhl@gmail.com',
  '253313177+pacocartones@users.noreply.github.com',
]);

// Pure: count distinct external contributor emails in a `git log` --format
// stream ("%an<0x1f>%ae" per line). Malformed or empty lines are skipped.
export const countExternalContributorsFromLog = (log) =>
  new Set(
    (log || '')
      .split('\n')
      .map((l) => l.split('\x1f'))
      .filter(([name, email]) => name && email && !BOT_AUTHORS.has(name) && !MAINTAINER_EMAILS.has(email))
      .map(([, email]) => email)
  ).size;

export const countExternalContributors = ({ cwd }) => {
  try {
    const log = execSync(
      'git log --pretty=format:%an%x1f%ae -- data/providers.json',
      { cwd, encoding: 'utf8', maxBuffer: 1024 * 1024 * 8 }
    );
    return countExternalContributorsFromLog(log);
  } catch (_) {
    return 0; // no git available — keep the stats line honest at zero
  }
};

// Full list of external human contributors, oldest-first (each person's FIRST
// commit), so the README "Contributors" section can be rendered from git
// history and never go stale. Mined from ALL files — contributors can touch
// docs or scripts, not just data/providers.json. Returns [] without git.
export const listExternalContributors = ({ cwd }) => {
  try {
    const log = execSync(
      'git log --reverse --no-merges --pretty=format:%an%x1f%ae%x1f%s',
      { cwd, encoding: 'utf8', maxBuffer: 1024 * 1024 * 8 }
    );
    const byEmail = new Map();
    for (const line of (log || '').split('\n')) {
      const [name, email, subject] = line.split('\x1f');
      if (!name || !email || !subject) continue;
      if (BOT_AUTHORS.has(name) || MAINTAINER_EMAILS.has(email)) continue;
      if (!byEmail.has(email)) byEmail.set(email, { name, email, subject });
    }
    return [...byEmail.values()];
  } catch (_) {
    return [];
  }
};

// GitHub profile URL from a noreply email (ID+username@users.noreply.github.com)
// or from a name that is already a bare username (no spaces). null when unknown.
export const githubProfileUrl = (name, email) => {
  const m = /\+([^@]+)@users\.noreply\.github\.com$/.exec(email || '');
  if (m) return 'https://github.com/' + m[1];
  if (/^[\w.-]+$/.test(name)) return 'https://github.com/' + name;
  return null;
};
