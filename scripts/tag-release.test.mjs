// Run the workflow's actual release step against disposable local Git remotes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { makeTmpDir } from './lib/tmp.mjs';

const skip = process.platform === 'win32' ? 'release shell is checked on Linux' : false;
const workflow = readFileSync(new URL('../.github/workflows/tag-release.yml', import.meta.url), 'utf8');
const step = workflow.split(/^      - /m).find((text) => text.includes('DATASET_VERSION:'));
assert.ok(step, 'workflow must pass the dataset version to the release step');
const script = step.includes('        run: |\n')
  ? step.split('        run: |\n')[1].replace(/^          /gm, '')
  : step.match(/^        run: (.+)$/m)[1].replace('scripts/tag-release.sh', '"$TAG_SCRIPT"');
// Supply the push context through the workflow's actual environment binding.
// Removing or misrouting that binding must break the publication tests too.
const beforeEnvName = step.match(/^          ([A-Z_]+): \$\{\{ github\.event\.before \}\}\r?$/m)?.[1];

function fixture({ beforeVersion = '1.2.2', afterVersion = '1.2.3' } = {}) {
  const root = makeTmpDir('tag-release-');
  const remote = join(root, 'origin.git');
  const repo = join(root, 'repo');
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  execFileSync('git', ['init', '-q', '--bare', remote]);
  execFileSync('git', ['init', '-q', '-b', 'main', repo]);
  git('config', 'user.name', 'Test');
  git('config', 'user.email', 'test@example.invalid');
  mkdirSync(join(repo, 'data'));
  writeFileSync(join(repo, 'data/providers.json'), JSON.stringify({ version: beforeVersion }));
  git('add', 'data/providers.json');
  git('commit', '-q', '-m', 'base');
  const base = git('rev-parse', 'HEAD');
  writeFileSync(join(repo, 'data/providers.json'), JSON.stringify({ version: afterVersion, fixture: 'updated data' }));
  git('add', 'data/providers.json');
  git('commit', '-q', '--allow-empty', '-m', 'release');
  const head = git('rev-parse', 'HEAD');
  git('remote', 'add', 'origin', remote);
  git('push', '-q', 'origin', 'main');
  const remoteGit = (...args) => git('--git-dir=' + remote, ...args);
  const run = (env = {}) => {
    const releaseEnv = { ...process.env, DATASET_VERSION: '1.2.3', GH_TOKEN: 'dummy-test-token', GITHUB_SHA: head,
      GITHUB_REF: 'refs/heads/main', TAG_SCRIPT: fileURLToPath(new URL('./tag-release.sh', import.meta.url)) };
    delete releaseEnv.EVENT_BEFORE_SHA;
    if (beforeEnvName) releaseEnv[beforeEnvName] = base;
    const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', script], {
      cwd: repo, encoding: 'utf8', timeout: 10000,
      env: { ...releaseEnv, ...env },
    });
    if (result.error) throw result.error;
    return result;
  };
  const publishTag = (target = head, annotated = true) => {
    git('tag', ...(annotated ? ['-a', '-m', 'Dataset v1.2.3'] : []), 'v1.2.3', target);
    git('push', '-q', 'origin', 'refs/tags/v1.2.3');
  };
  return { git, remoteGit, run, publishTag, base, head };
}

function succeeds(result) { assert.equal(result.status, 0, result.stdout + result.stderr); }
function fails(result, message) {
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stderr, message);
}

test('tag release creates an annotated tag at GITHUB_SHA and does not persist credentials', { skip }, () => {
  const f = fixture();
  succeeds(f.run());
  assert.equal(f.remoteGit('cat-file', '-t', 'refs/tags/v1.2.3'), 'tag');
  assert.equal(f.remoteGit('rev-parse', 'refs/tags/v1.2.3^{commit}'), f.head);
  assert.doesNotMatch(f.git('config', '--local', '--list'), /extraheader|dummy-test-token/i);
  const tagObject = f.remoteGit('rev-parse', 'refs/tags/v1.2.3');
  succeeds(f.run());
  assert.equal(f.remoteGit('rev-parse', 'refs/tags/v1.2.3'), tagObject, 'rerun must not replace the tag');
});

test('existing annotated tag at the event commit is accepted', { skip }, () => {
  const f = fixture(); f.publishTag(); succeeds(f.run());
});

test('existing annotated tag at a different main commit fails without moving it', { skip }, () => {
  const f = fixture(); f.publishTag(f.base);
  fails(f.run(), /does not resolve to GITHUB_SHA/);
  assert.equal(f.remoteGit('rev-parse', 'v1.2.3^{commit}'), f.base);
});

test('existing lightweight tag at the correct commit fails', { skip }, () => {
  const f = fixture(); f.publishTag(f.head, false);
  fails(f.run(), /not annotated/);
});

test('remote tag is validated even if checkout has a different valid local tag', { skip }, () => {
  const f = fixture(); f.publishTag(f.base);
  f.git('tag', '-f', '-a', 'v1.2.3', '-m', 'local only', f.head);
  fails(f.run(), /does not resolve to GITHUB_SHA/);
});

for (const existing of [false, true]) {
  test(`event commit outside main fails (tag exists: ${existing})`, { skip }, () => {
    const f = fixture();
    f.git('checkout', '-q', '--orphan', 'unreviewed');
    f.git('commit', '-q', '--allow-empty', '-m', 'unreviewed');
    const other = f.git('rev-parse', 'HEAD');
    if (existing) f.publishTag(other);
    fails(f.run({ GITHUB_SHA: other }), /not reachable from origin\/main/);
    if (!existing) assert.equal(f.remoteGit('tag', '--list'), '');
  });
}

test('checkout differing from GITHUB_SHA fails before tag creation', { skip }, () => {
  const f = fixture(); fails(f.run({ GITHUB_SHA: f.base }), /HEAD does not match GITHUB_SHA/);
  assert.equal(f.remoteGit('tag', '--list'), '');
});

test('non-main invocation fails before tag creation', { skip }, () => {
  const f = fixture(); fails(f.run({ GITHUB_REF: 'refs/heads/feature' }), /only release from refs\/heads\/main/);
  assert.equal(f.remoteGit('tag', '--list'), '');
});

test('unavailable remote fails closed rather than creating a release', { skip }, () => {
  const f = fixture(); f.git('remote', 'set-url', 'origin', join(makeTmpDir(), 'missing.git'));
  assert.notEqual(f.run().status, 0);
  assert.equal(f.remoteGit('tag', '--list'), '');
});

test('invalid tag ref is rejected before publication', { skip }, () => {
  const f = fixture(); assert.notEqual(f.run({ DATASET_VERSION: 'bad ref' }).status, 0);
  assert.equal(f.remoteGit('tag', '--list'), '');
});

test('post-release data updates preserve the existing historical tag without publishing', { skip }, () => {
  const f = fixture({ beforeVersion: '1.2.3' });
  f.publishTag(f.base);
  const original = f.remoteGit('rev-parse', 'refs/tags/v1.2.3');
  succeeds(f.run({ GH_TOKEN: '' }));
  assert.equal(f.remoteGit('rev-parse', 'refs/tags/v1.2.3'), original);
  assert.equal(f.remoteGit('rev-parse', 'refs/tags/v1.2.3^{commit}'), f.base);
});

test('unchanged version does not backfill a missing tag or require publication credentials', { skip }, () => {
  const f = fixture({ beforeVersion: '1.2.3' });
  succeeds(f.run({ GH_TOKEN: '' }));
  assert.equal(f.remoteGit('tag', '--list'), '');
});

test('missing push-before context fails without creating a tag', { skip }, () => {
  const f = fixture();
  fails(f.run({ EVENT_BEFORE_SHA: '' }), /event before commit required/);
  assert.equal(f.remoteGit('tag', '--list'), '');
});

test('malformed push-before context fails without creating a tag', { skip }, () => {
  const f = fixture();
  fails(f.run({ EVENT_BEFORE_SHA: 'not-a-commit' }), /invalid EVENT_BEFORE_SHA/);
  assert.equal(f.remoteGit('tag', '--list'), '');
});

test('push-before commit outside the event history fails without creating a tag', { skip }, () => {
  const f = fixture();
  f.git('checkout', '-q', '--orphan', 'unrelated');
  f.git('commit', '-q', '--allow-empty', '-m', 'unrelated history');
  const unrelated = f.git('rev-parse', 'HEAD');
  f.git('checkout', '-q', 'main');
  fails(f.run({ EVENT_BEFORE_SHA: unrelated }), /before commit is not an ancestor/);
  assert.equal(f.remoteGit('tag', '--list'), '');
});

test('multi-commit pushes compare against the event before commit rather than the first parent', { skip }, () => {
  const f = fixture();
  f.git('commit', '-q', '--allow-empty', '-m', 'follow-up in the same push');
  const eventHead = f.git('rev-parse', 'HEAD');
  f.git('push', '-q', 'origin', 'main');
  succeeds(f.run({ GITHUB_SHA: eventHead }));
  assert.equal(f.remoteGit('rev-parse', 'refs/tags/v1.2.3^{commit}'), eventHead);
});

test('initial pushes with an all-zero before ref can publish the trusted event commit', { skip }, () => {
  const f = fixture();
  succeeds(f.run({ EVENT_BEFORE_SHA: '0'.repeat(40) }));
  assert.equal(f.remoteGit('rev-parse', 'refs/tags/v1.2.3^{commit}'), f.head);
});
