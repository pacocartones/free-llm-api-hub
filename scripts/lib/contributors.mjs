// contributors.mjs — who contributed, from the git history of main. Pure functions: scripts/contributors.mjs reads git
// and writes data/contributors.json and CONTRIBUTORS.md; the build renders /contributors/ from the committed JSON only,
// so the site builds without git history or network.
//
// A contribution is one merged pull request (or one commit pushed to main outside a pull request). A person is credited
// for a pull request when they authored or co-authored (Co-authored-by trailer) one of its commits, or opened it. This
// includes commits carried over from a fork into another pull request: the commit keeps its author.
//
// Only public GitHub handles are kept. An email is used in memory to find the handle and is never written out:
//   1. a GitHub noreply address (12345+login@users.noreply.github.com) names the handle itself;
//   2. an author name equal to an excluded handle (a maintainer committing under another address) is that handle;
//   3. any other address takes the handle of the pull requests its commits are in: the fork owner in
//      "Merge pull request #N from owner/branch", or the pull request author recorded in a previous data/contributors.json.
// An address none of these resolves is left out (reported on stderr by the script), never guessed.

export const DEFAULT_EXCLUDE = ['pacocartones', 'LeonMAG'];

// Bots, apps and coding assistants. A handle in this list, or ending in [bot], or starting with app/, is not a person.
const BOT_LOGINS = new Set(['copilot', 'dependabot', 'github-actions', 'renovate', 'claude', 'codebuff', 'devin-ai-integration']);
export const isBotLogin = (login) => {
  const l = String(login || '').toLowerCase();
  return !l || l.endsWith('[bot]') || l.startsWith('app/') || BOT_LOGINS.has(l);
};

// 12345+login@users.noreply.github.com, login@users.noreply.github.com (and the users.noreply.com typo seen in the history).
const NOREPLY_RE = /^(?:\d+\+)?([A-Za-z0-9](?:[A-Za-z0-9-]{0,38})(?:\[bot\])?)@users\.noreply(?:\.github)?\.com$/i;
export function noreplyLogin(email) {
  const m = NOREPLY_RE.exec(String(email || '').trim());
  return m ? m[1] : null;
}

/**
 * Co-authors of a commit message: [{ name, email }], from its Co-authored-by trailers. Parsed with string operations,
 * not a backtracking regular expression: commit messages are untrusted text.
 */
export function coAuthors(message) {
  const out = [];
  const KEY = 'co-authored-by:';
  for (const raw of String(message || '').split('\n')) {
    const line = raw.trim();
    if (line.slice(0, KEY.length).toLowerCase() !== KEY) continue;
    const rest = line.slice(KEY.length);
    const open = rest.lastIndexOf('<');
    if (open < 0 || !rest.endsWith('>')) continue;
    const email = rest.slice(open + 1, -1).trim();
    if (!email || email.includes('<') || email.includes('>')) continue;
    out.push({ name: rest.slice(0, open).trim(), email });
  }
  return out;
}

/** "Merge pull request #12 from owner/branch" → { pr: 12, owner: 'owner' }; null for any other subject. */
export function parseMergeSubject(subject) {
  const m = /^Merge pull request #(\d+) from ([A-Za-z0-9-]+)\//.exec(String(subject || ''));
  return m ? { pr: Number(m[1]), owner: m[2] } : null;
}

/** "fix: something (#12)" → 12 (a squash merge); null otherwise. */
export function squashPr(subject) {
  const t = String(subject || '').trimEnd();
  if (!t.endsWith(')')) return null;
  const open = t.lastIndexOf('(#');
  const digits = open < 0 ? '' : t.slice(open + 2, -1);
  return /^\d{1,9}$/.test(digits) ? Number(digits) : null;
}

/**
 * The kind of work a changed path is. One of data, site, docs, tests, ci; null for a path that is none of them. Pages the
 * build writes (site/ other than the hand-written scripts, styles, home and 404 page; collections/) are null: older pull
 * requests committed them alongside a data change, and that is not site work.
 */
export function pathKind(path) {
  const p = String(path || '');
  if (/(^|\/)[^/]+\.test\.m?[jt]s$/.test(p) || /^scripts\/lib\/test-/.test(p) || /^tests?\//.test(p) || /(^|\/)fixtures?\//.test(p)) return 'tests';
  if (/^\.github\/workflows\//.test(p) || /^\.github\/actions\//.test(p)) return 'ci';
  if (/^collections\//.test(p)) return null;
  if (/^site\//.test(p) && !/^site\/([^/]+\.(js|css)|index\.html|404\.html)$/.test(p)) return null;
  if (/^data\//.test(p)) return 'data';
  if (/\.md$/i.test(p) || /^docs\//.test(p) || /^changes\//.test(p) || /^\.github\//.test(p) || /^CITATION\.cff$/.test(p)) return 'docs';
  if (/^(site|scripts|assets|packages|tools)\//.test(p) || /^package(-lock)?\.json$/.test(p)) return 'site';
  return null;
}

export const KIND_ORDER = ['data', 'site', 'docs', 'tests', 'ci'];

// The record format scripts/contributors.mjs asks git for: one record per commit, fields separated by \x1f, the
// changed paths (--name-only) after the last separator.
export const GIT_LOG_FORMAT = '%x1e%H%x1f%an%x1f%ae%x1f%cI%x1f%s%x1f%B%x1f';

/** Parse `git log --no-merges --name-only --format=GIT_LOG_FORMAT` into commits. */
export function parseGitLog(text) {
  const commits = [];
  for (const rec of String(text || '').split('\x1e')) {
    if (!rec.trim()) continue;
    const f = rec.split('\x1f');
    if (f.length < 7) continue;
    const [sha, name, email, date, subject, body, rest] = f;
    commits.push({
      sha: sha.trim(), name, email, date: date.slice(0, 10), subject, coAuthors: coAuthors(body),
      files: rest.split('\n').map((s) => s.trim()).filter(Boolean),
    });
  }
  return commits;
}

const lc = (s) => String(s || '').toLowerCase();

/**
 * Aggregate the contributors.
 *   commits     [{ sha, name, email, date (landed on main, YYYY-MM-DD), subject, coAuthors, files }]
 *   prOf        Map sha → pull request number (commits in no pull request are absent)
 *   prs         Map number → { merged: 'YYYY-MM-DD', owner?: fork owner from the merge subject, author?: known author }
 *   exclude     handles never listed (the maintainers)
 * Returns { contributors, unresolved } where unresolved is the number of commits (and co-author lines) left out
 * because no handle could be found for their address. Nothing in the result carries an email or a real name.
 */
export function collectContributors({ commits, prOf = new Map(), prs = new Map(), exclude = DEFAULT_EXCLUDE }) {
  const excluded = new Set(exclude.map(lc));
  const prAuthor = (n) => {
    const pr = prs.get(n);
    if (!pr) return null;
    if (pr.owner && !excluded.has(lc(pr.owner))) return pr.owner;
    return pr.author || pr.owner || null;
  };
  const direct = (name, email) => {
    const nr = noreplyLogin(email);
    if (nr) return nr;
    const byName = exclude.find((x) => lc(x) === lc(name));
    return byName || null;
  };

  // Votes: which handle does each other address belong to, from the pull requests its commits are in.
  const votes = new Map();
  for (const c of commits) {
    if (direct(c.name, c.email)) continue;
    const n = prOf.get(c.sha);
    const who = n != null ? prAuthor(n) : null;
    if (!who) continue;
    const key = lc(c.email);
    const v = votes.get(key) || new Map();
    v.set(who, (v.get(who) || 0) + 1);
    votes.set(key, v);
  }
  const byEmail = new Map();
  for (const [email, v] of votes) {
    const best = [...v.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    byEmail.set(email, best[0]);
  }
  const resolve = (name, email) => direct(name, email) || byEmail.get(lc(email)) || null;

  const people = new Map(); // lc(login) → record
  const credit = (login, key, date, kinds) => {
    if (!login || isBotLogin(login) || excluded.has(lc(login))) return;
    const p = people.get(lc(login)) || { login, keys: new Set(), prs: new Set(), first: date, last: date, kinds: new Set() };
    p.keys.add(key);
    if (typeof key === 'number') p.prs.add(key);
    if (date < p.first) p.first = date;
    if (date > p.last) p.last = date;
    for (const k of kinds) p.kinds.add(k);
    people.set(lc(login), p);
  };

  let unresolved = 0;
  for (const c of commits) {
    const n = prOf.get(c.sha);
    const key = n != null ? n : `commit:${c.sha}`;
    const date = n != null && prs.get(n)?.merged ? prs.get(n).merged : c.date;
    const kinds = [...new Set(c.files.map(pathKind).filter(Boolean))];
    const authors = [{ name: c.name, email: c.email }, ...c.coAuthors];
    for (const a of authors) {
      const login = resolve(a.name, a.email);
      if (!login) { unresolved += 1; continue; }
      credit(login, key, date, kinds);
    }
  }
  // Whoever opened a pull request is credited for it, even when every commit in it is someone else's.
  for (const [n, pr] of prs) {
    const who = prAuthor(n);
    if (who && pr.merged) credit(who, n, pr.merged, []);
  }

  const contributors = [...people.values()].map((p) => ({
    login: p.login,
    contributions: p.keys.size,
    prs: [...p.prs].sort((a, b) => a - b),
    first: p.first,
    last: p.last,
    kinds: KIND_ORDER.filter((k) => p.kinds.has(k)),
  })).sort(compareContributors);
  return { contributors, unresolved };
}

/** Order of the page and the file: first contribution, then handle. */
export const compareContributors = (a, b) =>
  (a.first < b.first ? -1 : a.first > b.first ? 1 : lc(a.login) < lc(b.login) ? -1 : lc(a.login) > lc(b.login) ? 1 : 0);

/** The pull request → author map a previous data/contributors.json implies (a pull request listed for one person only). */
export function knownPrAuthors(previous) {
  const seen = new Map();
  for (const c of (previous && Array.isArray(previous.contributors) ? previous.contributors : [])) {
    for (const n of c.prs || []) seen.set(n, seen.has(n) ? null : c.login);
  }
  return new Map([...seen].filter(([, v]) => v));
}

/** Two-letter initials for a handle: the first letters of its first two words, else its first two characters. */
export function initials(login) {
  const words = String(login || '').replace(/\[bot\]$/i, '').split(/[-_.\d]+/).filter(Boolean);
  const s = words.length > 1 ? words[0][0] + words[1][0] : (words[0] || String(login || '?')).slice(0, 2);
  return s.toUpperCase();
}

/** The latest released version in CHANGELOG.md: { version, date } or null. The current cycle starts the day after. */
export function latestRelease(changelog) {
  for (const line of String(changelog || '').split('\n')) {
    const head = /^## \[(\d+\.\d+\.\d+)\]/.exec(line);
    if (!head) continue;
    const date = /\d{4}-\d{2}-\d{2}/.exec(line.slice(head[0].length));
    if (date) return { version: head[1], date: date[0] };
  }
  return null;
}

/** Contributors whose first contribution landed after the release date (the current cycle). */
export const newThisCycle = (contributors, release) =>
  release ? contributors.filter((c) => c.first > release.date) : [];

/** CONTRIBUTORS.md, from the same data as the page. */
export function contributorsMarkdown(data, { repo, site }) {
  const link = (n) => `[#${n}](${repo}/pull/${n})`;
  const out = ['# Contributors', ''];
  out.push(`Thank you to everyone who has contributed here. This list is generated from the git history of \`main\` by \`npm run contributors\` (\`scripts/contributors.mjs\`): commit authors and co-authors, including commits carried over from forks, credited by their public GitHub handle. It is ordered by first contribution; the same list is on the site at [${site.replace(/^https?:\/\//, '')}/contributors/](${site}/contributors/).`, '');
  out.push('| Contributor | Contributions | First contribution | Kinds of work |', '|---|---|---|---|');
  for (const c of data.contributors) {
    const shown = c.prs.slice(0, 6).map(link).join(', ') + (c.prs.length > 6 ? `, and ${c.prs.length - 6} more` : '');
    out.push(`| [@${c.login}](https://github.com/${c.login}) | ${c.contributions}${shown ? `: ${shown}` : ''} | ${c.first} | ${c.kinds.join(', ') || '—'} |`);
  }
  out.push('', 'Issues, reviews, ideas and bug reports count too; they are not in this table because they are not in the git history. If you contributed that way and want to be named, open an issue.', '');
  return out.join('\n');
}
