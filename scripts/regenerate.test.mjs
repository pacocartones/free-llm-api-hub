import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  BOT_COMMIT_PREFIX, PREVIEW_VERDICTS, SHADOW_BRANCH, datasetVersion, isRegenerationTarget, loopGuard,
  outsideAllowlist, parseMode, previewVerdict,
} from './lib/regenerate.mjs';
import { makeTmpDir } from './lib/tmp.mjs';

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

// --- pull-request preview ----------------------------------------------------------------------------------------

test('preview verdict: in sync, informative, hand edit and release', () => {
  assert.deepEqual(previewVerdict({ drift: [] }), { verdict: 'in-sync', handEdited: [], outside: [] });
  assert.equal(previewVerdict({ release: true, drift: [] }).verdict, 'in-sync');
  // A data pull request that did not regenerate: the bot would do it after the merge.
  const data = previewVerdict({ touched: ['data/providers.json', 'changes/unreleased/x.md'], drift: ['README.md', 'site/index.html'] });
  assert.equal(data.verdict, 'bot-would-regenerate');
  assert.deepEqual(data.handEdited, []);
  // It touched README.md and README.md still differs from the build: a hand edit the bot would overwrite.
  const hand = previewVerdict({ touched: ['data/providers.json', 'README.md'], drift: ['README.md', 'site/index.html'] });
  assert.equal(hand.verdict, 'would-block-hand-edit');
  assert.deepEqual(hand.handEdited, ['README.md']);
  // A touched derived file that matches the build is fine.
  assert.equal(previewVerdict({ touched: ['README.md'], drift: ['site/index.html'] }).verdict, 'bot-would-regenerate');
  // A release pull request must be fully regenerated, whatever it touched.
  assert.equal(previewVerdict({ release: true, touched: ['data/providers.json'], drift: ['CITATION.cff'] }).verdict, 'would-block-release');
  assert.deepEqual([...PREVIEW_VERDICTS].sort(), ['bot-would-regenerate', 'in-sync', 'would-block-hand-edit', 'would-block-release']);
});

test('preview flags drift outside the allowlist and never counts a touched input as a hand edit', () => {
  const r = previewVerdict({ touched: ['data/providers.json'], drift: ['data/providers.json', 'README.md'] });
  assert.deepEqual(r.outside, ['data/providers.json']);
  assert.deepEqual(r.handEdited, []);
});

test('datasetVersion reads the version or returns null', () => {
  assert.equal(datasetVersion('{"version":"2.15.0","providers":[]}'), '2.15.0');
  assert.equal(datasetVersion('{"providers":[]}'), null);
  assert.equal(datasetVersion('not json'), null);
  assert.equal(datasetVersion(''), null);
});

test('the preview CLI reads release, drift and hand edits from git, and never fails on drift', () => {
  const dir = makeTmpDir('regen-preview-');
  try {
    const git = (...args) => {
      const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
      return r.stdout.trim();
    };
    const write = (path, text) => {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), text);
    };
    const commit = (message) => { git('add', '-A'); git('commit', '-q', '--no-gpg-sign', '-m', message); };
    git('init', '-q');
    git('config', 'user.name', 'Test');
    git('config', 'user.email', 'test@example.invalid');
    write('data/providers.json', '{"version":"1.0.0"}');
    write('README.md', 'old\n');
    commit('base');
    const base = git('rev-parse', 'HEAD');
    // The pull request bumps the version and hand-edits README.md.
    write('data/providers.json', '{"version":"1.1.0"}');
    write('README.md', 'hand edit\n');
    commit('pr');
    const run = (env) => spawnSync(process.execPath, [join(ROOT, 'scripts/regenerate-guard.mjs'), 'preview'], {
      cwd: dir, encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: '', GITHUB_STEP_SUMMARY: '', ...env },
    });
    // Nothing built yet: in sync.
    assert.match(run({ BASE: base }).stdout, /^verdict=in-sync\nchanged=false\n/);
    // The "build" rewrites README.md and writes a new page.
    write('README.md', 'built\n');
    write('site/new.html', '<p>new</p>');
    const r = run({ BASE: base });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^verdict=would-block-release\nchanged=true\n/);
    assert.match(r.stdout, /README\.md/);
    assert.match(r.stdout, /site\/new\.html/);
    assert.match(r.stdout, /1\.0\.0 → 1\.1\.0/);
    // Same drift without the version bump: the README hand edit decides.
    git('checkout', '-q', 'HEAD~1', '--', 'data/providers.json');
    const h = run({ BASE: base });
    assert.equal(h.status, 0, h.stderr);
    assert.match(h.stdout, /^verdict=would-block-hand-edit\n/);
    // A missing or malformed BASE is a usage error, not a silent pass.
    assert.equal(run({ BASE: 'main' }).status, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const PREVIEW = readFileSync(join(ROOT, '.github/workflows/regenerate-preview.yml'), 'utf8').replace(/\r\n/g, '\n');
// Without comment lines: the header names what the workflow must not use, and that must not count.
const PREVIEW_CODE = PREVIEW.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');

test('preview workflow: pull_request only, read-only, no secrets, no App, nothing written back', () => {
  assert.match(PREVIEW, /^on:\n {2}pull_request:\n {4}paths:\n/m);
  assert.doesNotMatch(PREVIEW_CODE, /pull_request_target|workflow_run|schedule:|^ {2}push:/m);
  assert.match(PREVIEW, /^permissions: \{\}$/m);
  assert.match(PREVIEW, /permissions:\n {6}contents: read\n/);
  assert.doesNotMatch(PREVIEW_CODE, /: write\b/);
  assert.doesNotMatch(PREVIEW_CODE, /secrets\.|vars\.|create-github-app-token|environment:|GH_TOKEN|github\.token/);
  assert.doesNotMatch(PREVIEW_CODE, /git push|gh (pr|issue|api)|--force/);
  assert.match(PREVIEW, /persist-credentials: false/);
  assert.match(PREVIEW, /npm ci --ignore-scripts/);
  assert.match(PREVIEW, /regenerate-guard\.mjs preview/);
  assert.match(PREVIEW, /check-og\.mjs \|\| node scripts\/og\.mjs/);
  // It reports; it does not repeat the blocking gate.
  assert.doesNotMatch(PREVIEW_CODE, /check-generated|git diff --exit-code/);
});

test('preview workflow: pinned actions and no expressions inside run: blocks', () => {
  const uses = [...PREVIEW.matchAll(/uses: (\S+)/g)].map((m) => m[1]);
  assert.ok(uses.length >= 3);
  for (const u of uses) assert.match(u, /^actions\/[a-z-]+@[0-9a-f]{40}$/, u);
  for (const block of PREVIEW.split(/\n {8}run: /).slice(1)) {
    const body = block.split(/\n\s+- (?:name|uses|id|if):|\n {2}[a-z]+:\n/)[0];
    assert.doesNotMatch(body, /\$\{\{/, body.slice(0, 80));
  }
});

test('preview workflow: its job name is not one of the required check names', () => {
  const name = PREVIEW.match(/^ {4}name: (.+)$/m)[1];
  for (const required of ['Dataset integrity', 'Windows tests', 'commit policy', 'Lighthouse accessibility and performance', 'Analyze (javascript-typescript)']) {
    assert.notEqual(name, required);
  }
});
