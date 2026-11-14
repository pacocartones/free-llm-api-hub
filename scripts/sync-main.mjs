#!/usr/bin/env node
// The imported policy is intentionally frozen before any merge changes repository code.
import { generatedTargets, STATIC_TARGETS, isGenerated, parseNul } from './generated-targets.mjs';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function runCommand(command, args, { cwd, signal }) {
  return new Promise(resolveResult => {
    const child = spawn(command, args, { cwd, shell: false, windowsHide: true });
    let stdout = '', stderr = '', error;
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', err => { error = err; });
    const stop = () => child.kill(signal.reason);
    signal?.addEventListener('abort', stop, { once: true });
    if (signal?.aborted) stop();
    child.on('close', (status, childSignal) => {
      signal?.removeEventListener('abort', stop);
      resolveResult({ status, signal: childSignal, stdout, stderr, error });
    });
  });
}

export function generatedPathSet(indexPaths) {
  return new Set(generatedTargets(indexPaths.filter(p => p.startsWith('site/')))
    .flatMap(p => p === 'collections' && STATIC_TARGETS.includes(p)
      ? indexPaths.filter(name => name.startsWith(`${p}/`)) : [p]));
}

export function parseUnmerged(output) {
  if (output && !output.endsWith('\0')) throw new Error('Unterminated unmerged record');
  const result = new Map();
  for (const record of parseNul(output)) {
    const tab = record.indexOf('\t');
    const metadata = /^(\d{6}) ([0-9a-f]{40}|[0-9a-f]{64}) ([123])$/.exec(record.slice(0, tab));
    if (tab < 0 || !metadata || !record.slice(tab + 1)) throw new Error('Malformed unmerged record');
    const path = record.slice(tab + 1);
    if (!result.has(path)) result.set(path, new Map());
    const stage = Number(metadata[3]);
    if (result.get(path).has(stage)) throw new Error('Duplicate unmerged stage');
    result.get(path).set(stage, { mode: metadata[1], oid: metadata[2] });
  }
  return result;
}

const OG = 'OG files were not regenerated. Run node scripts/check-og.mjs; if it reports drift, run npm run og and commit the resulting OG files yourself.';
const STATUS = ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignore-submodules=none'];

export async function syncMain({ cwd = process.cwd(), run = runCommand, log = console.log, error = console.error } = {}) {
  cwd = resolve(cwd);
  let phase = 'preflight', initial, target, started = false, committing = false, rebuilt = false;
  let cleaning = false;
  const controller = new AbortController();
  const onInt = () => controller.abort('SIGINT'), onTerm = () => controller.abort('SIGTERM');
  process.on('SIGINT', onInt); process.on('SIGTERM', onTerm);
  const interrupted = () => { if (!cleaning && controller.signal.aborted) throw new Error(`Interrupted by ${controller.signal.reason}`); };
  const command = async (executable, args) => {
    interrupted();
    const result = await run(executable, args, { cwd, signal: cleaning ? undefined : controller.signal });
    interrupted();
    return result;
  };
  const git = args => command('git', ['--literal-pathspecs', ...args]);
  const checked = async args => {
    const result = await git(args);
    if (result.error || result.status !== 0) {
      throw new Error(`${args[0]}: ${result.error?.message || result.signal || result.stderr || `exit ${result.status}`}`);
    }
    return result.stdout;
  };
  const head = async () => (await checked(['rev-parse', '--verify', 'HEAD'])).trim();
  const branch = async () => (await checked(['symbolic-ref', '--quiet', '--short', 'HEAD'])).trim();
  const marker = async () => {
    const r = await git(['rev-parse', '--quiet', '--verify', 'MERGE_HEAD']);
    return r.status === 0 ? r.stdout.trim() : '';
  };
  const owned = async () => started && await head() === initial.head && await branch() === initial.branch && await marker() === target;
  const success = message => { log(message); log(OG); return 0; };
  try {
    if ((await checked(['rev-parse', '--is-inside-work-tree'])).trim() !== 'true') throw new Error('Not a Git worktree');
    cwd = resolve((await checked(['rev-parse', '--show-toplevel'])).trim());
    const initialHead = await head(), initialBranch = await branch();
    if ((await checked(['rev-parse', '--is-shallow-repository'])).trim() !== 'false') throw new Error('Shallow history is not supported');
    const sparse = await git(['config', '--bool', 'core.sparseCheckout']);
    if (sparse.status === 0 && sparse.stdout.trim() === 'true') throw new Error('Sparse checkout is not supported');
    if (sparse.status !== 0 && sparse.status !== 1) throw new Error('Cannot inspect sparse checkout configuration');
    for (const name of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply', 'sequencer']) {
      const path = (await checked(['rev-parse', '--git-path', name])).trim();
      if (existsSync(resolve(cwd, path))) throw new Error(`Existing Git operation: ${name}`);
    }
    const initialStatus = await checked(STATUS);
    if (initialStatus) throw new Error('Commit all staged, unstaged and untracked work before syncing');
    initial = { head: initialHead, branch: initialBranch, status: initialStatus, tree: (await checked(['write-tree'])).trim() };
    phase = 'fetch';
    await checked(['fetch', '--no-tags', 'origin', 'refs/heads/main:refs/remotes/origin/main']);
    target = (await checked(['rev-parse', '--verify', 'refs/remotes/origin/main^{commit}'])).trim();
    phase = 'merge';
    // Override local options that can conceal conflicts or turn a merge into a squash.
    started = true;
    const merged = await git(['-c', 'merge.autoStash=false', '-c', 'rerere.enabled=false', '-c', `branch.${initial.branch}.mergeOptions=`,
      'merge', '--no-commit', '--no-edit', '--ff', '--no-squash', '--no-autostash', target]);
    const conflicts = parseUnmerged(await checked(['ls-files', '--unmerged', '-z']));
    const active = await marker();
    if (merged.error || merged.signal || merged.status === null || (merged.status !== 0 && !conflicts.size)) {
      throw new Error(`Merge failed: ${merged.error?.message || merged.signal || merged.stderr || merged.status}`);
    }
    if (conflicts.size) {
      const allowed = generatedPathSet(parseNul(await checked(['ls-files', '-z'])));
      if ([...conflicts.keys()].some(path => !allowed.has(path))) {
        throw new Error(`Conflicts require manual resolution: ${[...conflicts.keys()].map(p => JSON.stringify(p)).join(', ')}`);
      }
      for (const [path, stages] of conflicts) {
        if ([...stages.values()].some(entry => !['100644', '100755'].includes(entry.mode))) {
          throw new Error(`Unsupported conflict mode: ${JSON.stringify(path)}`);
        }
      }
      if (!await owned()) throw new Error('Merge ownership changed; inspect git status');
      phase = 'resolve';
      for (const [path, stages] of conflicts) {
        if (stages.has(3)) {
          await checked(['checkout', '--theirs', '--', path]);
          await checked(['add', '--', path]);
        } else await checked(['rm', '--', path]);
      }
      if ((await checked(['ls-files', '--unmerged', '-z']))) throw new Error('Unresolved index entries remain');
      const beforeBuild = (await checked(['write-tree'])).trim();
      phase = 'build';
      const built = await command(process.execPath, ['scripts/build.mjs']);
      if (built.error || built.status !== 0) throw new Error(`Build failed: ${built.error?.message || built.signal || built.stderr || built.status}`);
      const beforePaths = parseNul(await checked(['ls-tree', '-r', '--name-only', '-z', beforeBuild]));
      if (beforePaths.includes('badge-freshness.json')) {
        await checked(['restore', `--source=${beforeBuild}`, '--worktree', '--', 'badge-freshness.json']);
      }
      const modified = parseNul(await checked(['diff', '--name-only', '--no-renames', '-z']));
      const untracked = parseNul(await checked(['ls-files', '--others', '--exclude-standard', '-z']));
      const candidates = [...new Set([...modified, ...untracked])];
      // The imported functions retain the pre-merge policy even if main changed the module.
      const stageAllowed = generatedPathSet([...beforePaths, ...candidates.filter(p => isGenerated(p) || p.startsWith('collections/'))]);
      const unexpected = candidates.filter(path => !stageAllowed.has(path));
      if (unexpected.length) throw new Error(`Unexpected build writes: ${unexpected.map(p => JSON.stringify(p)).join(', ')}`);
      phase = 'stage';
      for (let i = 0; i < candidates.length; i += 50) await checked(['add', '-A', '--', ...candidates.slice(i, i + 50)]);
      const extra = parseNul(await checked(['diff', '--cached', '--name-only', '--no-renames', '-z', beforeBuild]));
      if (extra.some(path => !stageAllowed.has(path))) throw new Error(`Unexpected staged build writes: ${extra.map(p => JSON.stringify(p)).join(', ')}`);
      if (await checked(['ls-files', '--unmerged', '-z'])) throw new Error('Unresolved index entries remain');
      rebuilt = true;
    }
    if (!active) return success(await head() === initial.head ? 'Already up to date.' : 'Fast-forwarded to origin/main.');
    if (!await owned()) throw new Error('Merge ownership changed; inspect git status');
    phase = 'commit'; committing = true;
    await checked(['commit', '-m', `Merge origin/main into ${initial.branch}`]);
    if (await head() === initial.head || await marker()) throw new Error('Commit did not finish');
    return success(rebuilt ? 'Committed rebuilt generated-conflict merge of origin/main.' : 'Committed clean merge of origin/main.');
  } catch (err) {
    // All subprocesses have closed before recovery starts. Ignore the cancellation
    // for read-only ownership checks and the single bounded abort attempt.
    cleaning = true;
    error(`sync-main failed during ${phase}: ${err.message}`);
    try {
      if (committing) {
        if (await head() !== initial.head) error('HEAD changed during commit; inspect git log and git status. No rollback was attempted.');
        else if (await owned()) error('Inspect git status; fix identity or hook errors and retry git commit. The resolved merge is retained.');
        else error('Merge ownership changed; inspect git status before any recovery.');
        return 1;
      }
      if (await owned()) {
        await checked(['merge', '--abort']);
        if (await head() !== initial.head || await branch() !== initial.branch || (await checked(['write-tree'])).trim() !== initial.tree || await checked(STATUS) !== initial.status) {
          throw new Error('Local state differs after abort; inspect git status');
        }
        error('Merge aborted; original HEAD, index and status restored.');
      } else if (started) {
        error('No owned merge to abort; inspect git status. No history was rewritten.');
      }
    } catch (cleanup) { error(`Cleanup failed: ${cleanup.message}. Inspect git status; if a merge remains, run git merge --abort.`); }
    if (started) {
      try {
        const remaining = new Set([...parseNul(await checked(['diff', '--name-only', '--no-renames', '-z'])),
          ...parseNul(await checked(['ls-files', '--others', '--exclude-standard', '-z']))]);
        if (remaining.size) error(`Files retained for inspection: ${[...remaining].map(p => JSON.stringify(p)).join(', ')}`);
      } catch (inspection) { error(`Could not inspect retained files: ${inspection.message}`); }
    }
    return 1;
  } finally {
    process.removeListener('SIGINT', onInt); process.removeListener('SIGTERM', onTerm);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) {
    console.error('sync-main takes no arguments; it merges the configured origin/main.');
    process.exitCode = 1;
  } else process.exitCode = await syncMain();
}
