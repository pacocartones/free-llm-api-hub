import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  BOT_COMMIT_PREFIX, SHADOW_BRANCH, isRegenerationTarget, loopGuard, outsideAllowlist, parseMode,
} from './lib/regenerate.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOW = readFileSync(join(ROOT, '.github/workflows/regenerate.yml'), 'utf8').replace(/\r\n/g, '\n');

// The body of one job: from its `  id:` line to the next job or the end of the file.
const job = (id) => {
  const start = WORKFLOW.indexOf(`\n  ${id}:\n`);
  assert.ok(start !== -1, `job ${id} exists`);
  const rest = WORKFLOW.slice(start + id.length + 5);
  const next = rest.search(/^ {2}[a-z-]+:\n/m);
  return next === -1 ? rest : rest.slice(0, next);
};

// --- allowlist ---------------------------------------------------------------------------------------------------

test('generated targets are allowed', () => {
  for (const p of [
    'README.md', 'collections/free-chat.md', 'docs/schema.md', 'CITATION.cff', 'data/probe-report.json',
    'derived-fingerprints.json', 'badge-verified.json', 'site/index.html', 'site/providers.csv', 'site/sitemap.xml',
    'site/coverage/index.html', 'site/og/groq.png',
  ]) assert.equal(isRegenerationTarget(p), true, p);
});

test('canonical inputs, code, workflows and the changelog are refused', () => {
  for (const p of [
    'data/providers.json', 'data/schema.json', 'CHANGELOG.md', 'changes/unreleased/x.md', 'package.json',
    'package-lock.json', '.github/workflows/regenerate.yml', 'scripts/build.mjs', 'site/app.js', 'site/style.css',
    'site/og/evil.js', 'site/fonts/inter.woff2', 'site/CNAME', 'site/favicon.svg', 'CONTRIBUTING.md',
    'docs/methodology.md', 'docs/schema.md.bak', 'READMEX.md', 'collectionsX/a.md',
  ]) assert.equal(isRegenerationTarget(p), false, p);
});

test('odd paths are refused rather than trusted', () => {
  for (const p of ['', '/README.md', 'site/../data/providers.json', 'collections/../package.json', undefined, null, 42]) {
    assert.equal(isRegenerationTarget(p), false, String(p));
  }
});

test('outsideAllowlist returns exactly the offending paths, in order', () => {
  assert.deepEqual(outsideAllowlist(['README.md', 'data/providers.json', 'site/index.html', 'scripts/x.mjs']),
    ['data/providers.json', 'scripts/x.mjs']);
  assert.deepEqual(outsideAllowlist([]), []);
});

test('the CLI fails on a path outside the allowlist and passes NUL-separated targets', () => {
  const run = (input) => spawnSync(process.execPath, [join(ROOT, 'scripts/regenerate-guard.mjs'), 'allowlist'], { input, encoding: 'utf8' });
  const ok = run('README.md\0site/café.html\0');
  assert.equal(ok.status, 0, ok.stderr);
  const bad = run('README.md\0data/providers.json\0');
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /data\/providers\.json/);
  assert.equal(run('').status, 0);
});

// --- mode and loop guard -----------------------------------------------------------------------------------------

test('REGEN_MODE: only shadow and push enable the workflow', () => {
  assert.equal(parseMode('shadow'), 'shadow');
  assert.equal(parseMode(' Push '), 'push');
  for (const v of [undefined, null, '', 'off', 'on', 'true', 'shadow,push', 'toString']) assert.equal(parseMode(v), 'off', String(v));
});

test('a disabled mode never runs', () => {
  assert.equal(loopGuard({ mode: '', event: 'workflow_dispatch', actor: 'pacocartones' }).run, false);
});

test('a maintainer merge runs; a push by the bot or with a bot commit at the tip does not', () => {
  const base = { mode: 'shadow', event: 'push', botLogin: 'free-llm-api-hub-regen[bot]' };
  assert.equal(loopGuard({ ...base, actor: 'pacocartones', headMessage: 'Merge pull request #1 from x/data/y' }).run, true);
  assert.equal(loopGuard({ ...base, actor: 'free-llm-api-hub-regen[bot]', headMessage: 'anything' }).run, false);
  assert.equal(loopGuard({ ...base, actor: 'github-actions[bot]', headMessage: 'anything' }).run, false);
  assert.equal(loopGuard({ ...base, actor: 'pacocartones', headMessage: `${BOT_COMMIT_PREFIX} regenerate derived files for abc1234\n` }).run, false);
  // A squash of the shadow pull request keeps the bot subject and is skipped too.
  assert.equal(loopGuard({ ...base, actor: 'pacocartones', headMessage: `\n${BOT_COMMIT_PREFIX} regenerate (#9)` }).run, false);
});

test('without an App the actor rule does not misfire on an empty login', () => {
  assert.equal(loopGuard({ mode: 'push', event: 'push', actor: '', botLogin: '', headMessage: 'feat: x' }).run, true);
});

test('scheduled and manual runs are always allowed (the build is idempotent)', () => {
  for (const event of ['schedule', 'workflow_dispatch']) {
    assert.equal(loopGuard({ mode: 'shadow', event, actor: 'free-llm-api-hub-regen[bot]', botLogin: 'free-llm-api-hub-regen[bot]', headMessage: `${BOT_COMMIT_PREFIX} x` }).run, true);
  }
});

test('the shadow branch passes the commit-policy branch rule', () => {
  const policy = readFileSync(join(ROOT, 'scripts/check-commit-policy.sh'), 'utf8');
  const pattern = policy.match(/^branch_pattern='([^']+)'$/m)[1];
  assert.match(SHADOW_BRANCH, new RegExp(pattern));
  // The <type>/<slug> form, not a special-cased prefix.
  assert.match(SHADOW_BRANCH, /^(feat|fix|docs|data|test|ci|chore|refactor)\/[a-z0-9][a-z0-9-]*$/);
  assert.ok(WORKFLOW.includes(`refs/heads/${SHADOW_BRANCH}`) && WORKFLOW.includes(`--head ${SHADOW_BRANCH}`));
});

// --- the workflow itself -----------------------------------------------------------------------------------------

test('triggers: main, nightly and manual only; never pull-request code', () => {
  assert.match(WORKFLOW, /^on:\n {2}push:\n {4}branches: \[main\]\n {4}paths:\n/m);
  assert.doesNotMatch(WORKFLOW, /pull_request(_target)?:/);
  assert.match(WORKFLOW, /^ {2}schedule:\n {4}- cron: '[^']+'/m);
  assert.match(WORKFLOW, /^ {2}workflow_dispatch: \{\}$/m);
  // No generated target can trigger a run (first loop-guard layer).
  const paths = WORKFLOW.split('\n    paths:\n')[1].split('\n  schedule:')[0]
    .split('\n').map((l) => l.match(/^ {6}- '([^']+)'/)?.[1]).filter(Boolean);
  assert.ok(paths.includes('!data/probe-report.json'));
  for (const p of paths.filter((x) => !x.startsWith('!'))) {
    assert.equal(isRegenerationTarget(p.replace('/**', '/x.json')), false, `${p} is not a generated target`);
  }
  assert.ok(paths.indexOf('data/**') < paths.indexOf('!data/probe-report.json'), 'the negation comes after data/**');
});

test('one run at a time, never cancelled, empty default permissions', () => {
  assert.match(WORKFLOW, /^concurrency:\n {2}group: regenerate\n {2}cancel-in-progress: false$/m);
  assert.match(WORKFLOW, /^permissions: \{\}$/m);
  // The App token asks for write (permission-contents: write); GITHUB_TOKEN never does.
  assert.doesNotMatch(WORKFLOW, /^ +(contents|pull-requests|actions|id-token): write/m);
});

test('every action is pinned by a full commit SHA', () => {
  const uses = [...WORKFLOW.matchAll(/uses: (\S+)/g)].map((m) => m[1]);
  assert.ok(uses.length >= 6);
  for (const u of uses) assert.match(u, /^actions\/[a-z-]+@[0-9a-f]{40}$/, u);
});

test('the gate decides through the tested guard', () => {
  const gate = job('gate');
  assert.match(gate, /node scripts\/regenerate-guard\.mjs gate/);
  assert.match(gate, /github\.repository == 'pacocartones\/free-llm-api-hub'/);
  assert.match(job('build'), /if: \$\{\{ needs\.gate\.outputs\.run == 'true' \}\}/);
});

test('build reads only, never sees the App key, and checks allowlist and idempotency', () => {
  const build = job('build');
  assert.match(build, /permissions:\n {6}contents: read\n/);
  assert.doesNotMatch(build, /secrets\.|create-github-app-token|environment:/);
  assert.match(build, /persist-credentials: false/);
  assert.match(build, /npm ci --ignore-scripts/);
  assert.match(build, /regenerate-guard\.mjs allowlist/);
  assert.match(build, /git diff --exit-code/);
  assert.match(build, /npm test/);
  assert.match(build, /check-og\.mjs \|\| node scripts\/og\.mjs/);
});

test('publish installs nothing, re-checks the allowlist before minting the token, and needs the App', () => {
  const publish = job('publish');
  assert.match(publish, /vars\.REGEN_APP_CLIENT_ID != ''/);
  assert.match(publish, /environment: regenerate/);
  assert.match(publish, /permissions:\n {6}contents: read/);
  assert.doesNotMatch(publish, /npm (ci|install|test|run)|node scripts\/(build|og|validate)/);
  const recheck = publish.indexOf('regenerate-guard.mjs allowlist');
  const mint = publish.indexOf('create-github-app-token');
  assert.ok(recheck !== -1 && mint !== -1 && recheck < mint, 'allowlist re-check happens before the token exists');
  assert.match(publish, /printf 'chore\(generated\): /);
  // Shadow opens a draft pull request and never pushes main; push mode never forces.
  const shadow = publish.split('(REGEN_MODE=shadow)')[1].split('(REGEN_MODE=push)')[0];
  assert.match(shadow, /needs\.gate\.outputs\.mode == 'shadow'/);
  assert.match(shadow, /gh pr create --draft/);
  assert.doesNotMatch(shadow, /refs\/heads\/main/);
  const push = publish.split('(REGEN_MODE=push)')[1];
  assert.match(push, /needs\.gate\.outputs\.mode == 'push'/);
  assert.doesNotMatch(push, /--force|-f /);
});

test('the bot commits as <slug>[bot], which commit policy does not treat as a maintainer identity', () => {
  const policy = readFileSync(join(ROOT, 'scripts/check-commit-policy.sh'), 'utf8');
  const names = new RegExp(policy.match(/^maintainer_names='([^']+)'$/m)[1]);
  const emails = new RegExp(policy.match(/^maintainer_emails='([^']+)'$/m)[1], 'i');
  const publish = job('publish');
  assert.match(publish, /git config user\.name "\$\{SLUG\}\[bot\]"/);
  assert.match(publish, /git config user\.email "\$\{id\}\+\$\{SLUG\}\[bot\]@users\.noreply\.github\.com"/);
  const slug = 'free-llm-api-hub-regen';
  assert.doesNotMatch(`${slug}[bot]`, names);
  assert.doesNotMatch(`123456+${slug}[bot]@users.noreply.github.com`, emails);
});

test('the bot commit message carries no AI trailer (ai-trailer-alert stays green)', () => {
  const alert = readFileSync(join(ROOT, '.github/workflows/ai-trailer-alert.yml'), 'utf8');
  const pattern = new RegExp(alert.match(/pattern='([^']+)'/)[1], 'i');
  const message = job('publish').match(/printf '([^']+)'/)[1].replace(/\\n/g, '\n');
  assert.doesNotMatch(message, pattern);
  assert.ok(message.startsWith(BOT_COMMIT_PREFIX));
});

test('external values reach run: blocks only through env', () => {
  // Step-level run: (8 spaces); job outputs at 6 spaces legitimately hold expressions.
  for (const block of WORKFLOW.split(/\n {8}run: /).slice(1)) {
    const body = block.split(/\n\s+- (?:name|uses|id|if):|\n {2}[a-z]+:\n/)[0];
    assert.doesNotMatch(body, /\$\{\{/, body.slice(0, 80));
  }
});

test('report opens an issue with issues: write only and runs no repository code', () => {
  const report = job('report');
  assert.match(report, /permissions:\n {6}issues: write\n/);
  assert.doesNotMatch(report, /actions\/checkout|node scripts/);
});
