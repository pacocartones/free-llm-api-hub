// Which changes skip the Lighthouse measurement (scripts/lib/lighthouse-scope.mjs, scripts/lighthouse-scope.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lighthouseScope, outsideSite } from './lib/lighthouse-scope.mjs';
import { testGitEnv } from './lib/test-tools.mjs';
import { makeTmpDir } from './lib/tmp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('docs, workflows, root Markdown and the MCP package do not reach the site', () => {
  for (const p of ['docs/backlog.md', 'docs/maintenance/hygiene-audit-2026-11.md', '.github/workflows/verify.yml',
    '.github/ISSUE_TEMPLATE/bug.yml', 'CHANGELOG.md', 'SECURITY.md', 'packages/mcp/src/index.js']) {
    assert.equal(outsideSite(p), true, p);
  }
});

test('the site, its inputs and the gate tooling are measured, and so is anything unknown', () => {
  for (const p of ['site/styles.css', 'data/providers.json', 'scripts/build.mjs', 'scripts/lib/lighthouse-scope.mjs',
    'tools/lighthouse/package-lock.json', 'package-lock.json', '.nvmrc', 'CITATION.cff', 'changes/unreleased/x.md',
    'collections/README.md', 'assets/logo.svg', 'docs/methodology.md', 'CONTRIBUTING.md', 'README.md',
    '.github/workflows/lighthouse.yml', 'a-new-top-level-dir/file.json']) {
    assert.equal(outsideSite(p), false, p);
  }
  assert.equal(outsideSite('docs\\methodology.md'), false, 'Windows separators are normalised');
});

test('one relevant file among many runs the gate; an unknown or empty list runs it too', () => {
  assert.equal(lighthouseScope(['docs/backlog.md', 'CHANGELOG.md']).run, false);
  const mixed = lighthouseScope(['docs/backlog.md', 'site/site.js', 'data/quotes.json']);
  assert.equal(mixed.run, true);
  assert.match(mixed.reason, /site\/site\.js and 1 more/);
  assert.equal(lighthouseScope([]).run, true);
  assert.equal(lighthouseScope(null).run, true);
});

test('the CLI diffs the given range, and measures every other event or an unknown range', () => {
  const dir = makeTmpDir('lh-scope-');
  try {
    const env = { ...testGitEnv(), GITHUB_OUTPUT: '', GITHUB_STEP_SUMMARY: '' };
    const git = (...args) => {
      const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8', env });
      assert.equal(r.status, 0, r.stderr);
      return r.stdout.trim();
    };
    git('init', '-q');
    mkdirSync(join(dir, 'docs'));
    writeFileSync(join(dir, 'docs/a.md'), 'a\n');
    git('add', '-A');
    git('-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'one');
    const base = git('rev-parse', 'HEAD');
    writeFileSync(join(dir, 'docs/a.md'), 'b\n');
    git('-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qam', 'two');
    const cli = (extra) => spawnSync(process.execPath, [join(ROOT, 'scripts/lighthouse-scope.mjs')],
      { cwd: dir, encoding: 'utf8', env: { ...env, ...extra } });
    const docsOnly = cli({ EVENT: 'pull_request', BASE: base, HEAD: 'HEAD' });
    assert.equal(docsOnly.status, 0);
    assert.match(docsOnly.stdout, /^run=false$/m);
    assert.match(cli({ EVENT: 'push', BASE: '0'.repeat(40), HEAD: 'HEAD' }).stdout, /^run=true$/m, 'new branch');
    assert.match(cli({ EVENT: 'push', BASE: 'f'.repeat(40), HEAD: 'HEAD' }).stdout, /^run=true$/m, 'unknown commit');
    assert.match(cli({ EVENT: 'schedule', BASE: base, HEAD: 'HEAD' }).stdout, /^run=true$/m, 'nightly');
    assert.match(cli({ EVENT: 'workflow_dispatch', BASE: base, HEAD: 'HEAD' }).stdout, /^run=true$/m, 'manual');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lighthouse.yml asks the scope step before building, in both measuring jobs, and the report needs a measurement', () => {
  const wf = readFileSync(join(ROOT, '.github/workflows/lighthouse.yml'), 'utf8').replace(/\r\n/g, '\n');
  for (const id of ['lighthouse', 'performance']) {
    const start = wf.indexOf(`\n  ${id}:\n`);
    const rest = wf.slice(start + id.length + 5);
    const next = rest.search(/^ {2}[a-z-]+:\n/m);
    const job = next === -1 ? rest : rest.slice(0, next);
    assert.ok(job.indexOf('node scripts/lighthouse-scope.mjs') !== -1, `${id}: asks the scope script`);
    assert.ok(job.indexOf('node scripts/lighthouse-scope.mjs') < job.indexOf('uses: actions/setup-node@'), `${id}: before setup-node`);
    for (const step of ['uses: actions/setup-node@', 'name: Build the site', 'name: Install Lighthouse', 'name: Measure the']) {
      const at = job.indexOf(step);
      assert.ok(at !== -1, `${id}: ${step}`);
      assert.match(job.slice(at, at + 200), /if: \$\{\{ steps\.scope\.outputs\.run == 'true' \}\}/, `${id}: ${step} is gated`);
    }
    assert.doesNotMatch(job.match(/^ {4}if: .*$/m)?.[0] ?? '', /scope/, `${id}: the job itself always runs and reports`);
  }
  assert.match(wf, /needs\.performance\.outputs\.measured == 'true'/, 'no measurement, no issue update');
});
