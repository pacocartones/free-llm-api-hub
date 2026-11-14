import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as sync from './sync-main.mjs';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeTmpDir } from './lib/tmp.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key)));
env.GIT_CONFIG_NOSYSTEM = '1';
env.GIT_CONFIG_GLOBAL = process.platform === 'win32' ? 'NUL' : '/dev/null';
const execute = (command, args, options) => spawnSync(command, args, { ...options, env, encoding: 'utf8' });
const write = (cwd, p, text) => { mkdirSync(dirname(join(cwd, p)), { recursive: true }); writeFileSync(join(cwd, p), text); };
const git = (cwd, ...args) => {
  const r = execute('git', ['--literal-pathspecs', ...args], { cwd });
  assert.equal(r.status, 0, `${args.join(' ')}: ${r.stderr}`);
  return r.stdout;
};
const status = cwd => git(cwd, 'status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignore-submodules=none');
const snapshot = cwd => ({
  head: git(cwd, 'rev-parse', 'HEAD'), branch: execute('git', ['symbolic-ref', '-q', 'HEAD'], { cwd }).stdout,
  index: git(cwd, 'ls-files', '--stage', '-z'), status: status(cwd),
  bytes: git(cwd, 'ls-files', '-z').split('\0').filter(Boolean).map(p => [p, existsSync(join(cwd, p)) ? readFileSync(join(cwd, p)).toString('base64') : null]),
});
function fixture(t, { conflict = 'derived-fingerprints.json', source = false, ordinary = '', extraBuild = '', deletion = '' } = {}) {
  const base = resolve(makeTmpDir('flah-sync-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const origin = join(base, 'origin.git'), seed = join(base, 'seed'), cwd = join(base, 'work');
  git(base, 'init', '--bare', '-q', '--initial-branch=main', origin);
  git(base, 'clone', '-q', origin, seed);
  const configure = dir => {
    git(dir, 'config', 'user.name', 'Fixture'); git(dir, 'config', 'user.email', 'fixture@example.invalid');
    git(dir, 'config', 'core.autocrlf', 'false'); git(dir, 'config', 'commit.gpgSign', 'false');
    git(dir, 'config', 'core.hooksPath', join(base, 'empty-hooks'));
  };
  configure(seed);
  const providers = (a, b) => JSON.stringify({ alpha: a, gap: Array.from({ length: 20 }, (_, i) => i), beta: b }, null, 2) + '\n';
  write(seed, 'data/providers.json', providers('base', 'base'));
  write(seed, '.gitignore', 'ignored/\n');
  write(seed, 'derived-fingerprints.json', 'base\n');
  write(seed, 'badge-freshness.json', 'base badge\n');
  write(seed, 'site/page/index.html', 'base page\n');
  write(seed, 'site/a/index.html', 'base sibling\n');
  write(seed, 'site/obsolete.html', 'obsolete\n');
  write(seed, conflict, 'base\n');
  if (conflict === 'data/providers.json') write(seed, conflict, providers('base', 'base'));
  write(seed, 'scripts/generated-targets.mjs', readFileSync(join(ROOT, 'scripts/generated-targets.mjs'), 'utf8'));
  write(seed, 'scripts/build.mjs', `import {readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
const data=JSON.parse(readFileSync('data/providers.json','utf8'));
const value=data.alpha+':'+data.beta+'\\n';
writeFileSync('derived-fingerprints.json',value); writeFileSync('site/page/index.html',value);
${extraBuild}\n`);
  git(seed, 'add', '--', '.'); git(seed, 'commit', '-qm', 'base'); git(seed, 'push', '-q', 'origin', 'main');
  git(base, 'clone', '-q', origin, cwd); configure(cwd); git(cwd, 'switch', '-qc', 'feature');
  if (ordinary !== 'noop' && ordinary !== 'ff') {
    write(cwd, 'data/providers.json', providers('feature', 'base'));
    if (!ordinary) {
      if (deletion === 'ours') git(cwd, 'rm', '--', conflict);
      else write(cwd, conflict, 'feature\n');
      if (source) write(cwd, source === true ? 'data/providers.json' : source, source === true ? providers('feature', 'base') : 'feature\n');
    }
    git(cwd, 'add', '--', '.'); git(cwd, 'commit', '-qm', 'feature');
  }
  if (ordinary !== 'noop') {
    write(seed, 'data/providers.json', providers(source === true ? 'main' : 'base', 'main'));
    if (!ordinary) {
      if (deletion === 'theirs') git(seed, 'rm', '--', conflict);
      else write(seed, conflict, 'main\n');
      if (source && source !== true) write(seed, source, 'main\n');
    }
    write(seed, 'site/a/index.html', 'incoming sibling\n');
    write(seed, 'badge-freshness.json', 'incoming badge\n');
    write(seed, 'docs/incoming.md', 'incoming source\n');
    git(seed, 'add', '--', '.'); git(seed, 'commit', '-qm', 'main'); git(seed, 'push', '-q', 'origin', 'main');
  }
  const initial = snapshot(cwd), target = git(seed, 'rev-parse', 'HEAD').trim(), remote = git(origin, 'show-ref');
  return { cwd, base, origin, seed, initial, target, remote };
}
function prove(f, expected) {
  git(f.cwd, 'fetch', '--no-tags', 'origin', 'refs/heads/main:refs/remotes/origin/main');
  const merged = execute('git', ['merge', '--no-commit', '--no-edit', '--ff', f.target], { cwd: f.cwd });
  assert.notEqual(merged.status, 0, 'fixture must actually conflict');
  const unmerged = sync.parseUnmerged(git(f.cwd, 'ls-files', '--unmerged', '-z'));
  assert.deepEqual([...unmerged.keys()].sort(), [...expected].sort());
  git(f.cwd, 'merge', '--abort');
  assert.deepEqual(snapshot(f.cwd), f.initial);
}
async function invoke(f, override) {
  const trace = [], messages = [];
  const run = async (command, args, options) => {
    trace.push({ command, args });
    return await override?.(command, args, options) ?? execute(command, args, options);
  };
  const code = await sync.syncMain({ cwd: f.cwd, run, log: m => messages.push(m), error: m => messages.push(m) });
  return { code, trace, messages: messages.join('\n') };
}
const has = (trace, command) => trace.some(c => c.args.includes(command));

test('fixture proves generated-only conflict before sync', t => {
  const f = fixture(t);
  prove(f, ['derived-fingerprints.json']);
});

for (const source of [true, 'site/og/manifest.json', 'site/styles.css']) {
  test(`source conflict abort restores original local state: ${source}`, async t => {
    const f = fixture(t, { source });
    const paths = ['derived-fingerprints.json', source === true ? 'data/providers.json' : source];
    prove(f, paths);
    const r = await invoke(f);
    assert.equal(r.code, 1);
    for (const p of paths) assert.ok(r.messages.includes(p));
    assert.ok(!has(r.trace, 'checkout') && !has(r.trace, 'scripts/build.mjs') && !has(r.trace, 'commit'));
    assert.deepEqual(snapshot(f.cwd), f.initial);
    assert.equal(git(f.origin, 'show-ref'), f.remote);
    assert.equal(execute('git', ['rev-parse', '-q', '--verify', 'MERGE_HEAD'], { cwd: f.cwd }).status, 1);
  });
}

for (const state of ['staged', 'unstaged', 'untracked', 'merge', 'rebase-merge', 'rebase-apply', 'sequencer', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'detached', 'shallow', 'sparse']) {
  test(`preflight refuses ${state} before fetch`, async t => {
    const f = fixture(t);
    if (state === 'staged' || state === 'unstaged') { write(f.cwd, 'README.md', 'work'); if (state === 'staged') git(f.cwd, 'add', '--', 'README.md'); }
    if (state === 'unstaged') write(f.cwd, 'site/page/index.html', 'work');
    if (state === 'untracked') write(f.cwd, 'new.txt', 'work');
    if (state === 'detached') git(f.cwd, 'checkout', '--detach');
    if (state === 'sparse') git(f.cwd, 'config', 'core.sparseCheckout', 'true');
    if (state === 'merge') { git(f.cwd, 'fetch', 'origin'); execute('git', ['merge', '--no-commit', f.target], { cwd: f.cwd }); }
    if (['rebase-merge', 'rebase-apply', 'sequencer'].includes(state)) mkdirSync(join(f.cwd, '.git', state));
    if (['CHERRY_PICK_HEAD', 'REVERT_HEAD'].includes(state)) write(f.cwd, `.git/${state}`, f.target);
    if (state === 'shallow') { const dir = join(f.base, 'shallow'); git(f.base, 'clone', '-q', '--depth=1', pathToFileURL(f.origin).href, dir); f.cwd = dir; }
    const before = snapshot(f.cwd);
    const r = await invoke(f);
    assert.equal(r.code, 1); assert.ok(!has(r.trace, 'fetch')); assert.deepEqual(snapshot(f.cwd), before);
  });
}

for (const ordinary of ['noop', 'ff', 'clean']) for (const setting of ['', 'only', 'false', 'squash', 'ours']) {
  test(`ordinary ${ordinary} merge ignores disruptive config ${setting}`, async t => {
    const f = fixture(t, { ordinary });
    if (['only', 'false'].includes(setting)) git(f.cwd, 'config', 'merge.ff', setting);
    if (setting === 'squash' || setting === 'ours') git(f.cwd, 'config', 'branch.feature.mergeOptions', setting === 'ours' ? '-s ours' : '--squash');
    const r = await invoke(f);
    assert.equal(r.code, 0, r.messages);
    assert.ok(!has(r.trace, 'scripts/build.mjs'));
    const head = git(f.cwd, 'rev-parse', 'HEAD').trim();
    if (ordinary === 'noop') assert.equal(head, f.initial.head.trim());
    if (ordinary === 'ff') assert.equal(head, f.target);
    if (ordinary === 'clean') assert.deepEqual(git(f.cwd, 'show', '-s', '--format=%P', 'HEAD').trim().split(' '), [f.initial.head.trim(), f.target]);
    assert.equal(status(f.cwd), '');
  });
}

test('missing origin and fetch failure preserve local state', async t => {
  const f = fixture(t); git(f.cwd, 'remote', 'remove', 'origin');
  const r = await invoke(f);
  assert.equal(r.code, 1); assert.match(r.messages, /fetch/); assert.deepEqual(snapshot(f.cwd), f.initial);
});

function assertSafeTrace(trace) {
  for (const { command, args } of trace) {
    if (command !== 'git') continue;
    assert.equal(args[0], '--literal-pathspecs');
    for (const banned of ['push', 'rebase', 'reset', '--amend', '--force', '-f', 'clean', 'stash']) assert.ok(!args.includes(banned), args.join(' '));
    if (args.includes('add')) { assert.ok(args.includes('--')); assert.ok(!args.slice(args.indexOf('--') + 1).some(p => p === '.' || p === 'site' || p === 'collections')); }
  }
}
function assertMerged(f) {
  assert.equal(status(f.cwd), '');
  assert.deepEqual(git(f.cwd, 'show', '-s', '--format=%P', 'HEAD').trim().split(' '), [f.initial.head.trim(), f.target]);
  const data = JSON.parse(readFileSync(join(f.cwd, 'data/providers.json'), 'utf8'));
  assert.equal(data.alpha, 'feature'); assert.equal(data.beta, 'main');
  assert.equal(readFileSync(join(f.cwd, 'derived-fingerprints.json'), 'utf8'), 'feature:main\n');
  assert.equal(readFileSync(join(f.cwd, 'site/page/index.html'), 'utf8'), 'feature:main\n');
  assert.equal(git(f.origin, 'show-ref'), f.remote);
  assert.equal(git(f.cwd, 'ls-files', '--unmerged', '-z'), '');
}

test('generated-only sync rebuilds combined data and keeps both parents', async t => {
  const f = fixture(t); prove(f, ['derived-fingerprints.json']);
  const r = await invoke(f);
  assert.equal(r.code, 0, r.messages); assertMerged(f); assertSafeTrace(r.trace);
  assert.equal(r.trace.filter(c => c.command === process.execPath).length, 1);
});

for (const conflict of ['collections/a b.md', 'site/café/index.html', 'site/[ab]/index.html']) {
  test(`literal generated conflict: ${conflict}`, async t => {
    const f = fixture(t, { conflict }); prove(f, [conflict]);
    const r = await invoke(f);
    assert.equal(r.code, 0, r.messages); assertMerged(f); assertSafeTrace(r.trace);
    assert.equal(readFileSync(join(f.cwd, conflict), 'utf8'), 'main\n');
    assert.equal(readFileSync(join(f.cwd, 'site/a/index.html'), 'utf8'), 'incoming sibling\n');
  });
}
for (const deletion of ['ours', 'theirs']) {
  test(`generated modify-delete conflict: ${deletion}`, async t => {
    const conflict = 'collections/deleted.md';
    const f = fixture(t, { conflict, deletion }); prove(f, [conflict]);
    const r = await invoke(f); assert.equal(r.code, 0, r.messages); assertMerged(f);
    assert.equal(existsSync(join(f.cwd, conflict)), deletion === 'ours');
  });
}
test('build stages exact new and deleted outputs and preserves merged freshness and source', async t => {
  const f = fixture(t, { extraBuild: `mkdirSync('site/new-page',{recursive:true}); writeFileSync('site/new-page/index.html','new'); rmSync('site/obsolete.html'); writeFileSync('badge-freshness.json','today');` });
  prove(f, ['derived-fingerprints.json']);
  const r = await invoke(f); assert.equal(r.code, 0, r.messages); assertMerged(f); assertSafeTrace(r.trace);
  assert.equal(git(f.cwd, 'show', 'HEAD:site/new-page/index.html'), 'new');
  assert.equal(existsSync(join(f.cwd, 'site/obsolete.html')), false);
  assert.equal(readFileSync(join(f.cwd, 'badge-freshness.json'), 'utf8'), 'incoming badge\n');
  assert.equal(git(f.cwd, 'show', 'HEAD:docs/incoming.md'), 'incoming source\n');
});
test('unexpected build source write fails before staging or commit', async t => {
  const f = fixture(t, { extraBuild: `writeFileSync('data/providers.json','unexpected');` });
  prove(f, ['derived-fingerprints.json']);
  const r = await invoke(f); assert.equal(r.code, 1); assert.match(r.messages, /data\/providers.json/);
  assert.ok(!has(r.trace, 'commit')); assert.equal(git(f.cwd, 'rev-parse', 'HEAD'), f.initial.head);
});

for (const mode of ['120000', '160000']) {
  test(`unsupported generated conflict mode ${mode} stops before checkout`, async t => {
    const f = fixture(t); prove(f, ['derived-fingerprints.json']);
    const r = await invoke(f, (command, args, options) => {
      if (args.includes('--unmerged')) { const actual = execute(command, args, options); return { ...actual, stdout: actual.stdout.replace(/100644/g, mode) }; }
    });
    assert.equal(r.code, 1); assert.match(r.messages, /mode/); assert.ok(!has(r.trace, 'checkout')); assert.ok(!has(r.trace, 'scripts/build.mjs'));
    assert.deepEqual(snapshot(f.cwd), f.initial);
  });
}

const failure = (text = 'injected failure') => ({ status: 128, signal: null, stdout: '', stderr: text });
for (const fault of ['missing Git', 'fetch', 'merge', 'checkout', 'build', 'stage', 'signal', 'abort']) {
  test(`command failure: ${fault}`, async t => {
    const f = fixture(t); prove(f, ['derived-fingerprints.json']);
    let injected = false;
    const r = await invoke(f, (command, args, options) => {
      if (fault === 'abort' && args.includes('--abort')) return failure('abort rejected');
      const matches = fault === 'missing Git' || (fault === 'fetch' && args.includes('fetch')) || (fault === 'merge' && args.includes('--no-commit')) ||
        (['checkout', 'abort'].includes(fault) && args.includes('checkout')) || (['build', 'signal'].includes(fault) && command === process.execPath) || (fault === 'stage' && args.includes('add') && args.includes('-A'));
      if (!injected && matches) {
        injected = true;
        if (fault === 'build') write(f.cwd, 'site/page/index.html', 'partial build');
        if (fault === 'missing Git') return { ...failure(), error: Object.assign(new Error('Git missing'), { code: 'ENOENT' }) };
        if (fault === 'signal') return { ...failure(), status: null, signal: 'SIGTERM' };
        return failure();
      }
    });
    assert.equal(r.code, 1); assert.ok(injected); assertSafeTrace(r.trace); assert.ok(!has(r.trace, 'commit'));
    assert.match(r.messages, new RegExp(`during ${fault === 'missing Git' ? 'preflight' : ['checkout', 'abort'].includes(fault) ? 'resolve' : fault === 'signal' ? 'build' : fault}`));
    if (fault === 'abort') { assert.match(r.messages, /injected failure/); assert.match(r.messages, /abort rejected/); assert.match(r.messages, /git merge --abort/); }
    else if (!['build', 'stage'].includes(fault)) assert.deepEqual(snapshot(f.cwd), f.initial);
    else { assert.equal(git(f.cwd, 'rev-parse', 'HEAD'), f.initial.head); assert.match(r.messages, /inspect|Inspect/); }
  });
}

for (const kind of ['identity', 'hook', 'landed']) {
  test(`commit failure ${kind} preserves inspectable state`, async t => {
    const f = fixture(t); prove(f, ['derived-fingerprints.json']);
    if (kind === 'hook') {
      write(f.base, 'hooks/pre-commit', '#!/bin/sh\necho hook-rejected >&2\nexit 1\n');
      if (process.platform !== 'win32') execute('chmod', ['+x', join(f.base, 'hooks/pre-commit')], { cwd: f.cwd });
      git(f.cwd, 'config', 'core.hooksPath', join(f.base, 'hooks'));
    }
    const r = await invoke(f, (command, args, options) => {
      if (kind === 'identity' && args.includes('commit')) { git(f.cwd, 'config', '--unset', 'user.email'); git(f.cwd, 'config', '--unset', 'user.name'); git(f.cwd, 'config', 'user.useConfigOnly', 'true'); }
      if (kind === 'landed' && args.includes('commit')) { const real = execute(command, args, options); assert.equal(real.status, 0); return failure('post-command error'); }
    });
    assert.equal(r.code, 1); assert.match(r.messages, /during commit/); assert.ok(!has(r.trace, '--abort'));
    if (kind === 'landed') { assertMerged(f); assert.match(r.messages, /HEAD changed/); }
    else { assert.equal(git(f.cwd, 'rev-parse', 'HEAD'), f.initial.head); assert.equal(git(f.cwd, 'rev-parse', 'MERGE_HEAD').trim(), f.target); assert.match(r.messages, /retry git commit/); }
  });
}

test('ownership mismatch refuses abort and commit', async t => {
  const f = fixture(t); prove(f, ['derived-fingerprints.json']);
  const r = await invoke(f, (command, args, options) => {
    if (args.includes('--no-commit')) { const real = execute(command, args, options); write(f.cwd, '.git/MERGE_HEAD', f.initial.head); return real; }
  });
  assert.equal(r.code, 1); assert.match(r.messages, /ownership/); assert.ok(!has(r.trace, '--abort')); assert.ok(!has(r.trace, 'commit')); assert.ok(!has(r.trace, 'checkout'));
});

test('failed build reports exact new outputs without deleting ignored files', async t => {
  const f = fixture(t); prove(f, ['derived-fingerprints.json']);
  write(f.cwd, 'ignored/keep.txt', 'keep');
  const r = await invoke(f, command => {
    if (command === process.execPath) { write(f.cwd, 'site/new-page/index.html', 'partial'); return failure('build stopped'); }
  });
  assert.equal(r.code, 1); assert.match(r.messages, /site\/new-page\/index.html/);
  assert.equal(readFileSync(join(f.cwd, 'ignored/keep.txt'), 'utf8'), 'keep');
  assert.equal(readFileSync(join(f.cwd, 'site/new-page/index.html'), 'utf8'), 'partial');
  assert.ok(!has(r.trace, 'commit'));
});

test('child interruption waits for close and cannot stage or commit', async t => {
  const f = fixture(t); prove(f, ['derived-fingerprints.json']);
  const before = process.listenerCount('SIGTERM');
  const trace = [], messages = [];
  const run = async (command, args, options) => {
    trace.push({ command, args });
    if (command === process.execPath) {
      setTimeout(() => process.emit('SIGTERM'), 100);
      const result = await sync.runCommand(command, ['-e', 'setTimeout(()=>{},500)'], options);
      assert.notEqual(result.status, 0);
      return result;
    }
    return execute(command, args, options);
  };
  const code = await sync.syncMain({ cwd: f.cwd, run, log: m => messages.push(m), error: m => messages.push(m) });
  assert.equal(code, 1); assert.match(messages.join('\n'), /SIGTERM/); assert.ok(!has(trace, 'commit'));
  const afterBuild = trace.slice(trace.findIndex(c => c.command === process.execPath) + 1);
  assert.ok(!has(afterBuild, 'add')); assert.deepEqual(snapshot(f.cwd), f.initial);
  assert.equal(process.listenerCount('SIGTERM'), before);
});

test('package exposes sync-main and retains build and Node contracts', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['sync-main'], 'node scripts/sync-main.mjs');
  assert.equal(pkg.scripts.build, 'node scripts/build.mjs'); assert.equal(pkg.engines.node, '>=18');
});
for (const source of [false, true]) {
  test(`actual CLI ${source ? 'aborts source conflict' : 'rebuilds generated conflict'}`, t => {
    const f = fixture(t, { source }); prove(f, source ? ['data/providers.json', 'derived-fingerprints.json'] : ['derived-fingerprints.json']);
    const result = execute(process.execPath, [join(ROOT, 'scripts/sync-main.mjs')], { cwd: f.cwd });
    assert.equal(result.status, source ? 1 : 0, result.stderr);
    if (source) { assert.match(result.stderr, /data\/providers.json/); assert.deepEqual(snapshot(f.cwd), f.initial); }
    else { assertMerged(f); assert.match(result.stdout, /OG files were not regenerated/); assert.match(result.stdout, /rebuilt generated-conflict/); }
  });
}
test('import has no side effects and unknown CLI arguments fail before fetch', t => {
  const f = fixture(t);
  const script = join(ROOT, 'scripts/sync-main.mjs');
  const imported = execute(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(pathToFileURL(script).href)})`], { cwd: f.cwd });
  assert.equal(imported.status, 0, imported.stderr); assert.deepEqual(snapshot(f.cwd), f.initial);
  assert.ok(!existsSync(join(f.cwd, '.git/FETCH_HEAD')));
  const args = execute(process.execPath, [script, '--remote=evil'], { cwd: f.cwd });
  assert.equal(args.status, 1); assert.match(args.stderr, /arguments/); assert.deepEqual(snapshot(f.cwd), f.initial);
  assert.ok(!existsSync(join(f.cwd, '.git/FETCH_HEAD')));
});

test('generated policy expands exact indexed files', () => {
  const allowed = ['README.md', 'derived-fingerprints.json', 'collections/a.md', 'site/new-page/index.html', 'site/café/index.html', 'site/[ab]/index.html'];
  const denied = ['data/providers.json', 'collections-extra/a.md', 'site/styles.css', 'site/site.js', 'site/og/manifest.json', 'site/og.svg', 'site/fonts/a.woff2', 'site/CNAME', 'badge-freshness.json'];
  const paths = sync.generatedPathSet([...allowed, ...denied]);
  for (const p of allowed) assert.ok(paths.has(p), p);
  for (const p of denied) assert.ok(!paths.has(p), p);
  assert.ok(!paths.has('collections'));
});

test('unmerged records preserve literal names and stages', () => {
  const paths = ['collections/a b.md', 'site/a\tb.html', 'site/café/index.html'];
  const oid = 'a'.repeat(40);
  const parsed = sync.parseUnmerged(paths.flatMap(p => [1, 2, 3].map(stage => `100644 ${oid} ${stage}\t${p}\0`)).join(''));
  assert.deepEqual([...parsed.keys()], paths);
  for (const stages of parsed.values()) assert.deepEqual([...stages.keys()], [1, 2, 3]);
  assert.throws(() => sync.parseUnmerged('bad metadata\tx\0'));
  assert.throws(() => sync.parseUnmerged(`100644 ${oid} 2\tx`));
});
