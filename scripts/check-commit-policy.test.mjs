// check-commit-policy.sh: the maintainer rules never fire on a contributor, whatever their name, and
// the branch rule never fires on a fork. Each case builds a throwaway repository with one commit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'check-commit-policy.sh');
const NOREPLY = '253313177+pacocartones@users.noreply.github.com';
const skip = process.platform === 'win32' ? 'bash script, checked on Linux' : false;

function run({ name, email, message = 'change', branch, headRepo }) {
  const dir = mkdtempSync(join(tmpdir(), 'commit-policy-'));
  try {
    const git = (args, env = {}) => execFileSync('git', args, { cwd: dir, env: { ...process.env, ...env }, encoding: 'utf8' }).trim();
    git(['init', '-q']);
    git(['-c', 'user.name=base', '-c', 'user.email=base@example.com', 'commit', '-q', '--allow-empty', '-m', 'base']);
    const base = git(['rev-parse', 'HEAD']);
    git(['commit', '-q', '--allow-empty', '-m', message], {
      GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: email, GIT_COMMITTER_NAME: name, GIT_COMMITTER_EMAIL: email,
    });
    const env = { ...process.env, GITHUB_HEAD_REF: '', GITHUB_EVENT_PATH: '', GITHUB_REPOSITORY: 'pacocartones/free-llm-api-hub' };
    if (branch) {
      const event = join(dir, 'event.json');
      writeFileSync(event, JSON.stringify({ pull_request: { head: { repo: { full_name: headRepo } } } }));
      Object.assign(env, { GITHUB_HEAD_REF: branch, GITHUB_EVENT_PATH: event });
    }
    return spawnSync('bash', [SCRIPT, base, 'HEAD'], { cwd: dir, env, encoding: 'utf8' }).status;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('a maintainer commit with the noreply identity passes', { skip }, () => {
  assert.equal(run({ name: 'Paco Cartones', email: NOREPLY }), 0);
});

test('a maintainer identity under a tool or agent name, or a personal address, fails', { skip }, () => {
  assert.equal(run({ name: 'agent:free-llm-api-hub', email: NOREPLY }), 1);
  assert.equal(run({ name: 'paco', email: 'paco@hq.local' }), 1);
  assert.equal(run({ name: 'pacocartones', email: 'someone@example.com' }), 1);
});

test('an AI trailer on a maintainer commit fails', { skip }, () => {
  assert.equal(run({ name: 'Paco Cartones', email: NOREPLY, message: 'change\n\nCo-Authored-By: Claude <noreply@anthropic.com>' }), 1);
});

test('a contributor is never checked, even one called Paco with their own address', { skip }, () => {
  assert.equal(run({ name: 'Paco', email: 'paco@example.com' }), 0);
  assert.equal(run({ name: 'Someone Else', email: 'someone@example.com' }), 0);
});

test('a branch of this repository must follow the naming rule; a fork branch is never checked', { skip }, () => {
  const own = 'pacocartones/free-llm-api-hub';
  assert.equal(run({ name: 'Paco Cartones', email: NOREPLY, branch: 'web/hero', headRepo: own }), 1);
  assert.equal(run({ name: 'Paco Cartones', email: NOREPLY, branch: 'feat/hero', headRepo: own }), 0);
  assert.equal(run({ name: 'Someone Else', email: 'someone@example.com', branch: 'web/hero', headRepo: 'someone/free-llm-api-hub' }), 0);
  assert.equal(run({ name: 'Paco', email: 'paco@example.com', branch: 'Patch-1', headRepo: 'paco/free-llm-api-hub' }), 0);
});
