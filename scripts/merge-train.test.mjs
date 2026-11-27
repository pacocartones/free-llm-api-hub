// The merge manager (docs/maintenance/merge-train.md): its pure decisions (scripts/lib/merge-train.mjs), the conflict
// rules on a real git repository, the shape of its two workflows, and the regeneration bot still following the
// merges the manager makes with the same App.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_REQUIRED_CHECKS, LABEL, NEEDS_COORDINATOR, SOLO, TRAIN_PREFIX, TRAIN_TIMEOUT_MS, blameFailedTrain,
  checksState, classifyPr, closedByMergeComment, conflictStrategy, evaluateTrain, issuesToClose, formatTrainState, infoAttributes, lastLabeler,
  movedOnlyByBot, normalizeContexts, parseConfig, parseMode, parseTrainState, pickTrain, planRun,
  resolveStampConflicts, safeBranch, trainBranch,
} from './lib/merge-train.mjs';
import { loopGuard, pagesDeploy } from './lib/regenerate.mjs';
import { makeTmpDir } from './lib/tmp.mjs';
import { testGitEnv } from './lib/test-tools.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BOT = 'free-llm-api-hub-regen[bot]';
const config = parseConfig({ GITHUB_REPOSITORY: 'pacocartones/free-llm-api-hub', MERGE_TRAIN_MODE: 'on', REGEN_APP_SLUG: 'free-llm-api-hub-regen' });
const sha = (c) => c.repeat(40);
const GREEN = checksState(DEFAULT_REQUIRED_CHECKS.map((name) => ({ name, result: 'pass', at: '1' })), DEFAULT_REQUIRED_CHECKS);
const pr = (over = {}) => ({
  number: 10, isDraft: false, isFork: false, mergeable: 'MERGEABLE', labels: [LABEL], unresolvedThreads: 0, checks: GREEN,
  labeledBy: 'pacocartones', upToDate: true, touchesWorkflows: false, headOid: sha('a'), headRef: 'fix/x', ...over,
});

// --- configuration -----------------------------------------------------------------------------------------------

test('only `on` and `shadow` enable the manager', () => {
  assert.equal(parseMode('on'), 'on');
  assert.equal(parseMode(' Shadow '), 'shadow');
  for (const v of [undefined, '', 'off', 'push', 'true', 'yes']) assert.equal(parseMode(v), 'off', String(v));
});

test('the configuration defaults to the five required checks, the repository owner as labeler and merge commits', () => {
  const c = parseConfig({ GITHUB_REPOSITORY: 'pacocartones/free-llm-api-hub' });
  assert.equal(c.mode, 'off');
  assert.deepEqual(c.requiredChecks, [...DEFAULT_REQUIRED_CHECKS]);
  assert.deepEqual(c.labelers, ['pacocartones']);
  assert.equal(c.mergeMethod, 'merge');
  assert.equal(c.maxTrain, 6);
  assert.equal(c.botLogin, '');
  const o = parseConfig({ MERGE_TRAIN_LABELERS: 'a, b', MERGE_TRAIN_MAX: '99', MERGE_TRAIN_REQUIRED_CHECKS: 'x\ny', MERGE_TRAIN_METHOD: 'squash' });
  assert.deepEqual(o.labelers, ['a', 'b']);
  assert.equal(o.maxTrain, 6, 'an out-of-range size falls back to the default');
  assert.deepEqual(o.requiredChecks, ['x', 'y']);
  assert.equal(o.mergeMethod, 'squash');
});

// --- checks ------------------------------------------------------------------------------------------------------

test('check runs and commit statuses are normalized; the latest run of a name wins', () => {
  const ctx = normalizeContexts([
    { __typename: 'CheckRun', name: 'Dataset integrity', status: 'COMPLETED', conclusion: 'FAILURE', completedAt: '2026-01-01T00:00:00Z' },
    { __typename: 'CheckRun', name: 'Dataset integrity', status: 'COMPLETED', conclusion: 'SUCCESS', completedAt: '2026-01-01T01:00:00Z' },
    { __typename: 'CheckRun', name: 'Windows tests', status: 'IN_PROGRESS', conclusion: null, startedAt: '2026-01-01T00:00:00Z' },
    { __typename: 'StatusContext', context: 'commit policy', state: 'SUCCESS', createdAt: '2026-01-01T00:00:00Z' },
    { __typename: 'CheckRun', name: 'Lighthouse accessibility and performance', status: 'COMPLETED', conclusion: 'SKIPPED' },
    null,
  ]);
  const s = checksState(ctx, DEFAULT_REQUIRED_CHECKS);
  assert.equal(s.state, 'pending');
  assert.deepEqual(s.missing, ['Windows tests', 'Analyze (javascript-typescript)']);
  assert.deepEqual(s.failing, []);
  const red = checksState([...ctx, { name: 'Windows tests', result: 'fail', at: '2026-01-02' }], DEFAULT_REQUIRED_CHECKS);
  assert.equal(red.state, 'red', 'a failure wins over a missing check');
  assert.deepEqual(red.failing, ['Windows tests']);
  assert.equal(GREEN.state, 'green');
});

test('the last labeler is the actor of the latest merge-train LabeledEvent', () => {
  assert.equal(lastLabeler([]), null);
  assert.equal(lastLabeler([{ label: { name: LABEL }, actor: { login: 'a' } }, { label: { name: 'x' }, actor: { login: 'b' } }, { label: { name: LABEL }, actor: { login: 'c' } }]), 'c');
});

// --- one pull request --------------------------------------------------------------------------------------------

test('classifyPr: a green, mergeable, approved pull request is a candidate', () => {
  assert.equal(classifyPr(pr(), config).action, 'candidate');
});

test('classifyPr: parked, in the train, draft or still computing means hands off', () => {
  assert.equal(classifyPr(pr({ labels: [LABEL, NEEDS_COORDINATOR] }), config).action, 'skip');
  assert.equal(classifyPr(pr({ inTrain: true, mergeable: 'CONFLICTING' }), config).action, 'skip');
  assert.equal(classifyPr(pr({ isDraft: true }), config).action, 'wait');
  assert.equal(classifyPr(pr({ mergeable: 'UNKNOWN' }), config).action, 'wait');
  assert.equal(classifyPr(pr({ labeledBy: null }), config).action, 'wait');
});

test('classifyPr: a label from someone outside MERGE_TRAIN_LABELERS is revoked', () => {
  const r = classifyPr(pr({ labeledBy: 'stranger' }), config);
  assert.equal(r.action, 'revoke');
  assert.match(r.reason, /@stranger/);
});

test('classifyPr: workflow changes and unresolved threads go to the coordinator', () => {
  assert.equal(classifyPr(pr({ touchesWorkflows: true }), config).action, 'park');
  assert.match(classifyPr(pr({ unresolvedThreads: 2 }), config).reason, /2 unresolved review thread/);
});

test('classifyPr: a conflict is healed on a branch of this repository, parked on a fork', () => {
  assert.equal(classifyPr(pr({ mergeable: 'CONFLICTING' }), config).action, 'sync');
  assert.equal(classifyPr(pr({ mergeable: 'CONFLICTING', isFork: true }), config).action, 'park');
});

test('classifyPr: red and behind main is updated once; red on a head with main is parked', () => {
  const red = checksState([{ name: 'Windows tests', result: 'fail', at: '1' }], DEFAULT_REQUIRED_CHECKS);
  assert.equal(classifyPr(pr({ checks: red, upToDate: false }), config).action, 'sync');
  const parked = classifyPr(pr({ checks: red, upToDate: true }), config);
  assert.equal(parked.action, 'park');
  assert.match(parked.reason, /Windows tests/);
  assert.equal(classifyPr(pr({ checks: red, upToDate: null }), config).action, 'wait');
  assert.equal(classifyPr(pr({ checks: red, upToDate: false, isFork: true }), config).action, 'park');
});

test('classifyPr: pending checks wait, unless an approved fork waits for run approval', () => {
  const pending = checksState([], DEFAULT_REQUIRED_CHECKS);
  assert.equal(classifyPr(pr({ checks: pending }), config).action, 'wait');
  assert.equal(classifyPr(pr({ checks: pending, isFork: true, actionRequired: true }), config).action, 'approve');
  assert.equal(classifyPr(pr({ checks: pending, isFork: false, actionRequired: true }), config).action, 'wait');
});

// --- trains ------------------------------------------------------------------------------------------------------

test('the train branch passes the commit-policy branch rule', () => {
  const policy = readFileSync(join(ROOT, 'scripts/check-commit-policy.sh'), 'utf8');
  const pattern = new RegExp(policy.match(/^branch_pattern='([^']+)'$/m)[1]);
  const branch = trainBranch(new Date('2026-11-27T15:30:12.345Z'));
  assert.equal(branch, 'ci/merge-train-20261127-153012');
  assert.match(branch, pattern);
  assert.ok(branch.startsWith(TRAIN_PREFIX));
  assert.ok(safeBranch(branch));
  for (const bad of ['-x', 'a..b', 'a b', 'a;b', '', undefined]) assert.equal(safeBranch(bad), false, String(bad));
});

test('the train state survives a round trip through the body; anything malformed is refused', () => {
  const state = { base: sha('b'), members: [{ number: 3, head: sha('c') }, { number: 5, head: sha('d') }] };
  assert.deepEqual(parseTrainState(`text\n\n${formatTrainState(state)}\n`), state);
  assert.equal(parseTrainState('no block'), null);
  assert.equal(parseTrainState(formatTrainState({ base: 'short', members: state.members })), null);
  assert.equal(parseTrainState(formatTrainState({ base: sha('b'), members: [] })), null);
  assert.equal(parseTrainState(formatTrainState({ base: sha('b'), members: [{ number: -1, head: sha('c') }] })), null);
  assert.equal(parseTrainState('<!-- merge-train-state {not json} -->'), null);
});

test('pickTrain takes the oldest first, up to the limit; a solo candidate travels alone', () => {
  const c = (number, labels = [LABEL]) => ({ number, labels });
  assert.deepEqual(pickTrain([c(9), c(3), c(5)], 2).map((x) => x.number), [3, 5]);
  assert.deepEqual(pickTrain([c(9), c(3), c(5, [LABEL, SOLO])], 6).map((x) => x.number), [5]);
});

test('main may move under a train only by regeneration-bot commits on generated files', () => {
  const bot = { author: BOT, subject: 'chore(generated): regenerate derived files for abc', files: ['README.md', 'site/index.html', 'site/og/groq.png'] };
  assert.equal(movedOnlyByBot([], BOT), true);
  assert.equal(movedOnlyByBot([bot], BOT), true);
  assert.equal(movedOnlyByBot([{ ...bot, author: 'Paco Cartones' }], BOT), false);
  assert.equal(movedOnlyByBot([{ ...bot, subject: 'feat: x' }], BOT), false);
  assert.equal(movedOnlyByBot([{ ...bot, files: ['data/providers.json'] }], BOT), false);
  assert.equal(movedOnlyByBot([bot], ''), false, 'without an App nothing counts as the bot');
});

const STATE = { base: sha('b'), members: [{ number: 3, head: sha('c') }, { number: 5, head: sha('d') }] };
const trainOf = (over = {}) => ({ number: 50, author: 'free-llm-api-hub-regen', createdAt: '2026-11-27T10:00:00Z', state: STATE, checks: GREEN, ...over });
const membersMap = (over = {}) => new Map([[3, pr({ number: 3, headOid: sha('c') })], [5, pr({ number: 5, headOid: sha('d'), ...over })]]);
const NOW = Date.parse('2026-11-27T11:00:00Z');

test('evaluateTrain: green, heads unchanged and main fine means merge', () => {
  assert.equal(evaluateTrain({ train: trainOf(), members: membersMap(), mainOk: true, now: NOW, botLogin: BOT }).action, 'merge');
});

test('evaluateTrain: a moved head, a lost label, a parked member, main moved or a foreign author abandon the train', () => {
  const ev = (over) => evaluateTrain({ train: trainOf(), members: membersMap(), mainOk: true, now: NOW, botLogin: BOT, ...over });
  assert.equal(ev({ members: membersMap({ headOid: sha('e') }) }).action, 'abandon');
  assert.equal(ev({ members: new Map([[3, pr({ number: 3, headOid: sha('c') })]]) }).action, 'abandon');
  assert.equal(ev({ members: membersMap({ labels: [LABEL, NEEDS_COORDINATOR] }) }).action, 'abandon');
  assert.equal(ev({ mainOk: false }).action, 'abandon');
  assert.equal(ev({ train: trainOf({ author: 'someone' }) }).action, 'abandon');
  assert.equal(ev({ train: trainOf({ state: null }) }).action, 'abandon');
});

test('evaluateTrain: red fails, pending waits until the timeout', () => {
  const red = checksState([{ name: 'Dataset integrity', result: 'fail', at: '1' }], DEFAULT_REQUIRED_CHECKS);
  const pending = checksState([], DEFAULT_REQUIRED_CHECKS);
  const ev = (train, now = NOW) => evaluateTrain({ train, members: membersMap(), mainOk: true, now, botLogin: BOT });
  assert.equal(ev(trainOf({ checks: red })).action, 'fail');
  assert.equal(ev(trainOf({ checks: pending })).action, 'wait');
  assert.equal(ev(trainOf({ checks: pending }), Date.parse('2026-11-27T10:00:00Z') + TRAIN_TIMEOUT_MS + 1).action, 'abandon');
});

test('a red train of one parks its member; a red train of several retries each alone', () => {
  assert.deepEqual(blameFailedTrain({ members: [{ number: 3 }] }, 'x'), { park: [{ number: 3, reason: 'its merge train failed (x)' }], solo: [] });
  assert.deepEqual(blameFailedTrain(STATE, 'x'), { park: [], solo: [3, 5] });
});

// --- the whole run -----------------------------------------------------------------------------------------------

const snap = (over = {}) => ({ prs: [], trains: [], orphanBranches: [], main: sha('b'), mainCommitsSince: () => [], missingLabels: [], ...over });
const types = (plan) => plan.actions.map((a) => a.type);

test('planRun: the only candidate, up to date with main, is merged without a train', () => {
  const plan = planRun(snap({ prs: [pr({ number: 7 })] }), config, NOW);
  assert.deepEqual(types(plan), ['merge']);
  assert.equal(plan.actions[0].number, 7);
  assert.equal(plan.actions[0].main, sha('b'));
});

test('planRun: several candidates, or one behind main, build a train', () => {
  const plan = planRun(snap({ prs: [pr({ number: 9 }), pr({ number: 7, upToDate: false })] }), config, NOW);
  assert.deepEqual(types(plan), ['build-train']);
  assert.deepEqual(plan.actions[0].candidates.map((c) => c.number), [7, 9]);
  assert.deepEqual(types(planRun(snap({ prs: [pr({ upToDate: false })] }), config, NOW)), ['build-train']);
});

test('planRun: while a train runs, no other train starts and its members are left alone', () => {
  const pending = checksState([], DEFAULT_REQUIRED_CHECKS);
  const train = { number: 50, branch: 'ci/merge-train-1', author: BOT, createdAt: '2026-11-27T10:30:00Z', body: formatTrainState(STATE), checks: pending };
  const prs = [pr({ number: 3, headOid: sha('c'), mergeable: 'CONFLICTING' }), pr({ number: 5, headOid: sha('d') }), pr({ number: 8, mergeable: 'CONFLICTING' })];
  const plan = planRun(snap({ prs, trains: [train] }), config, NOW);
  assert.deepEqual(types(plan), ['sync'], 'only #8, which is not in the train, is healed');
  assert.equal(plan.actions[0].number, 8);
});

test('planRun: a green train whose base moved only by the bot is merged', () => {
  const train = { number: 50, branch: 'ci/merge-train-1', author: 'free-llm-api-hub-regen', createdAt: '2026-11-27T10:30:00Z', body: formatTrainState(STATE), checks: GREEN };
  const prs = [pr({ number: 3, headOid: sha('c') }), pr({ number: 5, headOid: sha('d') })];
  const botCommit = { author: BOT, subject: 'chore(generated): x', files: ['README.md'] };
  const plan = planRun(snap({ prs, trains: [train], main: sha('f'), mainCommitsSince: () => [botCommit] }), config, NOW);
  assert.deepEqual(types(plan), ['merge-train']);
  assert.deepEqual(plan.actions[0].members, STATE.members);
  const moved = planRun(snap({ prs, trains: [train], main: sha('f'), mainCommitsSince: () => [{ ...botCommit, author: 'x' }] }), config, NOW);
  assert.equal(moved.actions[0].type, 'close-train');
  assert.match(moved.actions[0].reason, /main moved/);
  assert.equal(moved.actions[1].type, 'build-train', 'the members go straight into a new train on the new main');
});

test('planRun: a red train of several marks its members solo; labels, orphans and extra trains are cleaned up', () => {
  const red = checksState([{ name: 'Dataset integrity', result: 'fail', at: '1' }], DEFAULT_REQUIRED_CHECKS);
  const mk = (number) => ({ number, branch: `ci/merge-train-${number}`, author: BOT, createdAt: '2026-11-27T10:30:00Z', body: formatTrainState(STATE), checks: red });
  const prs = [pr({ number: 3, headOid: sha('c') }), pr({ number: 5, headOid: sha('d') })];
  const plan = planRun(snap({ prs, trains: [mk(40), mk(50)], orphanBranches: ['ci/merge-train-old'], missingLabels: [SOLO] }), config, NOW);
  assert.deepEqual(types(plan).slice(0, 4), ['ensure-labels', 'delete-branch', 'close-train', 'close-train']);
  const closeRed = plan.actions.find((a) => a.type === 'close-train' && a.train.number === 50);
  assert.deepEqual(closeRed.solo, [3, 5]);
  assert.equal(plan.actions.find((a) => a.type === 'close-train' && a.train.number === 40).reason, 'more than one train was open');
  const next = plan.actions.find((a) => a.type === 'build-train');
  assert.deepEqual(next.candidates.map((c) => c.number), [3], 'the same run retries the first member alone, not the same train');
  assert.equal(next.candidates[0].solo, true);
});

test('planRun: a red train of one parks its member and starts nothing with it', () => {
  const red = checksState([{ name: 'Dataset integrity', result: 'fail', at: '1' }], DEFAULT_REQUIRED_CHECKS);
  const one = { base: sha('b'), members: [{ number: 3, head: sha('c') }] };
  const train = { number: 50, branch: 'ci/merge-train-1', author: BOT, createdAt: '2026-11-27T10:30:00Z', body: formatTrainState(one), checks: red };
  const plan = planRun(snap({ prs: [pr({ number: 3, headOid: sha('c') })], trains: [train] }), config, NOW);
  assert.deepEqual(types(plan), ['close-train']);
  assert.deepEqual(plan.actions[0].park.map((p) => p.number), [3]);
});

test('planRun: parks, revokes and fork approvals become actions; waiting pull requests only reach the log', () => {
  const prs = [pr({ number: 1, unresolvedThreads: 1 }), pr({ number: 2, labeledBy: 'x' }), pr({ number: 3, isFork: true, checks: checksState([], DEFAULT_REQUIRED_CHECKS), actionRequired: true }), pr({ number: 4, isDraft: true })];
  const plan = planRun(snap({ prs }), config, NOW);
  assert.deepEqual(types(plan), ['park', 'revoke', 'approve']);
  assert.ok(plan.log.some((l) => l.startsWith('#4: wait')));
});

// --- conflicts ---------------------------------------------------------------------------------------------------

test('conflictStrategy: union, stamp, main for generated outputs, manual for the rest', () => {
  assert.equal(conflictStrategy('site/styles.css'), 'union');
  assert.equal(conflictStrategy('scripts/build.test.mjs'), 'union');
  assert.equal(conflictStrategy('site/index.html'), 'stamp');
  for (const p of ['derived-fingerprints.json', 'README.md', 'site/sitemap.xml', 'site/providers/groq.html', 'site/og/groq.png', 'collections/free-chat.md']) assert.equal(conflictStrategy(p), 'main', p);
  for (const p of ['data/providers.json', 'site/app.js', 'scripts/build.mjs', 'CHANGELOG.md', '.github/workflows/x.yml']) assert.equal(conflictStrategy(p), 'manual', p);
});

test('resolveStampConflicts takes main only where the sides differ in ?v= stamps', () => {
  const file = (a, b) => `<head>\n<<<<<<< HEAD\n${a}\n=======\n${b}\n>>>>>>> refs/remotes/origin/main\n</head>`;
  const ok = resolveStampConflicts(file('<link href="/styles.css?v=aaa1">', '<link href="/styles.css?v=bbb2">'));
  assert.deepEqual(ok, { ok: true, text: '<head>\n<link href="/styles.css?v=bbb2">\n</head>' });
  assert.equal(resolveStampConflicts(file('<p>ours</p>', '<p>theirs</p>')).ok, false);
  assert.equal(resolveStampConflicts('no conflict').ok, false, 'nothing to resolve is not a resolution');
  assert.equal(resolveStampConflicts('<<<<<<< HEAD\nx\n=======\n').ok, false, 'an unterminated hunk');
  const diff3 = '<<<<<<< HEAD\na?v=1\n||||||| base\na?v=0\n=======\na?v=2\n>>>>>>> main';
  assert.deepEqual(resolveStampConflicts(diff3), { ok: true, text: 'a?v=2' });
});

const runGit = (cwd, args) => {
  const r = spawnSync('git', ['-c', 'core.autocrlf=false', '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...args], { cwd, encoding: 'utf8', env: testGitEnv() });
  return r;
};

test('on a real repository, .git/info/attributes unions styles.css and ignores a branch asking for its own driver', () => {
  const dir = makeTmpDir('flah-merge-train-');
  const w = (path, text) => { mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), text); };
  assert.equal(runGit(dir, ['init', '-q', '-b', 'main']).status, 0);
  w('site/styles.css', 'a {}\n'); w('data/x.json', '1\n');
  runGit(dir, ['add', '-A']); runGit(dir, ['commit', '-qm', 'base']);
  runGit(dir, ['checkout', '-qb', 'feature']);
  w('site/styles.css', 'a {}\n.feature {}\n'); w('data/x.json', '2\n');
  w('.gitattributes', 'data/x.json merge=union\n'); // a branch must not choose how its conflicts resolve
  runGit(dir, ['add', '-A']); runGit(dir, ['commit', '-qm', 'feature']);
  runGit(dir, ['checkout', '-q', 'main']);
  w('site/styles.css', 'a {}\n.main {}\n'); w('data/x.json', '3\n');
  runGit(dir, ['add', '-A']); runGit(dir, ['commit', '-qm', 'main moves']);
  runGit(dir, ['checkout', '-q', 'feature']);
  writeFileSync(join(dir, '.git/info/attributes'), infoAttributes());
  const merge = runGit(dir, ['merge', '--no-edit', 'main']);
  assert.notEqual(merge.status, 0, 'data/x.json still conflicts');
  const unmerged = runGit(dir, ['diff', '--name-only', '--diff-filter=U']).stdout.trim().split('\n');
  assert.deepEqual(unmerged, ['data/x.json']);
  const css = readFileSync(join(dir, 'site/styles.css'), 'utf8');
  assert.ok(css.includes('.feature {}') && css.includes('.main {}') && !css.includes('<<<<<<<'), css);
});

// --- workflows ---------------------------------------------------------------------------------------------------

const workflow = (name) => readFileSync(join(ROOT, '.github/workflows', name), 'utf8').replace(/\r\n/g, '\n');

test('merge-train.yml: dispatch and schedule only, one run at a time, never cancelled, App key only in `act`', () => {
  const wf = workflow('merge-train.yml');
  const on = wf.split('\non:\n')[1].split('\n\n')[0];
  assert.deepEqual([...on.matchAll(/^ {2}([a-z_]+):/gm)].map((m) => m[1]), ['workflow_dispatch', 'schedule']);
  assert.match(wf, /\nconcurrency:\n {2}group: merge-train\n {2}cancel-in-progress: false\n/);
  assert.match(wf, /\npermissions: \{\}\n/);
  const [, plan, act] = wf.split(/\n {2}(?:plan|act):\n/);
  assert.doesNotMatch(plan, /: write/, 'planning is read-only');
  assert.doesNotMatch(plan, /secrets\.|environment:/);
  assert.match(act, /environment: regenerate/);
  assert.match(act, /vars\.MERGE_TRAIN_MODE == 'on'/);
  assert.match(act, /secrets\.REGEN_APP_PRIVATE_KEY/);
  assert.doesNotMatch(wf, /npm (?:ci|install)/, 'nothing is installed');
});

test('merge-train-kick.yml: no checkout, no repository code, and the revoke job is never cancelled by a kick', () => {
  const wf = workflow('merge-train-kick.yml');
  assert.doesNotMatch(wf, /actions\/checkout|node scripts\/|npm /);
  assert.match(wf, /gh workflow run merge-train\.yml --ref main/);
  const revoke = wf.split('\n  revoke:\n')[1];
  assert.ok(revoke, 'a revoke job exists');
  assert.doesNotMatch(revoke, /concurrency:/);
  assert.match(revoke, /head\.repo\.full_name != github\.repository/);
  // Each CI workflow the kick listens to exists under that name.
  const names = wf.match(/workflows: \[([^\]]+)\]/)[1].split(',').map((s) => s.trim().replace(/'/g, ''));
  const all = ['verify.yml', 'commit-policy.yml', 'lighthouse.yml', 'codeql.yml'].map((f) => workflow(f).match(/^name: (.+)$/m)[1].trim());
  assert.deepEqual(names, all);
});

// --- linked issues closed after a merge --------------------------------------------------------------------------

test('issuesToClose: open issues of this repository once each; closed, other repositories and pull requests skipped', () => {
  const REPO = 'pacocartones/free-llm-api-hub';
  const issue = (number, state = 'OPEN', repo = REPO, typename = 'Issue') => ({ __typename: typename, number, state, repository: { nameWithOwner: repo } });
  assert.deepEqual(issuesToClose([issue(926)], REPO), [926], 'open, same repository: closed');
  assert.deepEqual(issuesToClose([issue(880, 'CLOSED')], REPO), [], 'already closed: skipped, never reopened');
  assert.deepEqual(issuesToClose([issue(5, 'OPEN', 'someone/else')], REPO), [], 'another repository: skipped');
  assert.deepEqual(issuesToClose([issue(7, 'OPEN', REPO, 'PullRequest')], REPO), [], 'not an issue: skipped');
  assert.deepEqual(issuesToClose([], REPO), [], 'no linked issues: nothing');
  assert.deepEqual(issuesToClose(undefined, REPO), []);
  assert.deepEqual(issuesToClose([issue(926), issue(926), issue(951)], REPO), [926, 951], 'duplicates: once');
  assert.deepEqual(issuesToClose([issue(1, 'OPEN', 'PacoCartones/Free-LLM-API-Hub')], REPO), [1], 'owner/name compared without case');
  assert.equal(closedByMergeComment(1032), 'Closed by #1032, merged by the merge queue.');
});

test('every merge the manager makes closes the linked issues with GITHUB_TOKEN, without failing the merge', () => {
  const src = readFileSync(join(ROOT, 'scripts/merge-train.mjs'), 'utf8');
  const mergePr = src.split('async function mergePr(')[1].split('\n}\n')[0];
  assert.match(mergePr, /if \(res\.ok\) \{[\s\S]*await closeLinkedIssues\(number\);[\s\S]*return \{ ok: true/);
  const close = src.split('async function closeLinkedIssues(')[1].split('\n}\n')[0];
  assert.match(close, /api\(env\.GH_TOKEN, 'POST', '\/graphql'/);
  assert.match(close, /closingIssuesReferences|CLOSING_QUERY/);
  assert.match(close, /state: 'closed', state_reason: 'completed'/);
  assert.doesNotMatch(close, /\bapp\(|APP_TOKEN|park\(/, 'the App token is not used and a failure parks nothing');
  assert.match(close, /catch \(err\) \{\s*closeFailures\+\+;/);
  assert.match(src, /closingIssuesReferences\(first: 25\)/);
  assert.doesNotMatch(workflow('merge-train.yml'), /permission-issues/, 'the App token is not asked for Issues');
});

// --- the regeneration bot follows the manager's merges -----------------------------------------------------------

test('a merge made by the App is regenerated and deployed; the App\'s own commits still are not', () => {
  const merge = 'Merge pull request #12 from pacocartones/data/x\n\nUpdate x';
  assert.equal(loopGuard({ mode: 'push', event: 'push', actor: BOT, botLogin: BOT, headMessage: merge }).run, true);
  assert.equal(loopGuard({ mode: 'push', event: 'push', actor: BOT, botLogin: BOT, headMessage: 'chore(generated): x' }).run, false);
  assert.equal(loopGuard({ mode: 'push', event: 'push', actor: BOT, botLogin: BOT, headMessage: 'anything else' }).run, false);
  const base = { mode: 'push', event: 'push', actor: BOT, botLogin: BOT };
  assert.equal(pagesDeploy({ ...base, headMessage: merge, changed: ['data/providers.json'] }).deploy, false, 'the bot run that follows deploys');
  assert.equal(pagesDeploy({ ...base, headMessage: merge, changed: ['site/app.js'] }).deploy, true);
  assert.equal(pagesDeploy({ ...base, headMessage: 'chore(generated): x', changed: ['site/app.js'] }).deploy, false);
});

// --- healing a conflicting branch (scripts/merge-train.mjs mergeMainInto) ---------------------------------------

test('merging main into a branch resolves generated files, stamps and union files, and stops on anything else', async () => {
  const { useRepo, prepareMerges, mergeMainInto, resetTree } = await import('./merge-train.mjs');
  const dir = makeTmpDir('flah-merge-train-heal-');
  const w = (path, text) => { mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), text); };
  const g = (...args) => { const r = runGit(dir, args); assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`); return r.stdout.trim(); };
  g('init', '-q', '-b', 'main');
  g('config', 'user.name', 'bot'); g('config', 'user.email', 'bot@example.invalid'); g('config', 'core.autocrlf', 'false');
  g('config', 'commit.gpgsign', 'false');
  w('site/index.html', '<link href="/styles.css?v=0">\n<p>home</p>\n'); w('site/styles.css', 'a {}\n');
  w('derived-fingerprints.json', '{"a":0}\n'); w('data/p.json', '0\n');
  g('add', '-A'); g('commit', '-qm', 'base');
  g('checkout', '-qb', 'data/x');
  w('site/index.html', '<link href="/styles.css?v=1">\n<p>home</p>\n'); w('site/styles.css', 'a {}\n.x {}\n'); w('derived-fingerprints.json', '{"a":1}\n');
  g('commit', '-qam', 'branch');
  const branchHead = g('rev-parse', 'HEAD');
  g('checkout', '-q', 'main');
  w('site/index.html', '<link href="/styles.css?v=2">\n<p>home</p>\n'); w('site/styles.css', 'a {}\n.m {}\n'); w('derived-fingerprints.json', '{"a":2}\n');
  g('commit', '-qam', 'main');
  useRepo(dir); prepareMerges();
  g('checkout', '-q', '--detach', branchHead);
  const ok = mergeMainInto('data/x', 'main');
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.deepEqual(ok.resolved.sort(), ['derived-fingerprints.json', 'site/index.html']);
  assert.equal(readFileSync(join(dir, 'derived-fingerprints.json'), 'utf8'), '{"a":2}\n', 'a generated file takes main');
  assert.equal(readFileSync(join(dir, 'site/index.html'), 'utf8'), '<link href="/styles.css?v=2">\n<p>home</p>\n');
  assert.match(readFileSync(join(dir, 'site/styles.css'), 'utf8'), /\.x \{\}[\s\S]*\.m \{\}|\.m \{\}[\s\S]*\.x \{\}/);
  assert.equal(g('log', '-1', '--format=%P').split(' ').length, 2, 'a merge commit');

  // A conflict in a canonical input is left to a human.
  g('checkout', '-q', 'main'); w('data/p.json', 'main\n'); g('commit', '-qam', 'main data');
  g('checkout', '-q', '--detach', branchHead); w('data/p.json', 'branch\n'); g('commit', '-qam', 'branch data');
  const bad = mergeMainInto('data/x', 'main');
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.manual, ['data/p.json']);
  resetTree();
  assert.equal(g('status', '--porcelain'), '', 'the tree is clean again');
  useRepo(process.cwd());
});
