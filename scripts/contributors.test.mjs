import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  noreplyLogin, coAuthors, parseMergeSubject, squashPr, pathKind, parseGitLog, GIT_LOG_FORMAT, collectContributors,
  knownPrAuthors, initials, latestRelease, newThisCycle, contributorsMarkdown, isBotLogin,
} from './lib/contributors.mjs';
import { contributorsMainHtml, contributorRows, goodFirstIssuesUrl } from './lib/contributors-page.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const REPO = 'https://github.com/owner/repo';

const commit = (sha, name, email, date, files = ['data/providers.json'], extra = {}) =>
  ({ sha, name, email, date, subject: `commit ${sha}`, coAuthors: [], files, ...extra });

// ---------- identities ----------

test('contributors: a GitHub noreply address names its handle; any other address does not', () => {
  assert.equal(noreplyLogin('12345+alice-b@users.noreply.github.com'), 'alice-b');
  assert.equal(noreplyLogin('alice@users.noreply.github.com'), 'alice');
  assert.equal(noreplyLogin('9+dependabot[bot]@users.noreply.github.com'), 'dependabot[bot]');
  assert.equal(noreplyLogin('alice@example.com'), null);
  assert.equal(noreplyLogin('noreply@anthropic.com'), null);
});

test('contributors: Co-authored-by trailers and pull request subjects are read', () => {
  assert.deepEqual(coAuthors('fix: x\n\nCo-authored-by: Bob B <1+bob@users.noreply.github.com>\nco-authored-by: C <c@x.org>'),
    [{ name: 'Bob B', email: '1+bob@users.noreply.github.com' }, { name: 'C', email: 'c@x.org' }]);
  assert.deepEqual(parseMergeSubject('Merge pull request #948 from Aadithya-kl/fix/x'), { pr: 948, owner: 'Aadithya-kl' });
  assert.equal(parseMergeSubject("Merge branch 'main' into fix/x"), null);
  assert.equal(squashPr('docs: add walkthrough (#193)'), 193);
  assert.equal(squashPr('docs: see #193 later'), null);
});

test('contributors: bots, apps and coding assistants are not people', () => {
  for (const l of ['dependabot[bot]', 'app/renovate', 'Copilot', 'github-actions', 'claude']) assert.ok(isBotLogin(l), l);
  assert.ok(!isBotLogin('alice'));
});

test('contributors: parseGitLog reads the record format the script asks git for', () => {
  assert.ok(GIT_LOG_FORMAT.startsWith('%x1e'));
  const text = '\x1eabc\x1fAlice\x1f1+alice@users.noreply.github.com\x1f2026-11-02T10:00:00+00:00\x1fdata: x (#5)\x1fdata: x (#5)\n\nCo-authored-by: Bob <2+bob@users.noreply.github.com>\n\x1f\n\ndata/providers.json\nscripts/x.test.mjs\n';
  const [c] = parseGitLog(text);
  assert.equal(c.sha, 'abc');
  assert.equal(c.date, '2026-11-02');
  assert.equal(c.subject, 'data: x (#5)');
  assert.deepEqual(c.files, ['data/providers.json', 'scripts/x.test.mjs']);
  assert.deepEqual(c.coAuthors.map((a) => a.name), ['Bob']);
});

test('contributors: kinds of work come from the changed paths; generated pages are not site work', () => {
  assert.equal(pathKind('data/providers.json'), 'data');
  assert.equal(pathKind('scripts/build.mjs'), 'site');
  assert.equal(pathKind('site/styles.css'), 'site');
  assert.equal(pathKind('site/p/groq.html'), null);
  assert.equal(pathKind('collections/no-card.md'), null);
  assert.equal(pathKind('CONTRIBUTING.md'), 'docs');
  assert.equal(pathKind('docs/api.md'), 'docs');
  assert.equal(pathKind('changes/unreleased/x.md'), 'docs');
  assert.equal(pathKind('scripts/build.test.mjs'), 'tests');
  assert.equal(pathKind('.github/workflows/verify.yml'), 'ci');
});

// ---------- aggregation ----------

test('contributors: commits carried over from a fork into another pull request keep their author', () => {
  // #948 was opened from the maintainer's branch but carries a contributor's commit.
  const commits = [
    commit('a1', 'K L', '193328253+Aadithya-kl@users.noreply.github.com', '2026-11-26', ['scripts/x.mjs', 'scripts/x.test.mjs']),
    commit('m1', 'Paco', '253313177+pacocartones@users.noreply.github.com', '2026-11-27', ['data/providers.json']),
  ];
  const prOf = new Map([['a1', 948], ['m1', 948]]);
  const prs = new Map([[948, { merged: '2026-11-27', owner: 'pacocartones' }]]);
  const { contributors } = collectContributors({ commits, prOf, prs });
  assert.deepEqual(contributors, [{ login: 'Aadithya-kl', contributions: 1, prs: [948], first: '2026-11-27', last: '2026-11-27', kinds: ['site', 'tests'] }]);
});

test('contributors: maintainers, bots and assistants are left out; co-authors are credited', () => {
  const commits = [
    commit('a', 'Paco', '253313177+pacocartones@users.noreply.github.com', '2026-01-01', ['docs/x.md'], {
      coAuthors: [{ name: 'Claude', email: 'noreply@anthropic.com' }, { name: 'Bob', email: '7+bob@users.noreply.github.com' }],
    }),
    commit('b', 'dependabot[bot]', '49699333+dependabot[bot]@users.noreply.github.com', '2026-01-02'),
    commit('c', 'Copilot', '223556219+Copilot@users.noreply.github.com', '2026-01-03'),
    commit('d', 'Leon', '1+LeonMAG@users.noreply.github.com', '2026-01-04'),
  ];
  const { contributors, unresolved } = collectContributors({ commits });
  assert.deepEqual(contributors.map((c) => c.login), ['bob']);
  assert.equal(contributors[0].kinds.join(), 'docs');
  assert.equal(unresolved, 1, 'the assistant has no handle and is counted as unresolved');
});

test('contributors: another address takes the handle of the fork its pull requests come from, never a maintainer branch', () => {
  const commits = [
    commit('a', 'Alice', 'alice@example.com', '2026-02-01'),
    commit('b', 'Alice', 'alice@example.com', '2026-03-01'),
    commit('c', 'Alice', 'alice@example.com', '2026-04-01'), // a direct commit, no pull request: the address is known now
    commit('d', 'pacocartones', 'maintainer@example.com', '2026-02-01'), // the maintainer, under a personal address, in Alice's fork
    commit('e', 'Someone', 'someone@example.com', '2026-05-01'), // nothing tells us who this is
  ];
  const prOf = new Map([['a', 10], ['b', 11], ['d', 10]]);
  const prs = new Map([[10, { merged: '2026-02-02', owner: 'alice-gh' }], [11, { merged: '2026-03-02', owner: 'alice-gh' }]]);
  const { contributors, unresolved } = collectContributors({ commits, prOf, prs });
  assert.equal(contributors.length, 1);
  assert.deepEqual(contributors[0], { login: 'alice-gh', contributions: 3, prs: [10, 11], first: '2026-02-02', last: '2026-04-01', kinds: ['data'] });
  assert.equal(unresolved, 1);
});

test('contributors: a squash-merged pull request is credited to its known author, who opened it', () => {
  const commits = [commit('s', 'Dream', 'dream@example.com', '2026-10-13', ['docs/live-testing.md'])];
  const prOf = new Map([['s', 193]]);
  const prs = new Map([[193, { merged: '2026-10-13', author: 'TrueFurina' }]]);
  const { contributors } = collectContributors({ commits, prOf, prs });
  assert.deepEqual(contributors.map((c) => [c.login, c.contributions, c.kinds.join()]), [['TrueFurina', 1, 'docs']]);
  // and the next run reads the author back from the written file
  assert.equal(knownPrAuthors({ contributors }).get(193), 'TrueFurina');
});

test('contributors: ordered by first contribution, ties by handle, case-insensitively', () => {
  const commits = [
    commit('1', 'z', '1+zoe@users.noreply.github.com', '2026-03-01'),
    commit('2', 'c', '2+Carol@users.noreply.github.com', '2026-02-01'),
    commit('3', 'b', '3+bob@users.noreply.github.com', '2026-02-01'),
    commit('4', 'z', '1+zoe@users.noreply.github.com', '2026-01-15'),
  ];
  assert.deepEqual(collectContributors({ commits }).contributors.map((c) => c.login), ['zoe', 'bob', 'Carol']);
});

// ---------- the cycle, initials, Markdown ----------

test('contributors: the current cycle starts after the latest release in the changelog', () => {
  const rel = latestRelease('# Changelog\n\n## [Unreleased]\n\n## [2.14.2] — 2026-11-20\n\n## [2.14.1] — 2026-11-19\n');
  assert.deepEqual(rel, { version: '2.14.2', date: '2026-11-20' });
  const list = [{ login: 'old', first: '2026-11-20' }, { login: 'new', first: '2026-11-21' }];
  assert.deepEqual(newThisCycle(list, rel).map((c) => c.login), ['new']);
  assert.deepEqual(newThisCycle(list, null), []);
});

test('contributors: initials stand in for avatars', () => {
  assert.equal(initials('alvaroalonsoparrondo-a11y'), 'AA');
  assert.equal(initials('BloosomNet'), 'BL');
  assert.equal(initials('Aadithya-kl'), 'AK');
  assert.equal(initials('aaas72'), 'AA');
});

test('contributors: CONTRIBUTORS.md lists every person with links to their pull requests', () => {
  const md = contributorsMarkdown({ contributors: [
    { login: 'alice', contributions: 8, prs: [1, 2, 3, 4, 5, 6, 7, 8], first: '2026-01-01', last: '2026-02-01', kinds: ['data', 'docs'] },
  ] }, { repo: REPO, site: 'https://example.org' });
  assert.match(md, /\| \[@alice\]\(https:\/\/github\.com\/alice\) \| 8: \[#1\]\(https:\/\/github\.com\/owner\/repo\/pull\/1\), .*, and 2 more \| 2026-01-01 \| data, docs \|/);
  assert.ok(md.includes('https://example.org/contributors/'));
});

// ---------- the page ----------

const DATA = {
  generated: '2026-11-27',
  contributors: [
    { login: 'alice', contributions: 3, prs: [1, 2, 3], first: '2026-10-01', last: '2026-11-01', kinds: ['data', 'tests'] },
    { login: 'newbie', contributions: 1, prs: [9], first: '2026-11-25', last: '2026-11-25', kinds: ['docs'] },
    { login: '<script>', contributions: 1, prs: [], first: '2026-11-25', last: '2026-11-25', kinds: [] },
  ],
};
const RELEASE = { version: '2.14.2', date: '2026-11-20' };

test('contributors page: invalid handles are dropped, never rendered', () => {
  assert.deepEqual(contributorRows(DATA).map((c) => c.login), ['alice', 'newbie']);
  assert.ok(!contributorsMainHtml(DATA, { repo: REPO, release: RELEASE }).includes('script>'));
});

test('contributors page: counts, first-timers of the cycle, kinds and the way in', () => {
  const html = contributorsMainHtml(DATA, { repo: REPO, release: RELEASE });
  assert.match(html, /<div class="num">2<\/div><div class="lbl">contributors<\/div>/);
  assert.match(html, /<div class="num">4<\/div><div class="lbl">merged contributions<\/div>/);
  const fresh = html.slice(html.indexOf('id="ctb-new-h"'), html.indexOf('id="ctb-all-h"'));
  assert.ok(fresh.includes('@newbie') && !fresh.includes('@alice'), 'only the first-timer is in "New this cycle"');
  assert.ok(html.includes('href="https://github.com/alice"'));
  assert.ok(html.includes('ctb-kind-tests') && html.includes('ctb-kind-data'));
  assert.ok(html.includes(goodFirstIssuesUrl(REPO)));
  assert.ok(html.includes('href="../contributing/"'));
  assert.ok(html.includes(`${REPO}/blob/main/CONTRIBUTING.md`));
  assert.ok(!/<img\b/.test(html), 'no avatar images: initials only, nothing from a third-party host');
});

test('contributors page: a cycle with no first-timer yet says so', () => {
  const html = contributorsMainHtml({ ...DATA, contributors: DATA.contributors.slice(0, 1) }, { repo: REPO, release: RELEASE });
  assert.match(html, /Nobody has made a first contribution since v2\.14\.2/);
});

// ---------- the committed data and the built site ----------

test('contributors: data/contributors.json holds handles only, in order, without the maintainers or bots', () => {
  const data = JSON.parse(read('data/contributors.json'));
  assert.match(data.generated, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(!read('data/contributors.json').includes('@'), 'no email address');
  const logins = data.contributors.map((c) => c.login.toLowerCase());
  for (const l of ['pacocartones', 'leonmag']) assert.ok(!logins.includes(l), l);
  assert.ok(data.contributors.every((c) => !isBotLogin(c.login)));
  assert.equal(new Set(logins).size, logins.length, 'one entry per person');
  assert.equal(contributorRows(data).length, data.contributors.length, 'every entry is valid');
  const firsts = data.contributors.map((c) => c.first);
  assert.deepEqual(firsts, [...firsts].sort());
});

test('contributors: the page is built, linked from the footer, in the sitemap and in llms.txt', () => {
  const page = read('site/contributors/index.html');
  assert.ok(page.includes('<link rel="canonical" href="https://freellmapihub.com/contributors/">'));
  assert.ok(page.includes('class="ctb-grid"'));
  for (const rel of ['site/contributors/index.html', 'site/data-policy/index.html', 'site/index.html']) {
    const html = read(rel);
    const footer = html.slice(html.indexOf('<footer class="site-footer"'), html.indexOf('</footer>'));
    assert.match(footer, /href="(\.\.\/)?contributors\/">Contributors<\/a>/, rel);
  }
  assert.ok(read('site/sitemap.xml').includes('<loc>https://freellmapihub.com/contributors/</loc>'));
  assert.ok(read('site/llms.txt').includes('(https://freellmapihub.com/contributors/)'));
});
