// The test runner's guards for contributor machines (Windows, WSL, a personal git config): see lib/test-tools.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeTmpDir } from './lib/tmp.mjs';
import { GIT_TEST_CONFIG, crlfFiles, shellSkip, testGitEnv } from './lib/test-tools.mjs';

// The environment without any GIT_CONFIG_* entry, as a contributor's shell has it (the runner adds its own).
function plainEnv() {
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_CONFIG_')));
}

function fixtureRepo(attributes) {
  const dir = makeTmpDir('test-tools-');
  const git = (...args) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd: dir, env: testGitEnv(plainEnv()), encoding: 'utf8' });
  git('init', '-q');
  if (attributes) writeFileSync(join(dir, '.gitattributes'), attributes);
  return { dir, git };
}

test('testGitEnv turns signing off for every git the tests start, after the entries already set', () => {
  const env = testGitEnv({ PATH: 'x', GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.pager', GIT_CONFIG_VALUE_0: 'cat' });
  assert.equal(env.PATH, 'x');
  assert.equal(env.GIT_CONFIG_KEY_0, 'core.pager', 'an entry of the caller is kept');
  const keys = Object.keys(GIT_TEST_CONFIG);
  assert.equal(env.GIT_CONFIG_COUNT, String(1 + keys.length));
  keys.forEach((key, i) => {
    assert.equal(env[`GIT_CONFIG_KEY_${i + 1}`], key);
    assert.equal(env[`GIT_CONFIG_VALUE_${i + 1}`], 'false');
  });
  assert.equal(testGitEnv({}).GIT_CONFIG_COUNT, String(keys.length));
  assert.equal(testGitEnv({ GIT_CONFIG_COUNT: 'junk' }).GIT_CONFIG_KEY_0, keys[0], 'a malformed count starts at 0');
});

test('a contributor config that signs every commit and tag no longer breaks a test commit', () => {
  const dir = makeTmpDir('test-tools-sign-');
  const run = (env, ...args) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd: dir, env, encoding: 'utf8' });
  run(plainEnv(), 'init', '-q');
  // Signing with a program that always fails stands for a key behind a passphrase or a gpg that is not installed.
  for (const [key, value] of [['commit.gpgsign', 'true'], ['tag.gpgsign', 'true'], ['gpg.format', 'openpgp'], ['gpg.program', 'false']]) run(plainEnv(), 'config', key, value);
  assert.notEqual(run(plainEnv(), 'commit', '-q', '--allow-empty', '-m', 'signed').status, 0, 'without the override the commit fails');
  const env = testGitEnv(plainEnv());
  const commit = run(env, 'commit', '-q', '--allow-empty', '-m', 'unsigned');
  assert.equal(commit.status, 0, commit.stderr);
  const tag = run(env, 'tag', '-a', 'v1', '-m', 'v1');
  assert.equal(tag.status, 0, tag.stderr);
});

test('crlfFiles names tracked text files with CRLF on disk, and nothing in an LF tree', () => {
  const { dir, git } = fixtureRepo('* text=auto eol=lf\n*.png binary\n');
  writeFileSync(join(dir, 'a.txt'), 'one\ntwo\n');
  writeFileSync(join(dir, 'b.md'), 'b\n');
  writeFileSync(join(dir, 'img.png'), Buffer.from([0x89, 0x50, 0x0d, 0x0a, 0x00]));
  git('add', '-A'); git('commit', '-q', '-m', 'base');
  assert.deepEqual(crlfFiles(dir), []);
  writeFileSync(join(dir, 'a.txt'), 'one\r\ntwo\r\n');
  writeFileSync(join(dir, 'untracked.txt'), 'x\r\n');
  assert.deepEqual(crlfFiles(dir), ['a.txt'], 'untracked and binary files are not named');
  assert.deepEqual(crlfFiles(makeTmpDir('test-tools-nogit-')), [], 'outside a repository there is nothing to report');
});

test('the repository itself is checked out with LF', () => {
  assert.deepEqual(crlfFiles(join(import.meta.dirname, '..')), []);
});

test('shellSkip: Windows skips, a missing tool skips with the install hint, CI never skips for a missing tool', () => {
  const saved = process.env.CI;
  try {
    delete process.env.CI;
    const reason = shellSkip('workflow shell', ['no-such-tool-for-free-llm-api-hub']);
    if (process.platform === 'win32') {
      assert.equal(reason, 'workflow shell, checked on Linux');
      return;
    }
    assert.match(reason, /needs no-such-tool-for-free-llm-api-hub on PATH/);
    assert.match(reason, /sudo apt install no-such-tool-for-free-llm-api-hub/);
    assert.equal(shellSkip('bash script'), false, 'bash is there, nothing is skipped');
    process.env.CI = 'true';
    assert.equal(shellSkip('workflow shell', ['no-such-tool-for-free-llm-api-hub']), false);
  } finally {
    if (saved === undefined) delete process.env.CI; else process.env.CI = saved;
  }
});

test('the runner stops on CRLF before the suite and passes the git overrides to it', () => {
  const src = readFileSync(join(import.meta.dirname, 'run-tests.mjs'), 'utf8');
  assert.match(src, /crlfFiles\(ROOT\)/);
  assert.match(src, /env: testGitEnv\(\)/);
});
