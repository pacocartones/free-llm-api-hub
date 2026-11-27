#!/usr/bin/env node
// merge-train.mjs — the merge manager that runs in GitHub Actions (.github/workflows/merge-train.yml).
//
//   node scripts/merge-train.mjs plan   read the state (one GraphQL query + anonymous git fetches), decide, print the
//                                       decisions; writes `act` and `plan` to $GITHUB_OUTPUT
//   node scripts/merge-train.mjs act    carry out the plan in $PLAN: labels and comments with GITHUB_TOKEN ($GH_TOKEN),
//                                       pushes, train pull requests and merges with the App token ($APP_TOKEN)
//
// It never runs code from a pull request: it only fetches pull-request commits as git objects and merges them. It
// installs nothing and imports only Node built-ins and scripts/lib. The decisions are pure functions in
// scripts/lib/merge-train.mjs; the design, the failure modes and how to stop it are in docs/maintenance/merge-train.md.
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LABEL, LABELS, NEEDS_COORDINATOR, SOLO, TRAIN_LABEL, TRAIN_PREFIX, checksState, conflictStrategy, formatTrainState,
  infoAttributes, lastLabeler, normalizeContexts, parkComment, parseConfig, planRun, resolveStampConflicts,
  revokeComment, safeBranch, trainBranch,
} from './lib/merge-train.mjs';

const env = process.env;
const REPO = env.GITHUB_REPOSITORY ?? '';
const [OWNER, NAME] = REPO.split('/');
const API = env.GITHUB_API_URL || 'https://api.github.com';
const config = parseConfig(env);
let calls = 0;

const summary = (text) => { if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `${text}\n`); };
const output = (key, value) => {
  if (!env.GITHUB_OUTPUT) return;
  const delim = `EOF_${Math.random().toString(36).slice(2)}`;
  appendFileSync(env.GITHUB_OUTPUT, `${key}<<${delim}\n${value}\n${delim}\n`);
};

// --- GitHub API --------------------------------------------------------------------------------------------------

async function api(token, method, path, body) {
  calls++;
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28',
      'user-agent': 'merge-train', ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, ok: res.ok, data };
}

const QUERY = `query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    ${Object.keys(LABELS).map((name, i) => `l${i}: label(name: ${JSON.stringify(name)}) { name }`).join('\n    ')}
    prs: pullRequests(states: OPEN, labels: [${JSON.stringify(LABEL)}], first: 50, orderBy: {field: CREATED_AT, direction: ASC}) { nodes { ...P } }
    trains: pullRequests(states: OPEN, labels: [${JSON.stringify(TRAIN_LABEL)}], first: 5) { nodes { ...P body } }
  }
  rateLimit { cost remaining }
}
fragment P on PullRequest {
  number isDraft isCrossRepository headRefName headRefOid mergeable createdAt
  author { login }
  labels(first: 20) { nodes { name } }
  reviewThreads(first: 50) { nodes { isResolved } }
  timelineItems(itemTypes: [LABELED_EVENT], last: 10) { nodes { ... on LabeledEvent { actor { login } label { name } } } }
  commits(last: 1) { nodes { commit { oid statusCheckRollup { contexts(first: 60) { nodes {
    __typename
    ... on CheckRun { name status conclusion startedAt completedAt }
    ... on StatusContext { context state createdAt }
  } } } } } }
}`;

async function readState(token) {
  const res = await api(token, 'POST', '/graphql', { query: QUERY, variables: { owner: OWNER, name: NAME } });
  if (!res.ok || res.data?.errors) throw new Error(`GraphQL: ${res.status} ${JSON.stringify(res.data?.errors ?? res.data).slice(0, 500)}`);
  return res.data.data;
}

// --- git ---------------------------------------------------------------------------------------------------------

let cwd = process.cwd();
/** The repository the git helpers work in (the checkout of main in CI; a scratch repository in the tests). */
export const useRepo = (dir) => { cwd = dir; };
const git = (args) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const gitOk = (args) => spawnSync('git', args, { cwd, stdio: 'ignore' }).status === 0;
const gitTry = (args) => spawnSync('git', args, { cwd, encoding: 'utf8' });
const nul = (s) => s.split('\0').filter(Boolean);
const remoteWithToken = (token) => `https://x-access-token:${token}@github.com/${REPO}.git`;

/** Fetch main and the given pull-request heads from the public remote (no token). */
function fetchRefs(numbers) {
  const specs = ['+refs/heads/main:refs/remotes/origin/main', ...numbers.map((n) => `+refs/pull/${n}/head:refs/remotes/pr/${n}`)];
  git(['fetch', '--quiet', '--no-tags', 'origin', ...specs]);
}
const revOf = (ref) => { const r = gitTry(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]); return r.status === 0 ? r.stdout.trim() : null; };
const lsRemote = (ref) => (git(['ls-remote', 'origin', ref]).split('\t')[0] || null);

function mainCommitsSince(base) {
  if (!revOf(base) || !gitOk(['merge-base', '--is-ancestor', base, 'refs/remotes/origin/main'])) {
    return [{ author: '', subject: '(the train base is not an ancestor of main)', files: [] }];
  }
  const out = git(['log', '--format=%H%x1f%an%x1f%s%x1e', `${base}..refs/remotes/origin/main`]);
  return out.split('\x1e').map((s) => s.trim()).filter(Boolean).map((line) => {
    const [sha, author, subject] = line.split('\x1f');
    return { author, subject, files: nul(git(['diff-tree', '--no-commit-id', '--name-only', '-r', '-z', sha])) };
  });
}

// --- plan --------------------------------------------------------------------------------------------------------

function normalizePr(node) {
  const head = node.commits?.nodes?.[0]?.commit;
  const contexts = normalizeContexts(head?.statusCheckRollup?.contexts?.nodes ?? []);
  return {
    number: node.number, isDraft: node.isDraft, isFork: node.isCrossRepository, headRef: node.headRefName,
    headOid: node.headRefOid, mergeable: node.mergeable, createdAt: node.createdAt, author: node.author?.login ?? '',
    labels: (node.labels?.nodes ?? []).map((l) => l.name),
    unresolvedThreads: (node.reviewThreads?.nodes ?? []).filter((t) => !t.isResolved).length,
    labeledBy: lastLabeler(node.timelineItems?.nodes ?? []),
    checks: checksState(head?.oid === node.headRefOid ? contexts : [], config.requiredChecks),
    body: node.body,
  };
}

async function plan() {
  const data = await readState(env.GH_TOKEN);
  const repo = data.repository;
  const missingLabels = Object.keys(LABELS).filter((_, i) => !repo[`l${i}`]);
  const prs = repo.prs.nodes.map(normalizePr).filter((p) => !p.headRef.startsWith(TRAIN_PREFIX));
  const trains = repo.trains.nodes.map(normalizePr).filter((t) => t.headRef.startsWith(TRAIN_PREFIX))
    .map((t) => ({ number: t.number, branch: t.headRef, author: t.author, createdAt: t.createdAt, body: t.body, checks: t.checks }));

  fetchRefs(prs.map((p) => p.number));
  const main = revOf('refs/remotes/origin/main');
  for (const pr of prs) {
    const local = revOf(`refs/remotes/pr/${pr.number}`);
    if (local !== pr.headOid) { pr.upToDate = null; pr.touchesWorkflows = false; continue; }
    pr.upToDate = gitOk(['merge-base', '--is-ancestor', main, local]);
    pr.touchesWorkflows = nul(git(['diff', '--name-only', '-z', `${main}...${local}`])).some((f) => f.startsWith('.github/workflows/'));
  }
  const pendingForks = prs.filter((p) => p.isFork && p.checks.state === 'pending' && p.checks.missing.length === config.requiredChecks.length);
  if (pendingForks.length) {
    // One call, and only when a labelled fork pull request has no required check at all yet.
    const res = await api(env.GH_TOKEN, 'GET', '/repos/' + REPO + '/actions/runs?status=action_required&per_page=100');
    const waiting = new Set((res.data?.workflow_runs ?? []).map((r) => r.head_sha));
    for (const p of pendingForks) p.actionRequired = waiting.has(p.headOid);
  }
  const trainBranches = new Set(trains.map((t) => t.branch));
  const orphanBranches = git(['ls-remote', '--heads', 'origin', `${TRAIN_PREFIX}*`]).split('\n').filter(Boolean)
    .map((l) => l.split('\t')[1].replace('refs/heads/', '')).filter((b) => !trainBranches.has(b));

  const { actions, log } = planRun({ prs, trains, orphanBranches, main, mainCommitsSince, missingLabels }, config, Date.now());
  const compact = actions.map((a) => (a.train ? { ...a, train: { number: a.train.number, branch: a.train.branch } } : a));

  console.log(`mode ${config.mode}; ${prs.length} labelled pull request(s), ${trains.length} train(s); GraphQL cost ${data.rateLimit?.cost}, remaining ${data.rateLimit?.remaining}; ${calls} API call(s)`);
  for (const line of log) console.log(`  ${line}`);
  for (const a of compact) console.log(`  -> ${describe(a)}`);
  summary([`### Merge manager (${config.mode})`, '', ...log.map((l) => `- ${l}`), '', '**Actions**', '',
    ...(compact.length ? compact.map((a) => `- ${describe(a)}`) : ['- none']),
    ...(config.mode === 'shadow' ? ['', 'Shadow mode: nothing was changed.'] : [])].join('\n'));
  output('act', String(config.mode === 'on' && compact.length > 0));
  output('plan', JSON.stringify(compact));
}

function describe(a) {
  switch (a.type) {
    case 'ensure-labels': return `create label(s) ${a.names.join(', ')}`;
    case 'delete-branch': return `delete ${a.branch} (${a.reason})`;
    case 'close-train': return `close train #${a.train.number} (${a.reason})${a.solo.length ? `; retry ${a.solo.map((n) => `#${n}`).join(' ')} one at a time` : ''}${a.park.length ? `; park ${a.park.map((p) => `#${p.number}`).join(' ')}` : ''}`;
    case 'merge-train': return `merge train #${a.train.number}: ${a.members.map((m) => `#${m.number}`).join(', ')}`;
    case 'merge': return `merge #${a.number} directly (${a.reason})`;
    case 'build-train': return `build a train from ${a.candidates.map((c) => `#${c.number}`).join(', ')}`;
    case 'sync': return `merge main into #${a.number} (${a.reason})`;
    case 'approve': return `approve the waiting fork runs of #${a.number}`;
    default: return `${a.type} #${a.number} (${a.reason})`;
  }
}

// --- act ---------------------------------------------------------------------------------------------------------

const gh = (method, path, body) => api(env.GH_TOKEN, method, `/repos/${REPO}${path}`, body);
const app = (method, path, body) => api(env.APP_TOKEN, method, `/repos/${REPO}${path}`, body);
const comment = (number, body) => gh('POST', `/issues/${number}/comments`, { body });
const addLabel = (number, name) => gh('POST', `/issues/${number}/labels`, { labels: [name] });
const removeLabel = (number, name) => gh('DELETE', `/issues/${number}/labels/${encodeURIComponent(name)}`);

async function park(number, reason) {
  console.log(`park #${number}: ${reason}`);
  await addLabel(number, NEEDS_COORDINATOR);
  await comment(number, parkComment(reason));
}

let identity = null;
async function useBotIdentity() {
  if (identity) return;
  const slug = env.APP_SLUG;
  const res = await api(env.APP_TOKEN, 'GET', `/users/${encodeURIComponent(`${slug}[bot]`)}`);
  identity = { name: `${slug}[bot]`, email: `${res.data?.id}+${slug}[bot]@users.noreply.github.com` };
  git(['config', 'user.name', identity.name]);
  git(['config', 'user.email', identity.email]);
}

export function prepareMerges() {
  mkdirSync(join(cwd, '.git', 'info'), { recursive: true });
  writeFileSync(join(cwd, '.git', 'info', 'attributes'), infoAttributes());
  git(['config', 'merge.conflictStyle', 'merge']);
}

export const resetTree = () => { gitTry(['merge', '--abort']); git(['reset', '--quiet', '--hard']); git(['clean', '-fdq']); };

/** Merge main (`refs/remotes/origin/main`) into the checked-out branch, resolving the conflicts conflictStrategy allows. */
export function mergeMainInto(branch, main = 'refs/remotes/origin/main') {
  const r = gitTry(['merge', '--no-ff', '--no-edit', '-m', `Merge branch 'main' into ${branch}`, main]);
  if (r.status === 0) return { ok: true };
  const conflicted = nul(git(['diff', '--name-only', '--diff-filter=U', '-z']));
  if (!conflicted.length) return { ok: false, manual: ['(merge failed without conflicts)'] };
  const manual = [];
  for (const path of conflicted) {
    const strategy = conflictStrategy(path);
    const stages = git(['ls-files', '-u', '--', path]).split('\n').map((l) => l.split(/\s+/)[2]);
    if (strategy === 'main') {
      if (stages.includes('3')) { git(['checkout', '--theirs', '--', path]); git(['add', '--', path]); } else git(['rm', '--quiet', '--', path]);
    } else if (strategy === 'stamp' && stages.includes('2') && stages.includes('3')) {
      const { ok, text } = resolveStampConflicts(readFileSync(join(cwd, path), 'utf8'));
      if (ok) { writeFileSync(join(cwd, path), text); git(['add', '--', path]); } else manual.push(path);
    } else manual.push(path);
  }
  if (manual.length) return { ok: false, manual };
  git(['commit', '--no-edit', '--quiet']);
  return { ok: true, resolved: conflicted };
}

async function doSync(a) {
  if (!safeBranch(a.branch)) return park(a.number, `the branch name ${JSON.stringify(a.branch)} is not one the merge manager handles`);
  fetchRefs([a.number]);
  if (revOf(`refs/remotes/pr/${a.number}`) !== a.head) return console.log(`#${a.number}: head moved since the plan; next run`);
  await useBotIdentity();
  git(['checkout', '--quiet', '--detach', a.head]);
  const res = mergeMainInto(a.branch);
  if (!res.ok) { resetTree(); return park(a.number, `merging main conflicts in ${res.manual.join(', ')}`); }
  const push = gitTry(['push', '--quiet', `--force-with-lease=refs/heads/${a.branch}:${a.head}`, remoteWithToken(env.APP_TOKEN), `HEAD:refs/heads/${a.branch}`]);
  if (push.status !== 0) { console.log(`#${a.number}: push refused (${push.stderr.trim().split('\n').pop()}); next run`); return; }
  console.log(`#${a.number}: merged main${res.resolved ? ` (resolved ${res.resolved.join(', ')})` : ''}`);
}

async function mergePr(number, head) {
  const res = await app('PUT', `/pulls/${number}/merge`, { sha: head, merge_method: config.mergeMethod });
  if (res.ok) { console.log(`merged #${number}`); return { ok: true, sha: res.data.sha }; }
  const message = res.data?.message ?? `HTTP ${res.status}`;
  if (res.status === 409) { console.log(`#${number}: head changed (${message}); next run`); return { ok: false }; }
  await park(number, `GitHub refused the merge: ${message}`);
  return { ok: false };
}

async function closeTrain(train, reason) {
  await gh('POST', `/issues/${train.number}/comments`, { body: `Closed by the merge manager: ${reason}.` });
  await gh('PATCH', `/pulls/${train.number}`, { state: 'closed' });
  if (safeBranch(train.branch) && train.branch.startsWith(TRAIN_PREFIX)) gitTry(['push', '--quiet', remoteWithToken(env.APP_TOKEN), '--delete', `refs/heads/${train.branch}`]);
}

async function doBuildTrain(a) {
  fetchRefs(a.candidates.map((c) => c.number));
  if (revOf('refs/remotes/origin/main') !== a.main) return console.log('main moved since the plan; next run');
  await useBotIdentity();
  git(['checkout', '--quiet', '--detach', a.main]);
  const members = []; const skipped = [];
  for (const c of a.candidates) {
    if (revOf(`refs/remotes/pr/${c.number}`) !== c.head) { skipped.push(`#${c.number} (new commits)`); continue; }
    const r = gitTry(['merge', '--no-ff', '--no-edit', '-m', `Merge #${c.number} into the merge train`, c.head]);
    if (r.status === 0) members.push({ number: c.number, head: c.head });
    else { gitTry(['merge', '--abort']); skipped.push(`#${c.number} (conflicts with an earlier member)`); }
  }
  if (!members.length) return console.log(`no train: ${skipped.join(', ')}`);
  const branch = trainBranch(new Date());
  const push = gitTry(['push', '--quiet', remoteWithToken(env.APP_TOKEN), `HEAD:refs/heads/${branch}`]);
  if (push.status !== 0) throw new Error(`push of ${branch} refused: ${push.stderr.trim()}`);
  const list = members.map((m) => `#${m.number}`).join(', ');
  const body = [
    `Merge train: main (\`${a.main.slice(0, 7)}\`) + ${list}, merged in this order. The required checks run once on the combination;`,
    'when they pass and main has not moved (except regeneration-bot commits), the merge manager merges each pull request',
    'with its tested head and closes this one. Do not push to this branch or merge this pull request.',
    '', ...(skipped.length ? [`Left for a later train: ${skipped.join(', ')}.`, ''] : []),
    'See docs/maintenance/merge-train.md.', '', formatTrainState({ base: a.main, members }),
  ].join('\n');
  const pr = await app('POST', '/pulls', { title: `ci: merge train ${list}`, head: branch, base: 'main', body });
  if (!pr.ok) {
    gitTry(['push', '--quiet', remoteWithToken(env.APP_TOKEN), '--delete', `refs/heads/${branch}`]);
    throw new Error(`opening the train pull request failed: ${pr.status} ${pr.data?.message}`);
  }
  await addLabel(pr.data.number, TRAIN_LABEL);
  console.log(`train #${pr.data.number} (${branch}): ${list}${skipped.length ? `; skipped ${skipped.join(', ')}` : ''}`);
}

async function doMergeTrain(a) {
  let expected = a.main;
  if (lsRemote('refs/heads/main') !== expected) return console.log('main moved since the plan; next run');
  const merged = [];
  for (const m of a.members) {
    if (merged.length && lsRemote('refs/heads/main') !== expected) {
      return closeTrain(a.train, `main moved while merging (after ${merged.map((n) => `#${n}`).join(', ')}); the rest goes in the next train`);
    }
    const res = await mergePr(m.number, m.head);
    if (!res.ok) return closeTrain(a.train, `#${m.number} could not be merged${merged.length ? ` (merged before it: ${merged.map((n) => `#${n}`).join(', ')})` : ''}`);
    merged.push(m.number); expected = res.sha;
  }
  await closeTrain(a.train, `merged ${merged.map((n) => `#${n}`).join(', ')}`);
}

async function doApprove(a) {
  const res = await gh('GET', `/actions/runs?status=action_required&head_sha=${a.head}&per_page=20`);
  const runs = (res.data?.workflow_runs ?? []).filter((r) => r.head_sha === a.head && r.event === 'pull_request');
  for (const run of runs) {
    const r = await gh('POST', `/actions/runs/${run.id}/approve`);
    if (!r.ok) return park(a.number, `approving its waiting workflow runs failed (${r.status} ${r.data?.message ?? ''}); approve them in the Actions tab`);
  }
  console.log(`#${a.number}: approved ${runs.length} run(s)`);
}

async function act() {
  const actions = JSON.parse(env.PLAN || '[]');
  if (!env.GH_TOKEN || !env.APP_TOKEN || !env.APP_SLUG) throw new Error('GH_TOKEN, APP_TOKEN and APP_SLUG are required');
  prepareMerges();
  let failed = 0;
  for (const a of actions) {
    try {
      switch (a.type) {
        case 'ensure-labels':
          for (const name of a.names) await gh('POST', '/labels', { name, ...LABELS[name] });
          break;
        case 'delete-branch':
          if (a.branch.startsWith(TRAIN_PREFIX) && safeBranch(a.branch)) gitTry(['push', '--quiet', remoteWithToken(env.APP_TOKEN), '--delete', `refs/heads/${a.branch}`]);
          break;
        case 'close-train':
          await closeTrain(a.train, a.reason);
          for (const p of a.park) await park(p.number, p.reason);
          for (const n of a.solo) await addLabel(n, SOLO);
          break;
        case 'park': await park(a.number, a.reason); break;
        case 'revoke': await removeLabel(a.number, LABEL); await comment(a.number, revokeComment(a.reason)); break;
        case 'sync': await doSync(a); break;
        case 'approve': await doApprove(a); break;
        case 'merge':
          if (lsRemote('refs/heads/main') !== a.main) console.log('main moved since the plan; next run');
          else await mergePr(a.number, a.head);
          break;
        case 'build-train': await doBuildTrain(a); break;
        case 'merge-train': await doMergeTrain(a); break;
        default: console.log(`unknown action ${a.type}`);
      }
    } catch (err) {
      failed++;
      console.log(`::error title=Merge manager::${a.type}${a.number ? ` #${a.number}` : ''}: ${err.message}`);
      resetTree();
    } finally {
      gitTry(['checkout', '--quiet', '--detach', 'refs/remotes/origin/main']);
    }
  }
  console.log(`${actions.length} action(s), ${failed} failed, ${calls} API call(s)`);
  if (failed) process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const command = process.argv[2];
  if (!OWNER || !NAME) { console.error('GITHUB_REPOSITORY is required'); process.exit(2); }
  if (command === 'plan') await plan();
  else if (command === 'act') await act();
  else { console.error('usage: merge-train.mjs plan|act'); process.exit(2); }
}
