import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { makeTmpDir } from './lib/tmp.mjs';
import { testGitEnv } from './lib/test-tools.mjs';
import { officialDatasetTag, latestOfficialDatasetTag, ORIGIN_TAGS } from './lib/release-tags.mjs';

function makeRepository(t, { tags = true } = {}) {
  const cwd = makeTmpDir('flah-release-tags-');
  t.after(() => rmSync(cwd, { recursive: true, force: true }));

  const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key)));
  cleanEnv.GIT_CONFIG_NOSYSTEM = '1';
  cleanEnv.GIT_CONFIG_GLOBAL = process.platform === 'win32' ? 'NUL' : '/dev/null';
  const env = testGitEnv(cleanEnv);
  const git = (...args) => execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
  }).trim();

  git('init', '-q');
  git('symbolic-ref', 'HEAD', 'refs/heads/main');
  git('config', 'user.name', 'Fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  mkdirSync(join(cwd, 'data'));

  const commitVersion = (version, message) => {
    writeFileSync(
      join(cwd, 'data', 'providers.json'),
      `${JSON.stringify({ version, providers: [] }, null, 2)}\n`,
    );
    git('add', '--', 'data/providers.json');
    git('commit', '-q', '-m', message);
    return git('rev-parse', 'HEAD');
  };

  const v100 = commitVersion('1.0.0', 'dataset 1.0.0');
  const v110 = commitVersion('1.1.0', 'dataset 1.1.0');
  git('update-ref', 'refs/remotes/origin/main', v110);
  if (tags) {
    git('update-ref', `${ORIGIN_TAGS}v1.0.0`, v100);
    git('update-ref', `${ORIGIN_TAGS}v1.1.0`, v110);
  }
  return { cwd, git, v100, v110, commitVersion };
}

test('officialDatasetTag returns the matching fetched origin tag and commit', (t) => {
  const { cwd, v110 } = makeRepository(t);
  assert.deepEqual(officialDatasetTag(cwd, 'v1.1.0'), { tag: 'v1.1.0', commit: v110 });
});

test('officialDatasetTag rejects tag names outside the exact vX.Y.Z form', (t) => {
  const { cwd } = makeRepository(t);
  for (const tag of ['1.1.0', 'v1.1', 'v01.1.0']) {
    assert.throws(
      () => officialDatasetTag(cwd, tag),
      { message: 'Expected dataset tag vX.Y.Z.' },
      `expected ${tag} to be rejected`,
    );
  }
});

test('officialDatasetTag rejects a tag whose dataset version disagrees', (t) => {
  const { cwd, git, v110 } = makeRepository(t);
  git('update-ref', `${ORIGIN_TAGS}v9.9.9`, v110);
  assert.throws(
    () => officialDatasetTag(cwd, 'v9.9.9'),
    { message: 'Tag and dataset version disagree.' },
  );
});

test('officialDatasetTag rejects an origin tag not reachable from origin/main', (t) => {
  const { cwd, git } = makeRepository(t);
  git('switch', '--orphan', 'unreachable-release');
  mkdirSync(join(cwd, 'data'), { recursive: true });
  writeFileSync(join(cwd, 'data', 'providers.json'), `${JSON.stringify({ version: '1.2.0', providers: [] })}\n`);
  git('add', '--', 'data/providers.json');
  git('commit', '-q', '-m', 'unreachable dataset 1.2.0');
  const unreachable = git('rev-parse', 'HEAD');
  git('switch', '-q', 'main');
  git('update-ref', `${ORIGIN_TAGS}v1.2.0`, unreachable);
  assert.throws(() => officialDatasetTag(cwd, 'v1.2.0'));
});

test('latestOfficialDatasetTag selects the latest valid release and skips a mismatched newer tag', (t) => {
  const { cwd, git, v110 } = makeRepository(t);
  git('update-ref', `${ORIGIN_TAGS}v9.9.9`, v110);
  assert.equal(latestOfficialDatasetTag(cwd), 'v1.1.0');
});

test('latestOfficialDatasetTag throws when there are no origin tags', (t) => {
  const { cwd } = makeRepository(t, { tags: false });
  assert.throws(latestOfficialDatasetTag.bind(null, cwd), /No reachable official dataset tag found/);
});
