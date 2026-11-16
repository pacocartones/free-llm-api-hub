#!/usr/bin/env node
// Local preparation only: no GitHub writes, tags, workflow dispatches or secrets.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { officialDatasetTag } from './lib/release-tags.mjs';
import { providersCsv } from './lib/provider-csv.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SNAPSHOT_GENERATORS = ['scripts/release-snapshot.mjs', 'scripts/lib/provider-csv.mjs', 'scripts/lib/release-tags.mjs', 'package.json'];
export function toolingProvenance(root = ROOT) {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  git('ls-files', '--error-unmatch', '--', ...SNAPSHOT_GENERATORS);
  if (git('status', '--porcelain', '--untracked-files=all', '--', ...SNAPSHOT_GENERATORS)) {
    throw new Error('Snapshot generators must be committed and clean (including staged changes).');
  }
  return { toolingCommit: git('rev-parse', 'HEAD'), nodeVersion: process.versions.node };
}
export function snapshotFiles(cwd, tag, toolingRoot = ROOT) {
  if (!/^v\d+\.\d+\.\d+$/.test(tag || '')) throw new Error('Expected dataset tag vX.Y.Z.');
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  if (git('rev-parse', '--is-shallow-repository') !== 'false') throw new Error('Full git history required.');
  const { commit } = officialDatasetTag(cwd, tag);
  const provenance = toolingProvenance(toolingRoot);
  const read = path => execFileSync('git', ['show', `${commit}:${path}`], { cwd });
  const canonical = read('data/providers.json');
  const data = JSON.parse(canonical);
  if (`v${data.version}` !== tag) throw new Error('Tag and dataset version disagree.');
  const schema = read('data/schema.json');
  const publicData = { ...data, providers: data.providers.map(({ env_key, ...provider }) => provider) };
  // The canonical JSON is byte-for-byte the tagged source. Public JSON/CSV use
  // the site projection, not API v1's compatibility projection.
  const files = {
    'providers.canonical.json': canonical,
    'providers.json': Buffer.from(JSON.stringify(publicData, null, 2) + '\n'),
    'providers.csv': Buffer.from(providersCsv(publicData)),
    'schema.json': schema,
    'snapshot.json': Buffer.from(JSON.stringify({ tag, commit, ...provenance, version: data.version,
      format: 'dataset (not API v1)', canonical: 'providers.canonical.json',
      json: 'providers.json', csv: 'providers.csv', schema: 'schema.json',
      csvNote: 'Scalar projection; nested values remain in JSON. Formula-like strings are escaped.' }, null, 2) + '\n'),
  };
  files['SHA256SUMS'] = Buffer.from(Object.keys(files).sort().map(name =>
    `${createHash('sha256').update(files[name]).digest('hex')}  ${name}\n`).join(''));
  return files;
}
export function writeSnapshot(cwd, tag, output, toolingRoot = ROOT) {
  if (!output) throw new Error('An explicit new output directory is required.');
  const files = snapshotFiles(cwd, tag, toolingRoot);
  mkdirSync(output); // Refuse an existing directory: never replace reviewed assets.
  for (const [name, bytes] of Object.entries(files)) writeFileSync(`${output}/${name}`, bytes, { flag: 'wx' });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 4) throw new Error('Usage: npm run release-snapshot -- vX.Y.Z /new/output/directory');
    writeSnapshot(process.cwd(), process.argv[2], process.argv[3]);
  } catch (error) { console.error(`release-snapshot: ${error.message}`); process.exitCode = 1; }
}
