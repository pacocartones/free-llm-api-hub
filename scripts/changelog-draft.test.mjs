import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { makeTmpDir } from './lib/tmp.mjs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { changelogDraft } from './changelog-draft.mjs';
import { snapshotFiles, writeSnapshot } from './release-snapshot.mjs';

function fixture(t) {
  const cwd = makeTmpDir('changelog-');
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env,
    GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.com',
    GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.com',
    GIT_AUTHOR_DATE: '2026-11-14T10:00:00Z', GIT_COMMITTER_DATE: '2026-11-14T10:00:00Z' } }).trim();
  git('init', '-q');
  mkdirSync(join(cwd, 'data'));
  const data = { version: '1.0.0', generated: '2026-11-14', providers: [
    { slug: 'alpha', name: 'Álpha', free_tier: 'old', rate_limits: '1/min', env_key: 'ALPHA_API_KEY' },
  ] };
  const commit = message => {
    writeFileSync(join(cwd, 'data/providers.json'), JSON.stringify(data));
    git('add', '.'); git('commit', '-qm', message);
  };
  writeFileSync(join(cwd, 'data/schema.json'), '{"type":"object"}\n');
  commit('baseline'); git('tag', 'v1.0.0');
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
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
  git('tag', '-d', 'v1.0.0');
  assert.throws(() => changelogDraft(cwd), /No reachable dataset tag/);
});

test('snapshot reads immutable tag bytes and checksums, refuses unsafe inputs and overwrite', t => {
  const { cwd, git, data, commit } = fixture(t);
  const files = snapshotFiles(cwd, 'v1.0.0');
  data.providers[0].free_tier = 'unreleased'; commit('later');
  assert.deepEqual(snapshotFiles(cwd, 'v1.0.0'), files);
  assert.equal(JSON.parse(files['providers.canonical.json']).providers[0].env_key, 'ALPHA_API_KEY');
  assert.equal(JSON.parse(files['providers.json']).providers[0].env_key, undefined);
  assert.match(files['providers.csv'].toString(), /old/);
  for (const line of files.SHA256SUMS.toString().trim().split('\n')) {
    const [hash, name] = line.split('  ');
    assert.equal(hash, createHash('sha256').update(files[name]).digest('hex'));
  }
  const output = join(cwd, 'snapshot');
  writeSnapshot(cwd, 'v1.0.0', output);
  assert.deepEqual(readFileSync(join(output, 'SHA256SUMS')), files.SHA256SUMS);
  assert.throws(() => writeSnapshot(cwd, 'v1.0.0', output), /EEXIST/);
  assert.throws(() => snapshotFiles(cwd, '--help'), /Expected dataset tag/);
  git('tag', 'v2.0.0');
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  assert.throws(() => snapshotFiles(cwd, 'v2.0.0'), /version disagree/);
  git('update-ref', 'refs/remotes/origin/main', 'HEAD~1');
  git('tag', 'v1.1.0');
  assert.throws(() => snapshotFiles(cwd, 'v1.1.0'));
});
