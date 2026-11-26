// The cut-over of the regeneration bot to direct push (docs/regeneration-bot.md, step C): the relaxed drift gate in
// verify.yml, the deploy after the bot in pages.yml and the Lighthouse skip of the bot's pushes. The decisions live in
// scripts/lib/regenerate.mjs and are tested here; the workflow tests check that each file calls them as described and
// that every mode other than `push` keeps the gate as it was.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { REGENERATE_INPUTS, driftGate, pagesDeploy, startsRegeneration } from './lib/regenerate.mjs';
import { makeTmpDir } from './lib/tmp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8').replace(/\r\n/g, '\n');
const GUARD = join(ROOT, 'scripts/regenerate-guard.mjs');
const BOT = 'free-llm-api-hub-regen[bot]';

// The body of one job: from its `  id:` line to the next job or the end of the file.
const jobOf = (wf, id) => {
  const start = wf.indexOf(`\n  ${id}:\n`);
  assert.ok(start !== -1, `job ${id} exists`);
  const rest = wf.slice(start + id.length + 5);
  const next = rest.search(/^ {2}[a-z-]+:\n/m);
  return next === -1 ? rest : rest.slice(0, next);
};
// One step: from the `- ` line that holds `marker` to the next step at the same indentation.
const stepOf = (body, marker) => {
  const at = body.indexOf(marker);
  assert.ok(at !== -1, `step ${marker} exists`);
  const start = body.lastIndexOf('\n      - ', at);
  const next = body.indexOf('\n      - ', at);
  return body.slice(start, next === -1 ? undefined : next);
};
const noComments = (text) => text.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');

// --- driftGate ---------------------------------------------------------------------------------------------------

test('push mode: stale derived files the pull request did not touch pass', () => {
  const r = driftGate({ mode: 'push', touched: ['data/providers.json', 'changes/unreleased/x.md'], drift: ['README.md', 'site/index.html', 'site/og/acme.png'] });
  assert.equal(r.verdict, 'bot-would-regenerate');
  assert.equal(r.block, false);
  assert.equal(driftGate({ mode: 'push', touched: ['data/providers.json'], drift: [] }).block, false);
});

test('push mode: a hand edit, a release and drift outside the allowlist still block', () => {
  const hand = driftGate({ mode: 'push', touched: ['data/providers.json', 'README.md'], drift: ['README.md', 'site/index.html'] });
  assert.equal(hand.verdict, 'would-block-hand-edit');
  assert.equal(hand.block, true);
  assert.deepEqual(hand.handEdited, ['README.md']);
  // A derived file the pull request touched and that matches the build is not a hand edit.
  assert.equal(driftGate({ mode: 'push', touched: ['README.md'], drift: ['site/index.html'] }).block, false);
  const release = driftGate({ mode: 'push', release: true, touched: ['data/providers.json'], drift: ['CITATION.cff'] });
  assert.equal(release.verdict, 'would-block-release');
  assert.equal(release.block, true);
  assert.equal(driftGate({ mode: 'push', release: true, drift: [] }).block, false, 'a regenerated release passes');
  const outside = driftGate({ mode: 'push', touched: ['data/providers.json'], drift: ['README.md', 'site/app.js'] });
  assert.deepEqual(outside.outside, ['site/app.js']);
  assert.equal(outside.block, true);
});

test('every other mode keeps today\'s gate: any drift blocks', () => {
  for (const mode of ['shadow', 'off', '', undefined, 'PUSHY', 'push,shadow']) {
    const r = driftGate({ mode, touched: ['data/providers.json'], drift: ['README.md'] });
    assert.equal(r.block, true, String(mode));
    assert.notEqual(r.mode, 'push');
    assert.equal(driftGate({ mode, drift: [] }).block, false, String(mode));
  }
  assert.equal(driftGate({ mode: ' Push ', drift: ['README.md'] }).block, false, 'REGEN_MODE is parsed like the bot parses it');
});

// --- pagesDeploy -------------------------------------------------------------------------------------------------

test('the inputs that start the bot are exactly the paths filter of regenerate.yml', () => {
  const wf = read('.github/workflows/regenerate.yml');
  const paths = wf.split('\n    paths:\n')[1].split('\n  schedule:')[0]
    .split('\n').map((l) => l.match(/^ {6}- '([^']+)'/)?.[1]).filter(Boolean);
  assert.deepEqual(paths, [...REGENERATE_INPUTS]);
  for (const p of ['data/providers.json', 'data/programs.json', 'scripts/build.mjs', 'CONTRIBUTING.md', 'docs/methodology.md', '.github/workflows/regenerate.yml']) {
    assert.equal(startsRegeneration(p), true, p);
  }
  for (const p of ['data/probe-report.json', 'site/app.js', 'site/style.css', 'README.md', 'docs/schema.md', 'derived-fingerprints.json', '.github/workflows/pages.yml', 'database/x', 'scriptsx/y']) {
    assert.equal(startsRegeneration(p), false, p);
  }
});

test('outside push mode the deploy behaves as before, and ignores the bot\'s finished runs', () => {
  for (const mode of ['shadow', 'off', '']) {
    assert.equal(pagesDeploy({ mode, event: 'push', actor: 'pacocartones', changed: ['data/providers.json'] }).deploy, true);
    assert.equal(pagesDeploy({ mode, event: 'schedule' }).deploy, true);
    assert.equal(pagesDeploy({ mode, event: 'workflow_dispatch' }).deploy, true);
    assert.equal(pagesDeploy({ mode, event: 'workflow_run', conclusion: 'success', headBranch: 'main' }).deploy, false);
  }
});

test('push mode: a push the bot follows waits for it, other pushes deploy, the finished bot run deploys', () => {
  const base = { mode: 'push', event: 'push', botLogin: BOT };
  assert.equal(pagesDeploy({ ...base, actor: 'pacocartones', changed: ['data/providers.json', 'changes/unreleased/x.md'] }).deploy, false);
  assert.equal(pagesDeploy({ ...base, actor: 'pacocartones', changed: ['CONTRIBUTING.md'] }).deploy, false);
  assert.equal(pagesDeploy({ ...base, actor: BOT, changed: ['README.md', 'site/index.html'] }).deploy, false);
  assert.equal(pagesDeploy({ ...base, actor: 'pacocartones', changed: ['site/style.css'] }).deploy, true);
  assert.equal(pagesDeploy({ ...base, actor: 'pacocartones', changed: ['data/probe-report.json'] }).deploy, true);
  assert.equal(pagesDeploy({ ...base, actor: 'pacocartones', changed: null }).deploy, true, 'an unknown range deploys rather than never');
  assert.equal(pagesDeploy({ mode: 'push', event: 'workflow_run', conclusion: 'success', headBranch: 'main' }).deploy, true);
  assert.equal(pagesDeploy({ mode: 'push', event: 'workflow_run', conclusion: 'failure', headBranch: 'main' }).deploy, false);
  assert.equal(pagesDeploy({ mode: 'push', event: 'workflow_run', conclusion: 'success', headBranch: 'feat/x' }).deploy, false);
  assert.equal(pagesDeploy({ mode: 'push', event: 'schedule' }).deploy, true);
  assert.equal(pagesDeploy({ mode: 'push', event: 'workflow_dispatch' }).deploy, true);
  // Without an App configured the actor rule never fires on an empty login.
  assert.equal(pagesDeploy({ mode: 'push', event: 'push', actor: '', botLogin: '', changed: ['site/app.js'] }).deploy, true);
});

// --- the CLI -----------------------------------------------------------------------------------------------------

const cli = (args, { cwd = ROOT, env = {} } = {}) => spawnSync(process.execPath, [GUARD, ...args], {
  cwd, encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: '', GITHUB_STEP_SUMMARY: '', ...env },
});

test('mode prints the parsed REGEN_MODE', () => {
  assert.equal(cli(['mode'], { env: { REGEN_MODE: ' Push ' } }).stdout, 'mode=push\n');
  assert.equal(cli(['mode'], { env: { REGEN_MODE: 'shadow' } }).stdout, 'mode=shadow\n');
  assert.equal(cli(['mode'], { env: { REGEN_MODE: '' } }).stdout, 'mode=off\n');
});

test('drift-gate and pages-gate read the pull request and the push from git', () => {
  const dir = makeTmpDir('regen-cutover-');
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
    write('data/providers.json', '{"version":"1.0.0","providers":[]}');
    write('README.md', 'old\n');
    commit('base');
    const base = git('rev-parse', 'HEAD');
    // A data pull request that does not regenerate.
    write('data/providers.json', '{"version":"1.0.0","providers":[1]}');
    commit('data');
    const gate = (env) => cli(['drift-gate'], { cwd: dir, env: { BASE: base, ...env } });
    // The "build" rewrites README.md and writes a new page; a test leaves a scratch file.
    write('README.md', 'built\n');
    write('site/new.html', '<p>new</p>');
    write('scratch.tmp', 'x');
    const push = gate({ REGEN_MODE: 'push' });
    assert.equal(push.status, 0, push.stdout + push.stderr);
    assert.match(push.stdout, /^verdict=bot-would-regenerate\nblock=false\n/);
    assert.match(push.stdout, /site\/new\.html/);
    assert.doesNotMatch(push.stdout, /scratch\.tmp/, 'an untracked file that is not a derived target is ignored');
    // The same tree is blocked in shadow mode.
    const shadow = gate({ REGEN_MODE: 'shadow' });
    assert.equal(shadow.status, 1);
    assert.match(shadow.stdout, /block=true/);
    // The pull request also edits README.md by hand: blocked in push mode too.
    git('checkout', '-q', '--', 'README.md');
    rmSync(join(dir, 'site'), { recursive: true });
    rmSync(join(dir, 'scratch.tmp'));
    write('README.md', 'hand edit\n');
    commit('hand edit');
    write('README.md', 'built\n');
    const hand = gate({ REGEN_MODE: 'push' });
    assert.equal(hand.status, 1);
    assert.match(hand.stdout, /^verdict=would-block-hand-edit\nblock=true\n/);
    assert.match(hand.stdout, /git checkout origin\/main -- <file>/);
    // A release that is not regenerated.
    write('data/providers.json', '{"version":"1.1.0","providers":[1]}');
    commit('release');
    write('README.md', 'built for the release\n');
    const release = gate({ REGEN_MODE: 'push' });
    assert.equal(release.status, 1);
    assert.match(release.stdout, /^verdict=would-block-release\n/);
    assert.equal(gate({ REGEN_MODE: 'push', BASE: 'HEAD^1' }).status, 2, 'BASE must be a full SHA');

    // pages-gate: the push range comes from BEFORE..HEAD.
    git('checkout', '-q', '--', '.');
    const pages = (env) => cli(['pages-gate'], { cwd: dir, env: { REGEN_MODE: 'push', EVENT: 'push', ACTOR: 'pacocartones', BOT_LOGIN: BOT, ...env } });
    assert.equal(pages({ BEFORE: base }).stdout.split('\n')[0], 'deploy=false', 'data/ changed: the bot run deploys');
    const before = git('rev-parse', 'HEAD');
    write('site/style.css', 'body{}');
    commit('style');
    assert.equal(pages({ BEFORE: before }).stdout.split('\n')[0], 'deploy=true');
    assert.equal(pages({ BEFORE: '0'.repeat(40) }).stdout.split('\n')[0], 'deploy=true', 'a new branch: range unknown');
    assert.equal(pages({ BEFORE: before, ACTOR: BOT }).stdout.split('\n')[0], 'deploy=false');
    assert.equal(pages({ BEFORE: base, REGEN_MODE: 'shadow' }).stdout.split('\n')[0], 'deploy=true');
    assert.equal(pages({ EVENT: 'workflow_run', CONCLUSION: 'success', HEAD_BRANCH: 'main' }).stdout.split('\n')[0], 'deploy=true');
    assert.equal(pages({ EVENT: 'workflow_run', CONCLUSION: 'success', HEAD_BRANCH: 'main', REGEN_MODE: 'shadow' }).stdout.split('\n')[0], 'deploy=false');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- verify.yml --------------------------------------------------------------------------------------------------

const VERIFY = read('.github/workflows/verify.yml');

test('verify.yml: the required check names do not change', () => {
  assert.match(jobOf(VERIFY, 'validate'), /^ {4}name: Dataset integrity\n/);
  assert.match(jobOf(VERIFY, 'windows-tests'), /^ {4}name: Windows tests\n/);
  // Still on every pull request, with no paths filter, and never pull_request_target.
  assert.match(VERIFY, /^ {2}pull_request:\n {2}push:\n/m);
  assert.doesNotMatch(noComments(VERIFY), /pull_request_target|workflow_run/);
});

test('verify.yml: outside push mode the drift gate is exactly the old one', () => {
  const validate = jobOf(VERIFY, 'validate');
  const strict = stepOf(validate, 'name: Generated files must be in sync with the data');
  assert.match(strict, /if: \$\{\{ steps\.regen\.outputs\.mode != 'push' \}\}/);
  assert.match(strict, /node scripts\/build\.mjs/);
  assert.match(strict, /git diff --quiet -- \$targets && \[ -z "\$untracked" \]/);
  assert.match(strict, /exit 1/);
  // The OG check stays unconditional and blocking (in push mode it runs after the images were rendered).
  const og = stepOf(validate, 'name: Check OG images are committed and match the dataset');
  assert.doesNotMatch(og, /\n {8}if:/);
});

test('verify.yml: push mode regenerates before the checks and blocks through driftGate', () => {
  for (const id of ['validate', 'windows-tests']) {
    const body = jobOf(VERIFY, id);
    const mode = stepOf(body, 'id: regen');
    assert.match(mode, /REGEN_MODE: \$\{\{ vars\.REGEN_MODE \}\}/);
    assert.match(mode, /node scripts\/regenerate-guard\.mjs mode/);
    // Fork pull requests see no repository variables: the mode then comes from .github/regen-mode on the base branch.
    assert.match(mode, /\n {8}shell: bash\n/, `${id}: one script for Linux and Windows`);
    assert.match(mode, /EVENT: \$\{\{ github\.event_name \}\}/);
    assert.match(mode, /BASE_REF: \$\{\{ github\.base_ref \}\}/, 'the base branch arrives through env, not pasted into the script');
    assert.match(mode, /if \[ -z "\$REGEN_MODE" \] && \[ "\$EVENT" = pull_request \]; then/, 'the variable wins whenever it has a value');
    assert.match(mode, /git fetch --no-tags origin "refs\/heads\/\$BASE_REF"/);
    assert.match(mode, /git show FETCH_HEAD:\.github\/regen-mode/, 'read from the fetched base branch');
    assert.doesNotMatch(noComments(mode), /--depth|--shallow/, 'the clone stays complete: the build mines git log');
    const reads = noComments(mode).match(/\.github\/regen-mode/g) ?? [];
    assert.equal(reads.length, 1, `${id}: the pull request's own .github/regen-mode is never read`);
    assert.ok(mode.indexOf('git show FETCH_HEAD') < mode.indexOf('node scripts/regenerate-guard.mjs mode'), 'resolved before it is parsed');
    const regen = stepOf(body, 'name: Regenerate the derived files first (REGEN_MODE=push)');
    assert.match(regen, /if: \$\{\{ steps\.regen\.outputs\.mode == 'push' \}\}/);
    assert.match(regen, /node scripts\/build\.mjs/);
    const tests = id === 'validate' ? body.indexOf('node scripts/run-tests.mjs') : body.indexOf('npm test');
    assert.ok(body.indexOf('id: regen') < body.indexOf('Regenerate the derived files first') && body.indexOf('Regenerate the derived files first') < tests,
      `${id}: mode, then regeneration, then the tests`);
  }
  const validate = jobOf(VERIFY, 'validate');
  assert.match(stepOf(validate, 'Regenerate the derived files first'), /node scripts\/check-og\.mjs \|\| node scripts\/og\.mjs/);
  // Windows too: without the images, a pull request that changes how they are drawn fails the OG manifest test there.
  assert.match(stepOf(jobOf(VERIFY, 'windows-tests'), 'Regenerate the derived files first'), /node scripts\/check-og\.mjs \|\| node scripts\/og\.mjs/);
  assert.ok(validate.indexOf('Regenerate the derived files first') > validate.indexOf('node scripts/validate.mjs'), 'the data is validated before it is built');
  assert.ok(validate.indexOf('Regenerate the derived files first') < validate.indexOf('node scripts/check-og.mjs\n'), 'the OG check sees the rendered images');
  const gate = stepOf(validate, 'regenerate-guard.mjs drift-gate');
  assert.match(gate, /if: \$\{\{ steps\.regen\.outputs\.mode == 'push' \}\}/);
  assert.match(gate, /BASE="\$\(git rev-parse HEAD\^1\)" node scripts\/regenerate-guard\.mjs drift-gate/);
  // It compares the tree the regeneration step wrote: no second build (the suite leaves the working tree as it found it).
  assert.doesNotMatch(noComments(gate), /node scripts\/build\.mjs/, 'the job builds once');
  assert.ok(validate.indexOf('Regenerate the derived files first') < validate.indexOf('regenerate-guard.mjs drift-gate'), 'regenerated before it compares');
});

test('verify.yml: read-only, no secret, no credentials, pinned actions, no expression inside run:', () => {
  const code = noComments(VERIFY);
  assert.match(VERIFY, /^permissions:\n {2}contents: read\n/m);
  assert.doesNotMatch(code.split(/\n {2}report:\n/)[0], /secrets\.|: write\b|environment:|create-github-app-token/);
  for (const m of VERIFY.matchAll(/uses: (\S+)/g)) assert.match(m[1], /^actions\/[a-z-]+@[0-9a-f]{40}$/, m[1]);
  for (const m of VERIFY.matchAll(/uses: actions\/checkout@\S+[^\n]*\n {8}with:\n {10}persist-credentials: (\S+)/g)) assert.equal(m[1], 'false');
  assert.equal([...VERIFY.matchAll(/uses: actions\/checkout@/g)].length, [...VERIFY.matchAll(/persist-credentials: false/g)].length);
  for (const block of VERIFY.split(/\n {8}run: /).slice(1)) {
    const body = block.split(/\n\s+- (?:name|uses|id|if):|\n {2}[a-z-]+:\n/)[0];
    assert.doesNotMatch(body, /\$\{\{/, body.slice(0, 80));
  }
});

// --- pages.yml ---------------------------------------------------------------------------------------------------

const PAGES = read('.github/workflows/pages.yml');

test('pages.yml: deploys after "Regenerate derived files" on main, and keeps push, schedule and the manual button', () => {
  assert.match(PAGES, /^on:\n {2}workflow_run:\n {4}workflows: \['Regenerate derived files'\]\n {4}types: \[completed\]\n {4}branches: \[main\]\n/m);
  assert.match(read('.github/workflows/regenerate.yml'), /^name: Regenerate derived files$/m, 'the upstream name matches');
  assert.match(PAGES, /^ {2}push:\n {4}branches: \[main\]\n/m);
  assert.match(PAGES, /^ {2}schedule:\n/m);
  assert.match(PAGES, /^ {2}workflow_dispatch: \{\}$/m);
  assert.doesNotMatch(noComments(PAGES), /pull_request/);
});

test('pages.yml: a gate job decides through the tested guard, and the build waits for it', () => {
  const gate = jobOf(PAGES, 'gate');
  assert.match(gate, /permissions:\n {6}contents: read\n/);
  assert.match(gate, /persist-credentials: false/);
  assert.match(gate, /node scripts\/regenerate-guard\.mjs pages-gate/);
  assert.doesNotMatch(gate, /secrets\.|npm (ci|install)/);
  for (const v of ['REGEN_MODE: ${{ vars.REGEN_MODE }}', 'EVENT: ${{ github.event_name }}', 'BEFORE: ${{ github.event.before }}',
    'CONCLUSION: ${{ github.event.workflow_run.conclusion }}', 'HEAD_BRANCH: ${{ github.event.workflow_run.head_branch }}']) {
    assert.ok(gate.includes(v), v);
  }
  const build = jobOf(PAGES, 'build');
  assert.match(build, /needs: gate\n {4}if: \$\{\{ needs\.gate\.outputs\.deploy == 'true' \}\}/);
  // The checkouts never pick the triggering run's ref: they check out main's tip.
  assert.doesNotMatch(PAGES, /ref: \$\{\{ github\.event\.workflow_run/);
  assert.match(PAGES, /^concurrency:\n {2}group: pages\n {2}cancel-in-progress: false$/m);
});
