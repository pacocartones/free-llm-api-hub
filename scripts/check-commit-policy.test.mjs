// check-commit-policy.sh: the maintainer rules never fire on a contributor, whatever their name, and
// the branch rule never fires on a fork. Each case builds a throwaway repository with one commit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTmpDir } from './lib/tmp.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'check-commit-policy.sh');
const NOREPLY = '253313177+pacocartones@users.noreply.github.com';
const skip = process.platform === 'win32' ? 'bash script, checked on Linux' : false;

function run({ name, email, committerName = name, committerEmail = email, message = 'change', branch, headRepo, prAuthor = 'someone', actor = 'someone' }) {
  const dir = makeTmpDir('commit-policy-');
  const git = (args, env = {}) => execFileSync('git', args, { cwd: dir, env: { ...process.env, ...env }, encoding: 'utf8' }).trim();
  git(['init', '-q']);
  git(['-c', 'user.name=base', '-c', 'user.email=base@example.com', 'commit', '-q', '--allow-empty', '-m', 'base']);
  const base = git(['rev-parse', 'HEAD']);
  git(['commit', '-q', '--allow-empty', '-m', message], {
    GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: email, GIT_COMMITTER_NAME: committerName, GIT_COMMITTER_EMAIL: committerEmail,
  });
  const env = { ...process.env, GITHUB_ACTOR: actor, GITHUB_HEAD_REF: '', GITHUB_EVENT_PATH: '', GITHUB_REPOSITORY: 'pacocartones/free-llm-api-hub' };
  if (branch) {
    const event = join(dir, 'event.json');
    writeFileSync(event, JSON.stringify({ pull_request: { user: { login: prAuthor }, head: { repo: { full_name: headRepo } } } }));
    Object.assign(env, { GITHUB_HEAD_REF: branch, GITHUB_EVENT_PATH: event });
  }
  const result = spawnSync('bash', [SCRIPT, base, 'HEAD'], { cwd: dir, env, encoding: 'utf8' });
  if (result.error) throw result.error;
  assert.notEqual(result.status, null, result.stderr);
  return result.status;
}

test('a maintainer commit with the noreply identity passes', { skip }, () => {
  assert.equal(run({ name: 'Paco Cartones', email: NOREPLY }), 0);
});

// Real Codex Security branch names from PRs #523–530, observed 2026-11-13.
const securityBranches = [
  'codex-security/arp_00371f6ee1ab016ea8e88228b993552b',
  'codex-security/arp_72c583cb2578335c8a4bc24da4bdfb99',
  'codex-security/arp_2b21cd0609236356a09963565ba71e3b',
  'codex-security/arp_6d211d1bd26860b65a20bcd462822ffd',
  'codex-security/arp_7a99c285ba13840a77531e7118bc6a2d',
  'codex-security/arp_3bda249b5ba46b110c415ce520206816',
  'codex-security/arp_b08d66c3529d975649d5904ec0f3f140',
  'codex-security/arp_712c21c97babc3e26e243d4a78830c15',
];
const securityPr = {
  name: 'Paco Cartones', email: NOREPLY,
  branch: securityBranches[0], headRepo: 'pacocartones/free-llm-api-hub', prAuthor: 'LeonMAG',
};

for (const branch of securityBranches) {
  test(`Codex Security branch format passes: ${branch}`, { skip }, () => {
    assert.equal(run({ ...securityPr, branch }), 0);
  });
}

test('Codex Security compatibility is a branch format rule, not an author or actor bypass', { skip }, () => {
  assert.equal(run({ ...securityPr, prAuthor: 'pacocartones' }), 0);
  for (const branch of [
    'codex-security', 'codex-security/', 'codex-security/fix-network',
    'codex-security/arp_', 'codex-security/arp_00371f6ee1ab016ea8e88228b993552',
    'codex-security/arp_00371f6ee1ab016ea8e88228b993552b0',
    'codex-security/arp_00371f6ee1ab016ea8e88228b993552g',
    'codex-security/arp_00371F6EE1AB016EA8E88228B993552B',
    `${securityBranches[0]}-fix`, `${securityBranches[0]}/fix`,
    `prefix/${securityBranches[0]}`, 'codex-security-lookalike/arp_00371f6ee1ab016ea8e88228b993552b',
    'web/hero',
  ]) {
    assert.equal(run({ ...securityPr, branch, actor: 'pacocartones' }), 1, branch);
  }
});

test('fork branches remain unrestricted, including malformed automation names', { skip }, () => {
  for (const branch of [securityBranches[0], 'codex-security/anything', 'dependabot/anything']) {
    assert.equal(run({ ...securityPr, branch, headRepo: 'someone/free-llm-api-hub' }), 0);
  }
});

test('automation branch names never exempt maintainer authors or committers', { skip }, () => {
  for (const headRepo of [securityPr.headRepo, 'someone/free-llm-api-hub']) {
    const pr = { ...securityPr, headRepo };
    assert.equal(run({ ...pr, name: 'agent:security', email: NOREPLY }), 1);
    assert.equal(run({ ...pr, email: 'paco@hq.local' }), 1);
    assert.equal(run({ ...pr, name: 'Someone Else', email: 'someone@example.com', committerName: 'agent:security', committerEmail: NOREPLY }), 1);
    assert.equal(run({ ...pr, message: 'change\n\nCo-Authored-By: Claude <noreply@anthropic.com>' }), 1);
    assert.equal(run({ ...pr, name: 'Someone Else', email: 'someone@example.com', committerName: 'Paco Cartones', committerEmail: NOREPLY, message: 'Generated by Codex' }), 1);
  }
});

test('existing branch formats remain accepted and unrelated namespaces stay rejected', { skip }, () => {
  for (const branch of ['fix/network', 'ci/policy', 'changeset-release/main', 'bot/update/data']) {
    assert.equal(run({ ...securityPr, branch }), 0, branch);
  }
  for (const branch of ['security/arp_00371f6ee1ab016ea8e88228b993552b', 'feature/network', 'fix/Network']) {
    assert.equal(run({ ...securityPr, branch }), 1, branch);
  }
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

// The nine open Dependabot branches that exposed the naming-rule regression.
const dependabotBranches = [
  'dependabot/npm_and_yarn/packages/mcp/hono-4.13.18',
  'dependabot/npm_and_yarn/packages/mcp/hono/node-server-2.1.8',
  'dependabot/npm_and_yarn/packages/mcp/modelcontextprotocol/sdk-1.32.2',
  'dependabot/npm_and_yarn/packages/mcp/ip-address-10.7.5',
  'dependabot/npm_and_yarn/packages/mcp/body-parser-2.4.0',
  'dependabot/npm_and_yarn/tools/lighthouse/fast-uri-3.1.9',
  'dependabot/npm_and_yarn/fast-uri-3.1.9',
  'dependabot/npm_and_yarn/packages/mcp/fast-uri-3.1.9',
  'dependabot/github_actions/actions-1b1ce9824d',
];
const dependabot = {
  name: 'dependabot[bot]', email: '49699333+dependabot[bot]@users.noreply.github.com',
  headRepo: 'pacocartones/free-llm-api-hub', prAuthor: 'dependabot[bot]',
};

for (const branch of dependabotBranches) {
  test(`Dependabot's own branch passes: ${branch}`, { skip }, () => {
    assert.equal(run({ ...dependabot, branch }), 0);
  });
}

test('the dependabot prefix alone does not exempt a human, another bot or a missing PR author', { skip }, () => {
  for (const prAuthor of ['someone', 'renovate[bot]', null]) {
    assert.equal(run({ ...dependabot, prAuthor, branch: dependabotBranches[0], actor: 'dependabot[bot]' }), 1);
  }
});

test('Dependabot is not exempt outside its branch namespace', { skip }, () => {
  for (const branch of ['web/hero', 'dependabot-lookalike/update', 'dependabot']) {
    assert.equal(run({ ...dependabot, branch }), 1);
  }
});

test('a Dependabot PR still enforces maintainer identity and attribution rules', { skip }, () => {
  const pr = { ...dependabot, branch: dependabotBranches[0] };
  assert.equal(run({ ...pr, name: 'agent:free-llm-api-hub', email: NOREPLY }), 1);
  assert.equal(run({ ...pr, name: 'Paco Cartones', email: NOREPLY, message: 'change\n\nCo-Authored-By: Claude <noreply@anthropic.com>' }), 1);
});

test('Dependabot author gating and Codex Security naming compose without cross-exemptions', { skip }, () => {
  const cases = [
    { branch: dependabotBranches[0], prAuthor: 'dependabot[bot]', want: 0 },
    { branch: dependabotBranches[0], prAuthor: 'pacocartones', want: 1 },
    { branch: dependabotBranches[0], prAuthor: 'LeonMAG', want: 1 },
    { branch: dependabotBranches[0], prAuthor: null, want: 1 },
    { branch: securityBranches[0], prAuthor: 'dependabot[bot]', want: 0 },
    { branch: securityBranches[0], prAuthor: 'pacocartones', want: 0 },
    { branch: securityBranches[0], prAuthor: 'LeonMAG', want: 0 },
    { branch: 'codex-security/fix-network', prAuthor: 'dependabot[bot]', want: 1 },
    { branch: 'web/hero', prAuthor: 'dependabot[bot]', want: 1 },
    { branch: 'dependabot-lookalike/update', prAuthor: 'dependabot[bot]', want: 1 },
  ];
  for (const { branch, prAuthor, want } of cases) {
    const pr = { ...securityPr, branch, prAuthor, actor: 'dependabot[bot]' };
    assert.equal(run(pr), want, `${prAuthor}: ${branch}`);
    assert.equal(run({ ...pr, headRepo: 'someone/free-llm-api-hub' }), 0, `fork: ${branch}`);
  }
});

// Leon's author identity exists in repository history. GitHub users/LeonMAG
// confirms login LeonMAG, name Leon Marcos and account id 261010486.
const leonEmails = ['leonaniagomez@gmail.com', '261010486+LeonMAG@users.noreply.github.com'];
for (const email of leonEmails) {
  test(`Leon Marcos accepts the verified address ${email}`, { skip }, () => {
    assert.equal(run({ name: 'Leon Marcos', email }), 0);
    assert.equal(run({ name: 'Someone Else', email: 'contributor@example.com', committerName: 'Leon Marcos', committerEmail: email }), 0);
  });
}

test('Leon identity rejects unverified addresses, aliases and cross-maintainer pairs', { skip }, () => {
  for (const email of ['leon@example.com', '999+LeonMAG@users.noreply.github.com', 'LeonMAG@users.noreply.github.com', NOREPLY]) {
    assert.equal(run({ name: 'Leon Marcos', email }), 1, email);
  }
  for (const email of leonEmails) {
    for (const name of ['LeonMAG', 'LEON MARCOS', 'Someone Else', 'Paco Cartones']) {
      assert.equal(run({ name, email }), 1, `${name} <${email}>`);
    }
    assert.equal(run({ name: 'Someone Else', email: 'contributor@example.com', committerName: 'Leon Marcos', committerEmail: 'leon@example.com' }), 1);
  }
});

test('Leon authors and committers receive attribution checks even in fork or automation PRs', { skip }, () => {
  for (const email of leonEmails) {
    for (const headRepo of [securityPr.headRepo, 'someone/free-llm-api-hub']) {
      const pr = { ...securityPr, headRepo, name: 'Leon Marcos', email };
      assert.equal(run({ ...pr, message: 'change\n\nCo-Authored-By: Claude <noreply@anthropic.com>' }), 1);
      assert.equal(run({ ...pr, name: 'Someone Else', email: 'contributor@example.com', committerName: 'Leon Marcos', committerEmail: email, message: 'Generated by Codex' }), 1);
    }
  }
});

test('contributors with similar first names remain unrestricted', { skip }, () => {
  assert.equal(run({ name: 'Leon', email: 'leon@example.com', message: 'Generated by Codex' }), 0);
});
