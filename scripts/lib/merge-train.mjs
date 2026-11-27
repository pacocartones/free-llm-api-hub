// merge-train.mjs — the pure decisions of the merge manager (scripts/merge-train.mjs, .github/workflows/merge-train.yml).
//
// Nothing here touches the network, git or the clock: every function takes plain data and returns plain data, so the
// whole state machine is unit-tested (scripts/merge-train.test.mjs). The design is in docs/maintenance/merge-train.md.
//
// Vocabulary:
//   candidate  an open pull request a maintainer approved with the `merge-train` label, green and mergeable
//   train      a branch ci/merge-train-<ts> = main + candidates merged in order, opened as a pull request so the
//              required checks run once on the combination; when it is green the original pull requests are merged
//   park       hand a pull request to the coordinator: label `needs-coordinator`, one short comment, never touch it again
//              until a human removes the label
import { isGeneratedOutput } from '../generated-targets.mjs';

export const LABEL = 'merge-train';
export const NEEDS_COORDINATOR = 'needs-coordinator';
export const SOLO = 'merge-train-solo';
export const TRAIN_LABEL = 'merge-train-run';
export const TRAIN_PREFIX = 'ci/merge-train-';
export const LABELS = Object.freeze({
  [LABEL]: { color: '0e8a16', description: 'Approved: the merge manager may merge this pull request (maintainers only)' },
  [NEEDS_COORDINATOR]: { color: 'd93f0b', description: 'The merge manager stopped: a human must look at this pull request' },
  [SOLO]: { color: 'fbca04', description: 'Merge manager: test this pull request alone in the next train' },
  [TRAIN_LABEL]: { color: 'c5def5', description: 'A merge-train pull request opened by the merge manager' },
});

export const DEFAULT_REQUIRED_CHECKS = Object.freeze([
  'Dataset integrity', 'Windows tests', 'commit policy', 'Lighthouse accessibility and performance', 'Analyze (javascript-typescript)',
]);
export const DEFAULT_MAX_TRAIN = 6;
export const TRAIN_TIMEOUT_MS = 4 * 60 * 60 * 1000; // a train still pending after 4 h is closed and rebuilt
export const STATE_MARKER = 'merge-train-state';
export const BOT_COMMIT_PREFIX = 'chore(generated):';

// --- configuration -----------------------------------------------------------------------------------------------

/** MERGE_TRAIN_MODE: `on` acts, `shadow` only logs its decisions, anything else (unset included) does nothing. */
export const parseMode = (value) => {
  const v = String(value ?? '').trim().toLowerCase();
  return v === 'on' || v === 'shadow' ? v : 'off';
};

const list = (value) => String(value ?? '').split(/[,\n]/).map((s) => s.trim()).filter(Boolean);

/** The configuration from the environment of the workflow (repository variables), with safe defaults. */
export function parseConfig(env = {}) {
  const max = Number.parseInt(env.MERGE_TRAIN_MAX ?? '', 10);
  const owner = String(env.GITHUB_REPOSITORY ?? '').split('/')[0];
  const labelers = list(env.MERGE_TRAIN_LABELERS);
  return {
    mode: parseMode(env.MERGE_TRAIN_MODE),
    requiredChecks: list(env.MERGE_TRAIN_REQUIRED_CHECKS).length ? list(env.MERGE_TRAIN_REQUIRED_CHECKS) : [...DEFAULT_REQUIRED_CHECKS],
    maxTrain: Number.isInteger(max) && max >= 1 && max <= 20 ? max : DEFAULT_MAX_TRAIN,
    labelers: labelers.length ? labelers : (owner ? [owner] : []),
    mergeMethod: ['merge', 'squash', 'rebase'].includes(env.MERGE_TRAIN_METHOD) ? env.MERGE_TRAIN_METHOD : 'merge',
    botLogin: env.REGEN_APP_SLUG ? `${env.REGEN_APP_SLUG}[bot]` : '',
  };
}

// --- checks ------------------------------------------------------------------------------------------------------

const GOOD = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED']);
const BAD = new Set(['FAILURE', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE', 'STALE', 'ERROR']);

/** GraphQL statusCheckRollup context nodes (CheckRun or StatusContext) as { name, result: 'pass'|'fail'|'pending', at }. */
export function normalizeContexts(nodes = []) {
  return (nodes ?? []).filter(Boolean).map((n) => {
    if (n.__typename === 'StatusContext' || ('context' in n && !('name' in n))) {
      const state = String(n.state ?? '').toUpperCase();
      return { name: n.context, result: GOOD.has(state) ? 'pass' : BAD.has(state) ? 'fail' : 'pending', at: n.createdAt ?? '' };
    }
    const status = String(n.status ?? '').toUpperCase();
    const conclusion = String(n.conclusion ?? '').toUpperCase();
    const result = status !== 'COMPLETED' ? 'pending' : GOOD.has(conclusion) ? 'pass' : 'fail';
    return { name: n.name, result, at: n.completedAt || n.startedAt || '' };
  });
}

/** The verdict of the required checks: green (all pass), red (one failed), pending (one missing or running). The
 * latest run of a name wins, so a re-run that passed clears an earlier failure. */
export function checksState(contexts, required) {
  const latest = new Map();
  for (const c of contexts) {
    const prev = latest.get(c.name);
    if (!prev || String(c.at) >= String(prev.at)) latest.set(c.name, c);
  }
  const failing = []; const missing = [];
  for (const name of required) {
    const c = latest.get(name);
    if (!c || c.result === 'pending') missing.push(name);
    else if (c.result === 'fail') failing.push(name);
  }
  return { state: failing.length ? 'red' : missing.length ? 'pending' : 'green', failing, missing };
}

// --- one pull request --------------------------------------------------------------------------------------------

/** Who last added the `merge-train` label, from LabeledEvent timeline nodes (oldest first); null when unknown. */
export function lastLabeler(events = [], label = LABEL) {
  const hits = (events ?? []).filter((e) => e?.label?.name === label);
  return hits.length ? (hits[hits.length - 1].actor?.login ?? null) : null;
}

/**
 * What to do with one labelled pull request. `pr`:
 *   number, isDraft, isFork, mergeable ('MERGEABLE'|'CONFLICTING'|'UNKNOWN'), labels [names], unresolvedThreads,
 *   checks (checksState), labeledBy (login|null), upToDate (head contains main: true|false|null when unknown),
 *   touchesWorkflows (bool), inTrain (member of the train in flight)
 * Returns { action, reason } with action one of:
 *   skip      parked already, or a member of the train in flight: nothing to do
 *   wait      draft, mergeability being computed, checks running
 *   revoke    the label was not added by an allowed maintainer: remove it
 *   park      needs a human (conflict outside the auto-resolvable files, red on an up-to-date head, review threads…)
 *   sync      merge main into the branch (behind and red, or conflicting): same-repository branches only
 *   approve   first-time contributor runs from a fork wait for approval
 *   candidate green and mergeable: may join the next train
 */
export function classifyPr(pr, config) {
  const labels = new Set(pr.labels ?? []);
  if (labels.has(NEEDS_COORDINATOR)) return { action: 'skip', reason: `labelled ${NEEDS_COORDINATOR}` };
  if (pr.inTrain) return { action: 'skip', reason: 'in the train in flight' };
  if (pr.labeledBy === null || pr.labeledBy === undefined) return { action: 'wait', reason: 'who added the label is not known yet' };
  if (!config.labelers.includes(pr.labeledBy)) {
    return { action: 'revoke', reason: `the ${LABEL} label was added by @${pr.labeledBy}, who is not in MERGE_TRAIN_LABELERS` };
  }
  if (pr.isDraft) return { action: 'wait', reason: 'draft' };
  if (pr.touchesWorkflows) {
    return { action: 'park', reason: 'it changes .github/workflows/, which the App token cannot push or merge (no `workflows` permission); merge it by hand' };
  }
  if (pr.unresolvedThreads > 0) return { action: 'park', reason: `${pr.unresolvedThreads} unresolved review thread(s)` };
  if (pr.mergeable === 'CONFLICTING') {
    return pr.isFork
      ? { action: 'park', reason: 'it conflicts with main and its branch is in a fork' }
      : { action: 'sync', reason: 'it conflicts with main: merge main into it' };
  }
  if (pr.mergeable !== 'MERGEABLE') return { action: 'wait', reason: 'GitHub is still computing mergeability' };
  const { state, failing, missing } = pr.checks;
  if (state === 'red') {
    if (pr.isFork) return { action: 'park', reason: `failing: ${failing.join(', ')} (branch in a fork)` };
    if (pr.upToDate === false) return { action: 'sync', reason: `failing: ${failing.join(', ')}; behind main, so merge main in once` };
    if (pr.upToDate !== true) return { action: 'wait', reason: 'failing, and whether the head contains main is not known' };
    return { action: 'park', reason: `failing on a head that already contains main: ${failing.join(', ')}` };
  }
  if (state === 'pending') {
    if (pr.isFork && pr.actionRequired) return { action: 'approve', reason: 'fork runs wait for a maintainer approval' };
    return { action: 'wait', reason: `checks not finished: ${missing.join(', ')}` };
  }
  return { action: 'candidate', reason: 'green and mergeable' };
}

// --- trains ------------------------------------------------------------------------------------------------------

/** The train branch for a moment: ci/merge-train-YYYYMMDD-HHMMSS (passes the commit-policy branch rule). */
export const trainBranch = (date) => `${TRAIN_PREFIX}${date.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)}`;

/** The machine-readable block in a train pull request's body. */
export const formatTrainState = (state) => `<!-- ${STATE_MARKER} ${JSON.stringify(state)} -->`;

export function parseTrainState(body) {
  const m = String(body ?? '').match(new RegExp(`<!-- ${STATE_MARKER} (\\{.*?\\}) -->`));
  if (!m) return null;
  try {
    const s = JSON.parse(m[1]);
    const sha = (v) => typeof v === 'string' && /^[0-9a-f]{40}$/.test(v);
    if (!sha(s.base) || !Array.isArray(s.members) || !s.members.length) return null;
    if (!s.members.every((x) => Number.isInteger(x.number) && x.number > 0 && sha(x.head))) return null;
    return { base: s.base, members: s.members.map(({ number, head }) => ({ number, head })) };
  } catch { return null; }
}

/** The candidates of the next train, oldest pull request first. A candidate marked solo (a train with it failed)
 * travels alone. */
export function pickTrain(candidates, maxTrain) {
  const sorted = [...candidates].sort((a, b) => a.number - b.number);
  const solo = sorted.find((c) => (c.labels ?? []).includes(SOLO));
  if (solo) return [solo];
  return sorted.slice(0, maxTrain);
}

/** Main moved since `base` only by the regeneration bot: every commit is the bot's, with the bot subject, and only
 * touches generated files. `commits`: [{ author, subject, files }] (from git log base..main). */
export function movedOnlyByBot(commits, botLogin) {
  if (!botLogin) return commits.length === 0;
  return commits.every((c) => c.author === botLogin && c.subject.startsWith(BOT_COMMIT_PREFIX)
    && c.files.every((f) => isGeneratedOutput(f) || /^site\/og\/[^/]+\.(png|svg)$/.test(f)));
}

// GraphQL gives an App's login without the `[bot]` suffix that REST and git use.
const bare = (login) => String(login ?? '').replace(/\[bot\]$/, '');

/**
 * What to do with the open train. `train`: { number, author, createdAt, state (parseTrainState), checks }.
 * `now`: ms. `members`: Map number -> the labelled pull request as it is now (or undefined when it lost the label or
 * closed). `mainOk`: main is still the train's base, or moved only by the bot.
 * Returns { action: 'wait'|'merge'|'abandon'|'fail', reason }.
 */
export function evaluateTrain({ train, members, mainOk, now, botLogin }) {
  if (!train.state) return { action: 'abandon', reason: 'the train pull request has no readable state block' };
  if (botLogin && bare(train.author) !== bare(botLogin)) return { action: 'abandon', reason: `opened by @${train.author}, not by the merge manager` };
  for (const m of train.state.members) {
    const pr = members.get(m.number);
    if (!pr) return { action: 'abandon', reason: `#${m.number} closed or lost the ${LABEL} label` };
    if (pr.headOid !== m.head) return { action: 'abandon', reason: `#${m.number} has new commits` };
    if ((pr.labels ?? []).includes(NEEDS_COORDINATOR)) return { action: 'abandon', reason: `#${m.number} was handed to the coordinator` };
  }
  if (train.checks.state === 'red') return { action: 'fail', reason: `failing: ${train.checks.failing.join(', ')}` };
  if (train.checks.state === 'pending') {
    const age = now - Date.parse(train.createdAt);
    if (age > TRAIN_TIMEOUT_MS) return { action: 'abandon', reason: `still pending after ${Math.round(age / 3600000)} h` };
    return { action: 'wait', reason: `checks not finished: ${train.checks.missing.join(', ')}` };
  }
  if (!mainOk) return { action: 'abandon', reason: 'main moved since the train was built (not only by the regeneration bot)' };
  return { action: 'merge', reason: 'green on main + every member' };
}

/** After a red train: one member is to blame and is parked; several are retried one at a time. */
export const blameFailedTrain = (state, reason) => (state.members.length === 1
  ? { park: [{ number: state.members[0].number, reason: `its merge train failed (${reason})` }], solo: [] }
  : { park: [], solo: state.members.map((m) => m.number) });

// --- the whole run -----------------------------------------------------------------------------------------------

/**
 * The plan of one run, from a snapshot. `snapshot`:
 *   prs     labelled pull requests, each with the fields classifyPr reads plus headOid, headRef, labels
 *   trains  open train pull requests ({ number, branch, author, createdAt, body, checks })
 *   orphanBranches  ci/merge-train-* branches with no open train pull request
 *   main    main's tip; mainCommitsSince(base) -> commits for movedOnlyByBot
 *   missingLabels   names of LABELS not yet in the repository
 * Returns { actions, log } where each action is a plain object the executor understands.
 */
export function planRun(snapshot, config, now) {
  const actions = []; const log = [];
  if (snapshot.missingLabels?.length) actions.push({ type: 'ensure-labels', names: snapshot.missingLabels });
  for (const branch of snapshot.orphanBranches ?? []) actions.push({ type: 'delete-branch', branch, reason: 'train branch without an open train pull request' });

  const byNumber = new Map(snapshot.prs.map((p) => [p.number, p]));
  const [train, ...extra] = [...(snapshot.trains ?? [])].sort((a, b) => b.number - a.number);
  for (const t of extra) actions.push({ type: 'close-train', train: t, reason: 'more than one train was open', park: [], solo: [] });

  let inFlight = null;
  const soloNow = new Set(); const parkedNow = new Set(); // decided this run, before the labels exist
  if (train) {
    const state = parseTrainState(train.body);
    const mainOk = state ? (snapshot.main === state.base || movedOnlyByBot(snapshot.mainCommitsSince(state.base), config.botLogin)) : false;
    const verdict = evaluateTrain({ train: { ...train, state }, members: byNumber, mainOk, now, botLogin: config.botLogin });
    log.push(`train #${train.number}: ${verdict.action} (${verdict.reason})`);
    if (verdict.action === 'wait') inFlight = state;
    else if (verdict.action === 'merge') {
      actions.push({ type: 'merge-train', train, members: state.members, main: snapshot.main });
      inFlight = state;
    } else if (verdict.action === 'fail') {
      const blame = blameFailedTrain(state, verdict.reason);
      blame.solo.forEach((n) => soloNow.add(n));
      blame.park.forEach((p) => parkedNow.add(p.number));
      actions.push({ type: 'close-train', train, reason: verdict.reason, ...blame });
    } else {
      actions.push({ type: 'close-train', train, reason: verdict.reason, park: [], solo: [] });
    }
  }
  const members = new Set((inFlight?.members ?? []).map((m) => m.number));

  const candidates = [];
  for (const raw of snapshot.prs) {
    if (parkedNow.has(raw.number)) continue;
    const pr = soloNow.has(raw.number) ? { ...raw, labels: [...(raw.labels ?? []), SOLO] } : raw;
    const { action, reason } = classifyPr({ ...pr, inTrain: members.has(pr.number) }, config);
    log.push(`#${pr.number}: ${action} (${reason})`);
    if (action === 'candidate') candidates.push(pr);
    else if (action === 'park' || action === 'revoke') actions.push({ type: action, number: pr.number, reason });
    else if (action === 'sync') actions.push({ type: 'sync', number: pr.number, head: pr.headOid, branch: pr.headRef, reason });
    else if (action === 'approve') actions.push({ type: 'approve', number: pr.number, head: pr.headOid });
  }

  if (!inFlight && candidates.length) {
    if (candidates.length === 1 && candidates[0].upToDate === true) {
      // Its checks already ran on main + this pull request: a train would test the same tree again.
      const [c] = candidates;
      actions.push({ type: 'merge', number: c.number, head: c.headOid, main: snapshot.main, reason: 'the only candidate, green and up to date with main' });
    } else {
      const picked = pickTrain(candidates, config.maxTrain);
      actions.push({ type: 'build-train', main: snapshot.main, candidates: picked.map(({ number, headOid, headRef, isFork, labels }) => ({ number, head: headOid, headRef, isFork, solo: (labels ?? []).includes(SOLO) })) });
    }
  }
  return { actions, log };
}

// --- conflicts when main is merged into a pull request -----------------------------------------------------------

export const UNION_PATHS = Object.freeze(['site/styles.css', 'scripts/build.test.mjs']);
export const STAMP_PATHS = Object.freeze(['site/index.html']);

/** How a conflicted path is resolved when main is merged into a pull request branch:
 *   union   both sides kept (git's union driver; listed in .git/info/attributes)
 *   stamp   main's side, only where the two sides differ in nothing but ?v= cache stamps
 *   main    main's side: a generated output the regeneration bot rewrites after the merge anyway
 *   manual  a human resolves it (the pull request is parked) */
export function conflictStrategy(path) {
  if (UNION_PATHS.includes(path)) return 'union';
  if (STAMP_PATHS.includes(path)) return 'stamp';
  if (isGeneratedOutput(path) || /^site\/og\/[^/]+\.(png|svg)$/.test(path)) return 'main';
  return 'manual';
}

/** The .git/info/attributes the manager writes before merging: it overrides whatever a pull request's .gitattributes
 * says (no custom driver or filter from the branch), then turns on the union driver for UNION_PATHS. */
export const infoAttributes = () => ['* !merge !filter !diff', ...UNION_PATHS.map((p) => `/${p} merge=union`), ''].join('\n');

const STAMP = /\?v=[\w.-]+/g;

/** Resolve conflict markers in a file whose two sides may differ only in ?v= stamps: take main's side (the second side,
 * "theirs", when main is merged into the branch). Returns { ok, text } with ok false if any hunk differs otherwise. */
export function resolveStampConflicts(text) {
  const lines = text.split('\n');
  const out = []; let i = 0; let hunks = 0;
  while (i < lines.length) {
    if (!lines[i].startsWith('<<<<<<< ')) { out.push(lines[i]); i++; continue; }
    const ours = []; const theirs = []; let j = i + 1;
    while (j < lines.length && !lines[j].startsWith('=======') && !lines[j].startsWith('||||||| ')) ours.push(lines[j++]);
    if (j < lines.length && lines[j].startsWith('||||||| ')) while (j < lines.length && !lines[j].startsWith('=======')) j++;
    if (j >= lines.length) return { ok: false, text };
    j++;
    while (j < lines.length && !lines[j].startsWith('>>>>>>> ')) theirs.push(lines[j++]);
    if (j >= lines.length) return { ok: false, text };
    if (ours.join('\n').replace(STAMP, '?v=') !== theirs.join('\n').replace(STAMP, '?v=')) return { ok: false, text };
    out.push(...theirs); hunks++; i = j + 1;
  }
  return { ok: hunks > 0, text: out.join('\n') };
}

// --- messages ----------------------------------------------------------------------------------------------------

export const parkComment = (reason) => `The merge manager stopped on this pull request: ${reason}.\n\nIt added \`${NEEDS_COORDINATOR}\` and will not touch it again. Fix it, then remove \`${NEEDS_COORDINATOR}\` to put it back in the queue (docs/maintenance/merge-train.md).`;
export const revokeComment = (reason) => `The merge manager removed \`${LABEL}\`: ${reason}. A maintainer can add it again.`;

/** A branch name the manager is willing to pass to git (they come from GitHub, but are checked anyway). */
export const safeBranch = (name) => typeof name === 'string' && /^[A-Za-z0-9._/-]{1,200}$/.test(name) && !name.includes('..') && !name.startsWith('-');
