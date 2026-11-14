import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { makeTmpDir } from './lib/tmp.mjs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { changelogDraft } from './changelog-draft.mjs';
import { snapshotFiles, writeSnapshot, SNAPSHOT_GENERATORS } from './release-snapshot.mjs';

function fixture(t) {
  const cwd = makeTmpDir('changelog-');
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env,
    GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.com',
    GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.com',
    GIT_AUTHOR_DATE: '2026-11-14T10:00:00Z', GIT_COMMITTER_DATE: '2026-11-14T10:00:00Z' } }).trim();
  git('init', '-q');
  mkdirSync(join(cwd, 'data'));
  for (const name of SNAPSHOT_GENERATORS) {
    mkdirSync(join(cwd, name, '..'), { recursive: true });
    writeFileSync(join(cwd, name), readFileSync(new URL('../' + name, import.meta.url)));
  }
  const data = { version: '1.0.0', generated: '2026-11-14', providers: [
    { slug: 'alpha', name: 'Álpha', free_tier: 'old', rate_limits: '1/min', env_key: 'ALPHA_API_KEY' },
  ] };
  const commit = message => {
    writeFileSync(join(cwd, 'data/providers.json'), JSON.stringify(data));
    git('add', '.'); git('commit', '-qm', message);
  };
  writeFileSync(join(cwd, 'data/schema.json'), '{"type":"object"}\n');
  commit('baseline'); git('tag', '-a', 'v1.0.0', '-m', 'Dataset v1.0.0');
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  git('update-ref', 'refs/remotes/origin/tags/v1.0.0', 'refs/tags/v1.0.0');
  return { cwd, git, data, commit };
}

test('draft mines two same-day commits after the tag, grouped by field/provider, deterministically', t => {
  const { cwd, git, data, commit } = fixture(t);
  data.providers[0].free_tier = 'new'; commit('tier change');
  data.providers[0].rate_limits = '2/min'; commit('rate change');
  git('tag', 'mcp-v99.0.0');
  const before = git('status', '--porcelain');
  const output = changelogDraft(cwd);
  assert.equal(output, changelogDraft(cwd));
  assert.match(output, /Since v1\.0\.0; last observed change: 2026-11-14/);
  assert.match(output, /## free_tier\n\n- "Álpha" \("alpha"\), 2026-11-14: "old" → "new"/);
  assert.match(output, /## rate_limits\n\n- "Álpha" \("alpha"\), 2026-11-14: "1\/min" → "2\/min"/);
  assert.doesNotMatch(output, /## Added providers/);
  assert.equal(git('status', '--porcelain'), before);
});

test('empty range, additions, null transitions and missing tags are explicit', t => {
  const { cwd, git, data, commit } = fixture(t);
  assert.match(changelogDraft(cwd), /No tracked provider changes/);
  assert.match(changelogDraft(cwd), /last observed change: 2026-11-14 \(baseline; no changes since tag\)/);
  data.providers[0].card_required = false;
  data.providers.push({ slug: 'beta', name: 'B<eta' }); commit('new provider and flag');
  const output = changelogDraft(cwd);
  assert.match(output, /## Added providers/);
  assert.match(output, /null → false/);
  assert.ok(output.includes('B\\<eta'));
  git('update-ref', '-d', 'refs/remotes/origin/tags/v1.0.0');
  assert.throws(() => changelogDraft(cwd), /No reachable official dataset tag/);
});

test('snapshot reads immutable tag bytes and checksums, refuses unsafe inputs and overwrite', t => {
  const { cwd, git, data, commit } = fixture(t);
  const initial = snapshotFiles(cwd, 'v1.0.0', cwd);
  data.providers[0].free_tier = 'unreleased'; commit('later');
  const files = snapshotFiles(cwd, 'v1.0.0', cwd);
  assert.deepEqual(files['providers.canonical.json'], initial['providers.canonical.json']);
  assert.notEqual(JSON.parse(files['snapshot.json']).toolingCommit, JSON.parse(initial['snapshot.json']).toolingCommit);
  assert.equal(JSON.parse(files['snapshot.json']).toolingCommit, git('rev-parse', 'HEAD'));
  assert.equal(JSON.parse(files['snapshot.json']).nodeVersion, process.versions.node);
  assert.deepEqual(snapshotFiles(cwd, 'v1.0.0', cwd), files);
  assert.equal(JSON.parse(files['providers.canonical.json']).providers[0].env_key, 'ALPHA_API_KEY');
  assert.equal(JSON.parse(files['providers.json']).providers[0].env_key, undefined);
  assert.match(files['providers.csv'].toString(), /old/);
  for (const line of files.SHA256SUMS.toString().trim().split('\n')) {
    const [hash, name] = line.split('  ');
    assert.equal(hash, createHash('sha256').update(files[name]).digest('hex'));
  }
  const output = join(cwd, 'snapshot');
  writeSnapshot(cwd, 'v1.0.0', output, cwd);
  assert.deepEqual(readFileSync(join(output, 'SHA256SUMS')), files.SHA256SUMS);
  assert.throws(() => writeSnapshot(cwd, 'v1.0.0', output, cwd), /EEXIST/);
  assert.throws(() => snapshotFiles(cwd, '--help', cwd), /Expected dataset tag/);
  git('tag', 'v2.0.0');
  git('update-ref', 'refs/remotes/origin/tags/v2.0.0', 'HEAD');
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  assert.throws(() => snapshotFiles(cwd, 'v2.0.0', cwd), /version disagree/);
  git('update-ref', 'refs/remotes/origin/main', 'HEAD~1');
  git('tag', 'v1.1.0');
  git('update-ref', 'refs/remotes/origin/tags/v1.1.0', 'HEAD');
  assert.throws(() => snapshotFiles(cwd, 'v1.1.0', cwd));
});


test('draft ignores a higher local tag and incoherent fetched tags', t => {
  const { cwd, git, data, commit } = fixture(t);
  data.providers[0].free_tier = 'new'; commit('change');
  git('tag', 'v9.9.9');
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  assert.match(changelogDraft(cwd), /Since v1\.0\.0/);
  git('update-ref', 'refs/remotes/origin/tags/v9.9.9', 'HEAD');
  assert.match(changelogDraft(cwd), /Since v1\.0\.0/);
  // Even a coherent local-only tag must not become the release baseline.
  data.version = '10.0.0'; commit('local version'); git('tag', 'v10.0.0');
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  assert.match(changelogDraft(cwd), /Since v1\.0\.0/);
  git('update-ref', 'refs/remotes/origin/tags/v10.0.0', 'HEAD');
  assert.match(changelogDraft(cwd), /Since v10\.0\.0/);
});

test('snapshot refuses modified or staged generators but ignores unrelated dirty data', t => {
  const { cwd, git } = fixture(t);
  writeFileSync(join(cwd, 'data/providers.json'), 'dirty data');
  assert.ok(snapshotFiles(cwd, 'v1.0.0', cwd));
  for (const name of SNAPSHOT_GENERATORS) {
    const original = readFileSync(join(cwd, name));
    writeFileSync(join(cwd, name), Buffer.concat([original, Buffer.from('\n')]));
    assert.throws(() => snapshotFiles(cwd, 'v1.0.0', cwd), /generators must be committed and clean/);
    git('add', name);
    assert.throws(() => snapshotFiles(cwd, 'v1.0.0', cwd), /generators must be committed and clean/);
    git('reset', '-q', 'HEAD', '--', name);
    writeFileSync(join(cwd, name), original);
  }
  assert.ok(snapshotFiles(cwd, 'v1.0.0', cwd));
});


test('snapshot CLI records its own tooling checkout and refuses dirty tooling with a separate clean data checkout', t => {
  const tooling = fixture(t);
  const data = fixture(t);
  writeFileSync(join(tooling.cwd, 'README.md'), 'tooling checkout');
  tooling.commit('tooling review');
  const script = join(tooling.cwd, 'scripts/release-snapshot.mjs');
  const output = join(data.cwd, 'cli-snapshot');
  execFileSync(process.execPath, [script, 'v1.0.0', output], { cwd: data.cwd, stdio: 'pipe' });
  const manifest = JSON.parse(readFileSync(join(output, 'snapshot.json')));
  assert.equal(manifest.toolingCommit, tooling.git('rev-parse', 'HEAD'));
  assert.equal(manifest.commit, data.git('rev-parse', 'HEAD'));
  assert.notEqual(manifest.toolingCommit, manifest.commit);
  const csv = join(tooling.cwd, 'scripts/lib/provider-csv.mjs');
  writeFileSync(csv, readFileSync(csv, 'utf8') + '\n');
  assert.throws(() => execFileSync(process.execPath, [script, 'v1.0.0', output + '-rejected'],
    { cwd: data.cwd, stdio: 'pipe' }), /generators must be committed and clean/);
});
