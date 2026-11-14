import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import * as sync from './sync-main.mjs';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
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

const preparedRoot = resolve(makeTmpDir('flah-sync-prepared-'));
const preparedFixtures = new Map();
let preparedFixtureBuilds = 0;
after(() => rmSync(preparedRoot, { recursive: true, force: true }));

function preparedFixture(options) {
  const key = JSON.stringify(options);
  if (preparedFixtures.has(key)) return preparedFixtures.get(key);
  preparedFixtureBuilds++;
  const base = join(preparedRoot, String(preparedFixtureBuilds));
  mkdirSync(base, { recursive: true });
  const { conflict, source, ordinary, extraBuild, deletion } = options;
  const origin = join(base, 'origin.git'), seed = join(base, 'seed'), cwd = join(base, 'work');
  git(base, 'init', '--bare', '-q', '--initial-branch=main', origin);
  git(base, 'clone', '-q', origin, seed);
  const configure = dir => {
    git(dir, 'config', 'user.name', 'Fixture'); git(dir, 'config', 'user.email', 'fixture@example.invalid');
    git(dir, 'config', 'core.autocrlf', 'false'); git(dir, 'config', 'commit.gpgSign', 'false');
    git(dir, 'config', 'core.hooksPath', '../empty-hooks');
    git(dir, 'remote', 'set-url', 'origin', '../origin.git');
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
  if (source && source !== true) write(seed, source, 'base\n');
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
  const prepared = { base, initial, target, remote };
  preparedFixtures.set(key, prepared);
  return prepared;
}

function fixture(t, { conflict = 'derived-fingerprints.json', source = false, ordinary = '', extraBuild = '', deletion = '' } = {}) {
  const options = { conflict, source, ordinary, extraBuild, deletion };
  const prepared = preparedFixture(options);
  const holder = resolve(makeTmpDir('flah-sync-'));
  const base = join(holder, 'fixture');
  cpSync(prepared.base, base, { recursive: true });
  t.after(() => rmSync(holder, { recursive: true, force: true }));
  const origin = join(base, 'origin.git'), seed = join(base, 'seed'), cwd = join(base, 'work');
  return { cwd, base, origin, seed, initial: structuredClone(prepared.initial), target: prepared.target, remote: prepared.remote };
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
const has = (trace, command) => trace.some(c => c.args.includes(command));

const OID = {
  initial: '1'.repeat(40), target: '2'.repeat(40), merged: '3'.repeat(40), tree: '4'.repeat(40), resolved: '5'.repeat(40),
};
const ok = (stdout = '') => ({ status: 0, signal: null, stdout, stderr: '' });
function unmergedRecords(paths, mode = '100644', stages = [1, 2, 3]) {
  return paths.flatMap(path => stages.map(stage => `${mode} ${String(stage).repeat(40)} ${stage}\t${path}\0`)).join('');
}
async function simulate(t, {
  conflicts = ['derived-fingerprints.json'], mode = '100644', stages = [1, 2, 3], ordinary = '', statusText = '', shallow = false,
  sparse = false, detached = false, marker = '', fault = '', modified = ['derived-fingerprints.json', 'site/page/index.html'],
  untracked = [], commit = 'ok', buildWrite,
} = {}) {
  const cwd = resolve(makeTmpDir('flah-sync-sim-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  mkdirSync(join(cwd, '.git'), { recursive: true });
  if (marker) mkdirSync(join(cwd, '.git', marker), { recursive: true });
  let head = OID.initial, active = false, resolved = false, injected = false;
  const trace = [], messages = [];
  const fail = text => ({ status: 128, signal: null, stdout: '', stderr: text });
  const run = async (commandName, rawArgs, options) => {
    trace.push({ command: commandName, args: rawArgs });
    const args = commandName === 'git' ? rawArgs.slice(1) : rawArgs;
    const includes = value => args.includes(value);
    if (fault === 'abort' && includes('--abort')) return fail('abort rejected');
    const matchesFault = fault === 'missing Git' || (fault === 'fetch' && includes('fetch')) ||
      (fault === 'merge' && includes('--no-commit')) || (fault === 'checkout' && includes('checkout')) ||
      (fault === 'build' && commandName === process.execPath) || (fault === 'stage' && includes('add') && includes('-A')) ||
      (fault === 'signal' && commandName === process.execPath) || (fault === 'abort' && includes('checkout'));
    if (!injected && matchesFault) {
      injected = true;
      if (buildWrite) buildWrite(cwd);
      if (fault === 'missing Git') return { ...fail('Git missing'), error: Object.assign(new Error('Git missing'), { code: 'ENOENT' }) };
      if (fault === 'signal') return { ...fail('terminated'), status: null, signal: 'SIGTERM' };
      return fail('injected failure');
    }
    if (commandName === process.execPath) { buildWrite?.(cwd); return ok(); }
    if (args[0] === 'rev-parse' && includes('--is-inside-work-tree')) return ok('true\n');
    if (args[0] === 'rev-parse' && includes('--show-toplevel')) return ok(`${cwd}\n`);
    if (args[0] === 'rev-parse' && includes('--is-shallow-repository')) return ok(`${shallow}\n`);
    if (args[0] === 'rev-parse' && includes('--git-path')) return ok(`.git/${args.at(-1)}\n`);
    if (args[0] === 'rev-parse' && includes('HEAD')) return ok(`${head}\n`);
    if (args[0] === 'rev-parse' && includes('refs/remotes/origin/main^{commit}')) return ok(`${OID.target}\n`);
    if (args[0] === 'rev-parse' && includes('MERGE_HEAD')) return active ? ok(`${marker === 'ownership' ? OID.initial : OID.target}\n`) : fail('missing');
    if (args[0] === 'symbolic-ref') return detached ? fail('detached') : ok('feature\n');
    if (args[0] === 'config' && includes('core.sparseCheckout')) return sparse ? ok('true\n') : { ...ok(), status: 1 };
    if (args[0] === 'status') return ok(statusText);
    if (args[0] === 'write-tree') return ok(`${resolved ? OID.resolved : OID.tree}\n`);
    if (args[0] === 'fetch') return ok();
    if (includes('merge') && includes('--no-commit')) {
      if (ordinary === 'noop') return ok();
      if (ordinary === 'ff') { head = OID.target; return ok(); }
      active = true;
      return ordinary === 'clean' ? ok() : fail('conflict');
    }
    if (args[0] === 'ls-files' && includes('--unmerged')) return ok(active && !resolved && conflicts.length ? unmergedRecords(conflicts, mode, stages) : '');
    if (args[0] === 'ls-files' && includes('-z') && !includes('--others')) return ok(['derived-fingerprints.json', 'badge-freshness.json', 'data/providers.json', 'site/page/index.html', ...conflicts].join('\0') + '\0');
    if (['checkout', 'rm'].includes(args[0])) { resolved = true; return ok(); }
    if (args[0] === 'add') { if (!includes('-A')) resolved = true; return ok(); }
    if (args[0] === 'ls-tree') return ok('derived-fingerprints.json\0badge-freshness.json\0data/providers.json\0site/page/index.html\0');
    if (args[0] === 'restore') return ok();
    if (args[0] === 'diff' && includes('--cached')) return ok(modified.join('\0') + (modified.length ? '\0' : ''));
    if (args[0] === 'diff') return ok(modified.join('\0') + (modified.length ? '\0' : ''));
    if (args[0] === 'ls-files' && includes('--others')) return ok(untracked.join('\0') + (untracked.length ? '\0' : ''));
    if (args[0] === 'commit') {
      if (commit === 'identity' || commit === 'hook') return fail(`${commit} rejected`);
      head = OID.merged; active = false;
      return commit === 'landed' ? fail('post-command error') : ok();
    }
    if (args[0] === 'merge' && includes('--abort')) { active = false; resolved = false; return ok(); }
    return ok();
  };
  const code = await sync.syncMain({ cwd, run, log: value => messages.push(value), error: value => messages.push(value) });
  return { code, trace, messages: messages.join('\n'), cwd, injected, head, active };
}

test('fixture proves generated-only conflict before sync', t => {
  const f = fixture(t);
  prove(f, ['derived-fingerprints.json']);
});

test('identical fixture shapes reuse prepared history without sharing worktrees', t => {
  const before = preparedFixtureBuilds;
  const first = fixture(t, { ordinary: 'noop' });
  const second = fixture(t, { ordinary: 'noop' });
  assert.equal(preparedFixtureBuilds, before + 1);
  write(first.cwd, 'new.txt', 'first only');
  assert.equal(status(second.cwd), '');
  assert.ok(!existsSync(join(second.cwd, 'new.txt')));
});

test('source and OG conflicts abort before resolution, build or commit', async t => {
  for (const source of ['data/providers.json', 'site/og/manifest.json', 'site/styles.css']) {
    const paths = ['derived-fingerprints.json', source];
    const r = await simulate(t, { conflicts: paths });
    assert.equal(r.code, 1, source);
    assertSafeTrace(r.trace);
    for (const path of paths) assert.ok(r.messages.includes(path));
    assert.ok(!has(r.trace, 'checkout') && !has(r.trace, 'scripts/build.mjs') && !has(r.trace, 'commit'));
    assert.ok(has(r.trace, '--abort'));
  }
});

test('every dirty, operation, detached, shallow and sparse preflight stops before fetch', async t => {
  const states = ['staged', 'unstaged', 'untracked', 'MERGE_HEAD', 'rebase-merge', 'rebase-apply', 'sequencer', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'detached', 'shallow', 'sparse'];
  for (const state of states) {
    const r = await simulate(t, {
      statusText: ['staged', 'unstaged', 'untracked'].includes(state) ? ` ${state}\0` : '',
      marker: ['MERGE_HEAD', 'rebase-merge', 'rebase-apply', 'sequencer', 'CHERRY_PICK_HEAD', 'REVERT_HEAD'].includes(state) ? state : '',
      detached: state === 'detached', shallow: state === 'shallow', sparse: state === 'sparse',
    });
    assert.equal(r.code, 1, state);
    assert.ok(!has(r.trace, 'fetch'), state);
  }
});

test('ordinary merge modes use explicit safe options regardless of disruptive config', async t => {
  for (const ordinary of ['noop', 'ff', 'clean']) {
    const r = await simulate(t, { ordinary, conflicts: [] });
    assert.equal(r.code, 0, `${ordinary}: ${r.messages}`);
    assert.ok(!has(r.trace, 'scripts/build.mjs'));
    const merge = r.trace.find(entry => entry.args.includes('--no-commit'));
    for (const option of ['merge.autoStash=false', 'rerere.enabled=false', 'branch.feature.mergeOptions=', '--no-squash', '--no-autostash']) {
      assert.ok(merge.args.includes(option), `${ordinary}: ${option}`);
    }
  }
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

test('literal generated paths remain exact and modify-delete selects the present side', async t => {
  for (const conflict of ['collections/a b.md', 'site/café/index.html', 'site/[ab]/index.html']) {
    const r = await simulate(t, { conflicts: [conflict] });
    assert.equal(r.code, 0, `${conflict}: ${r.messages}`); assertSafeTrace(r.trace);
    const checkout = r.trace.find(entry => entry.args.includes('checkout'));
    assert.deepEqual(checkout.args.slice(-2), ['--', conflict]);
  }
  for (const [deletion, stages, command] of [['ours', [1, 3], 'checkout'], ['theirs', [1, 2], 'rm']]) {
    const r = await simulate(t, { conflicts: ['collections/deleted.md'], stages });
    assert.equal(r.code, 0, `${deletion}: ${r.messages}`);
    assert.ok(has(r.trace, command), deletion);
  }
});

test('build stages only exact generated outputs and restores the freshness badge', async t => {
  const modified = ['derived-fingerprints.json', 'site/page/index.html', 'site/new-page/index.html'];
  const r = await simulate(t, { modified, untracked: ['site/new-page/index.html'] });
  assert.equal(r.code, 0, r.messages); assertSafeTrace(r.trace);
  assert.ok(r.trace.some(entry => entry.args.includes('restore') && entry.args.includes('badge-freshness.json')));
  const staged = r.trace.filter(entry => entry.args.includes('-A')).flatMap(entry => entry.args.slice(entry.args.indexOf('--') + 1));
  assert.deepEqual([...new Set(staged)].sort(), modified.sort());
});

test('unexpected source build write fails before commit', async t => {
  const r = await simulate(t, { modified: ['data/providers.json'] });
  assert.equal(r.code, 1); assert.match(r.messages, /data\/providers.json/); assert.ok(!has(r.trace, 'commit'));
});

test('unsupported conflict modes stop before checkout and build', async t => {
  for (const mode of ['120000', '160000']) {
    const r = await simulate(t, { mode });
    assert.equal(r.code, 1); assert.match(r.messages, /mode/); assert.ok(!has(r.trace, 'checkout')); assert.ok(!has(r.trace, 'scripts/build.mjs'));
  }
});

test('command failures stop safely in every phase and abort only an owned merge', async t => {
  for (const fault of ['missing Git', 'fetch', 'merge', 'checkout', 'build', 'stage', 'signal', 'abort']) {
    const r = await simulate(t, { fault });
    assert.equal(r.code, 1, fault); assert.ok(r.injected, fault); assertSafeTrace(r.trace); assert.ok(!has(r.trace, 'commit'), fault);
    assert.match(r.messages, new RegExp(`during ${fault === 'missing Git' ? 'preflight' : ['checkout', 'abort'].includes(fault) ? 'resolve' : fault === 'signal' ? 'build' : fault}`));
    if (fault === 'abort') { assert.match(r.messages, /injected failure/); assert.match(r.messages, /abort rejected/); assert.match(r.messages, /git merge --abort/); }
  }
});

test('commit failures retain inspectable state and never abort a possibly landed commit', async t => {
  for (const kind of ['identity', 'hook', 'landed']) {
    const r = await simulate(t, { ordinary: 'clean', conflicts: [], commit: kind });
    assert.equal(r.code, 1); assert.match(r.messages, /during commit/); assert.ok(!has(r.trace, '--abort'));
    if (kind === 'landed') assert.match(r.messages, /HEAD changed/);
    else assert.match(r.messages, /retry git commit/);
  }
});

test('ownership mismatch refuses abort, resolution and commit', async t => {
  const r = await simulate(t, { marker: 'ownership' });
  assert.equal(r.code, 1); assert.match(r.messages, /ownership/); assert.ok(!has(r.trace, '--abort')); assert.ok(!has(r.trace, 'commit')); assert.ok(!has(r.trace, 'checkout'));
});

test('failed build reports exact new outputs without deleting ignored files', async t => {
  const r = await simulate(t, {
    fault: 'build', modified: ['site/new-page/index.html'],
    buildWrite: cwd => { write(cwd, 'ignored/keep.txt', 'keep'); write(cwd, 'site/new-page/index.html', 'partial'); },
  });
  assert.equal(r.code, 1); assert.match(r.messages, /site\/new-page\/index.html/);
  assert.equal(readFileSync(join(r.cwd, 'ignored/keep.txt'), 'utf8'), 'keep');
  assert.equal(readFileSync(join(r.cwd, 'site/new-page/index.html'), 'utf8'), 'partial');
  assert.ok(!has(r.trace, 'commit'));
});

test('child cancellation waits for close; coordinator cannot stage or commit afterwards', async t => {
  const controller = new AbortController();
  setTimeout(() => controller.abort('SIGTERM'), 50);
  const child = await sync.runCommand(process.execPath, ['-e', 'setTimeout(()=>{},500)'], { cwd: ROOT, signal: controller.signal });
  assert.notEqual(child.status, 0); assert.equal(child.signal, 'SIGTERM');
  const before = process.listenerCount('SIGTERM');
  const r = await simulate(t, { fault: 'signal' });
  assert.equal(r.code, 1); assert.match(r.messages, /SIGTERM/); assert.ok(!has(r.trace, 'commit'));
  const afterBuild = r.trace.slice(r.trace.findIndex(entry => entry.command === process.execPath) + 1);
  assert.ok(!has(afterBuild, 'add')); assert.equal(process.listenerCount('SIGTERM'), before);
});

test('package exposes sync-main and retains build and Node contracts', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['sync-main'], 'node scripts/sync-main.mjs');
  assert.equal(pkg.scripts.build, 'node scripts/build.mjs'); assert.equal(pkg.engines.node, '>=18');
});
for (const source of [false, true]) {
  test(`actual CLI ${source ? 'aborts source conflict' : 'rebuilds generated conflict'}`, t => {
    const f = fixture(t, { source });
    if (source) prove(f, ['data/providers.json', 'derived-fingerprints.json']);
    const result = execute(process.execPath, [join(ROOT, 'scripts/sync-main.mjs')], { cwd: f.cwd });
    assert.equal(result.status, source ? 1 : 0, result.stderr);
    if (source) { assert.match(result.stderr, /data\/providers.json/); assert.deepEqual(snapshot(f.cwd), f.initial); }
    else { assertMerged(f); assert.match(result.stdout, /OG files were not regenerated/); assert.match(result.stdout, /rebuilt generated-conflict/); }
  });
}
test('import has no side effects and unknown CLI arguments fail before fetch', t => {
  const cwd = resolve(makeTmpDir('flah-sync-cli-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const script = join(ROOT, 'scripts/sync-main.mjs');
  const imported = execute(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(pathToFileURL(script).href)})`], { cwd });
  assert.equal(imported.status, 0, imported.stderr); assert.ok(!existsSync(join(cwd, '.git')));
  const args = execute(process.execPath, [script, '--remote=evil'], { cwd });
  assert.equal(args.status, 1); assert.match(args.stderr, /arguments/); assert.ok(!existsSync(join(cwd, '.git')));
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
