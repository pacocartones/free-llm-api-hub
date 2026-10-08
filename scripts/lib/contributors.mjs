// contributors.mjs — who counts as an external contributor.
//
// Identity is the GitHub login, never an e-mail address: the repository must not
// carry anyone's personal mailbox in code, tests or data. The logins come from the
// GitHub commits API (see update-contributors.mjs), which resolves each commit to
// the account that made it; this module only holds the pure rules.
//
// "External" means an account that is neither the maintainer nor an automation
// account. Deterministic given its input, so a fixed list always yields the same
// number (PR CI never flakes).

// The maintainer is excluded by login, not by the addresses they happened to commit with.
export const MAINTAINER_LOGINS = new Set(['pacocartones', 'LeonMAG'].map((l) => l.toLowerCase()));

const isBot = ({ login, name }) => /\[bot\]$/.test(login || '') || /\[bot\]$/.test(name || '');

// Stable identity of a commit author: the resolved login, else the display name
// (a commit the API could not link to an account). Null when there is neither.
const identity = ({ login, name }) => (login ? 'login:' + login.toLowerCase() : name ? 'name:' + name : null);

/**
 * External contributors from commits, oldest first, one per person (their FIRST commit).
 * commits: [{ login: string|null, name: string, subject: string }], oldest first.
 */
export const externalContributors = (commits) => {
  const seen = new Map();
  for (const c of commits || []) {
    if (!c || !c.subject || isBot(c)) continue;
    if (c.login && MAINTAINER_LOGINS.has(c.login.toLowerCase())) continue;
    const id = identity(c);
    if (!id || seen.has(id)) continue;
    seen.set(id, { name: c.name || c.login, ...(c.login ? { login: c.login } : {}), subject: c.subject });
  }
  return [...seen.values()];
};

export const countExternalContributors = (commits) => externalContributors(commits).length;

// GitHub profile URL for a contributor record; null when the commit was not linked to an account.
export const githubProfileUrl = ({ login }) => (login ? 'https://github.com/' + login : null);
