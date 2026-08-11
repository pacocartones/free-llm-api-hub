// contributors.mjs — the external-contributor count for the README stats line,
// shared by build.mjs and its tests so the rule has ONE home.
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
