// test-tools.mjs — when a test that runs a shell script can run on this machine.
//
// A few tests run a real shell script (check-commit-policy.sh, the run: block of a workflow) and those scripts call
// tools that GitHub's runners have but a contributor's machine may not: a fresh WSL or Ubuntu install has bash but no
// jq. Without the tool every one of those tests fails with "jq: command not found", which looks like a broken suite.
// On such a machine the tests are skipped instead, with a message naming the tool and how to install it.
//
// In CI (CI is set) a missing tool is not a reason to skip: the test runs and fails, so coverage never drops
// silently. Windows always skips them: those scripts are Bash and are checked by the Linux job.

import { spawnSync } from 'node:child_process';

const seen = new Map();

export function hasTool(name) {
  if (!seen.has(name)) seen.set(name, spawnSync(name, ['--version'], { stdio: 'ignore' }).status === 0);
  return seen.get(name);
}

// `what` describes the script for the Windows message; `tools` are the commands the script needs besides bash.
export function shellSkip(what, tools = []) {
  if (process.platform === 'win32') return `${what}, checked on Linux`;
  if (process.env.CI) return false;
  const missing = ['bash', ...tools].filter((tool) => !hasTool(tool));
  if (!missing.length) return false;
  return `${what} needs ${missing.join(' and ')} on PATH (Debian, Ubuntu or WSL: sudo apt install ${missing.join(' ')}); CI runs it`;
}

// Settings of a contributor's own git config that must not reach the throwaway repositories the tests commit and tag
// in. With commit.gpgsign or tag.gpgsign on, every such commit asks gpg or ssh for a signature, and a key behind a
// passphrase, an agent the test process cannot reach or no gpg at all fails it: "gpg failed to sign the data", in
// dozens of tests at once. GIT_CONFIG_COUNT entries win over every config file and reach every git the tests start;
// entries already in the environment are kept.
export const GIT_TEST_CONFIG = { 'commit.gpgsign': 'false', 'tag.gpgsign': 'false', 'tag.forceSignAnnotated': 'false' };

export function testGitEnv(env = process.env) {
  const out = { ...env };
  let n = Number.parseInt(env.GIT_CONFIG_COUNT ?? '0', 10);
  if (!Number.isInteger(n) || n < 0) n = 0;
  for (const [key, value] of Object.entries(GIT_TEST_CONFIG)) {
    out[`GIT_CONFIG_KEY_${n}`] = key;
    out[`GIT_CONFIG_VALUE_${n}`] = value;
    n += 1;
  }
  out.GIT_CONFIG_COUNT = String(n);
  return out;
}

// Tracked text files whose working copy has CRLF line endings. .gitattributes checks every text file out as LF, but
// an editor set to CRLF, or a copy made before .gitattributes existed, can still leave CRLF on disk; the tests then
// fail by the hundred on byte-for-byte comparisons and Bash syntax errors. `git ls-files --eol` prints
// "i/<index> w/<working tree> attr/<attributes>\t<path>". Returns [] when git cannot answer.
export function crlfFiles(root) {
  const run = spawnSync('git', ['ls-files', '--eol', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (run.error || run.status !== 0) return [];
  return run.stdout.split('\0').filter(Boolean).flatMap((entry) => {
    const tab = entry.indexOf('\t');
    const [index, worktree] = entry.slice(0, tab).trim().split(/\s+/);
    return /^w\/(crlf|mixed)$/.test(worktree) && index !== 'i/crlf' ? [entry.slice(tab + 1)] : [];
  });
}
