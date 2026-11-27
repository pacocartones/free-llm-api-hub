// contributors-page.mjs — /contributors/: everyone credited in data/contributors.json (written by npm run contributors
// from the git history), with the people whose first contribution landed in the current release cycle first, and how
// to get on the page. Rendered from the committed file only: no git, no network, no third-party images (each person
// gets their initials, not a hotlinked avatar, so the page asks nothing of another host).

import { escapeHtml } from './html.mjs';
import { initials, newThisCycle, KIND_ORDER } from './contributors.mjs';

const LOGIN_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

const KIND_LABEL = { data: 'data', site: 'site & code', docs: 'docs', tests: 'tests', ci: 'CI' };

/** The good-first-issue search the page and the README point to: open, unassigned. */
export const goodFirstIssuesUrl = (repo) =>
  `${repo}/issues?q=is%3Aissue+is%3Aopen+no%3Aassignee+label%3A%22good+first+issue%22`;

/** Valid entries only: a GitHub handle, a positive count and a date. Anything else is dropped, never rendered. */
export function contributorRows(data) {
  const list = data && Array.isArray(data.contributors) ? data.contributors : [];
  return list.filter((c) => c && LOGIN_RE.test(String(c.login)) && Number.isInteger(c.contributions) && c.contributions > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(String(c.first)));
}

function card(c, { isNew, flag = isNew }) {
  const login = String(c.login);
  const kinds = KIND_ORDER.filter((k) => (c.kinds || []).includes(k));
  const n = c.contributions;
  return `<li class="ctb-card${isNew ? ' ctb-new' : ''}">` +
    `<span class="ctb-avatar" aria-hidden="true">${escapeHtml(initials(login))}</span>` +
    '<div class="ctb-body">' +
    `<a class="ctb-login" href="https://github.com/${login}" rel="noopener">@${escapeHtml(login)}</a>` +
    `<p class="ctb-meta"><strong>${n}</strong> merged contribution${n === 1 ? '' : 's'} · since <time datetime="${c.first}">${c.first}</time></p>` +
    (kinds.length ? `<p class="ctb-kinds">${kinds.map((k) => `<span class="badge ctb-kind ctb-kind-${k}">${KIND_LABEL[k]}</span>`).join('')}</p>` : '') +
    (flag ? '<span class="ctb-flag">First contribution this cycle</span>' : '') +
    '</div></li>';
}

/** The main content of /contributors/. `release` is { version, date } of the latest release (lib/contributors.mjs). */
export function contributorsMainHtml(data, { repo, release, prefix = '../' }) {
  const rows = contributorRows(data);
  const fresh = newThisCycle(rows, release);
  const freshSet = new Set(fresh.map((c) => c.login));
  const total = rows.reduce((s, c) => s + c.contributions, 0);
  const stat = (num, lbl) => `<div class="stat"><div class="num">${num}</div><div class="lbl">${lbl}</div></div>`;
  const cycle = release ? `since v${escapeHtml(release.version)} (${escapeHtml(release.date)})` : '';

  const newSection = release
    ? '<section class="ctb-section" aria-labelledby="ctb-new-h"><h2 id="ctb-new-h">New this cycle</h2>' +
      (fresh.length
        ? `<p>Welcome! ${fresh.length === 1 ? 'This person' : `These ${fresh.length} people`} made a first contribution ${cycle}.</p>` +
          `<ul class="ctb-grid">${fresh.map((c) => card(c, { isNew: true, flag: false })).join('')}</ul>`
        : `<p>Nobody has made a first contribution ${cycle} yet. It could be you: see below.</p>`) +
      '</section>'
    : '';

  return '<main id="main"><div class="wrap">' +
    `<div class="stats stats-month ctb-stats">${stat(rows.length, 'contributors')}${stat(total, 'merged contributions')}${stat(fresh.length, release ? `first-timers ${cycle}` : 'first-timers')}</div>` +
    newSection +
    '<section class="ctb-section" aria-labelledby="ctb-all-h"><h2 id="ctb-all-h">Everyone, by first contribution</h2>' +
    '<p>A merged contribution is one merged pull request (or one commit on main outside a pull request) that the person authored, co-authored or opened. ' +
    'Commits carried over from a fork into another pull request keep their author. Kinds of work come from the files each contribution changed.</p>' +
    `<ul class="ctb-grid">${rows.map((c) => card(c, { isNew: freshSet.has(c.login) })).join('')}</ul></section>` +
    '<section class="ctb-section ctb-how" aria-labelledby="ctb-how-h"><h2 id="ctb-how-h">How to get on this page</h2>' +
    '<ol><li>Pick an unassigned <a href="' + escapeHtml(goodFirstIssuesUrl(repo)) + '" rel="noopener">good first issue</a>: each one names the files to change and the check to run.</li>' +
    `<li>Follow the <a href="${prefix}contributing/">contributing guide</a> (also in <a href="${escapeHtml(repo)}/blob/main/CONTRIBUTING.md" rel="noopener">CONTRIBUTING.md</a>): cite the provider's own page for a fact, run the tests, open a pull request.</li>` +
    '<li>Once it is merged, you are listed here at the next refresh, with your GitHub handle.</li></ol>' +
    `<p class="cta"><a class="btn primary" href="${escapeHtml(goodFirstIssuesUrl(repo))}" rel="noopener">Find a good first issue</a><a class="btn ghost" href="${prefix}contributing/">Read the contributing guide</a></p>` +
    '</section>' +
    `<p class="muted">Generated from the git history of main (data of ${escapeHtml(String(data && data.generated || ''))}) by <code>npm run contributors</code>; the same list is in <a href="${escapeHtml(repo)}/blob/main/CONTRIBUTORS.md" rel="noopener">CONTRIBUTORS.md</a>. ` +
    'Bots, coding assistants and the maintainers are not listed. Issues, reviews and ideas count too but are not in the git history: if you helped that way and want to be named, open an issue.</p>' +
    '</div></main>';
}
