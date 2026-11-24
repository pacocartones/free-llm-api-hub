// Hugging Face card + Kaggle metadata for the release mirrors, and the workflow that uploads them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTmpDir } from './lib/tmp.mjs';
import { DEFAULT_KAGGLE_ID, SITE_URL, SNAPSHOT_FILES, mirrorFiles, parseCitation, sizeCategory, writeMirrorFiles } from './dataset-mirrors.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const canonical = JSON.parse(read('data/providers.json'));
const data = { ...canonical, providers: canonical.providers.map(({ env_key, ...p }) => p) };
const citation = parseCitation(read('CITATION.cff'));
const files = mirrorFiles({ data, citation, snapshot: { tag: `v${data.version}`, commit: 'a'.repeat(40) } });
const card = files['README.md'];
const kaggle = JSON.parse(files['dataset-metadata.json']);

test('CITATION.cff is read: title, links, license, keywords, author, abstract, version in sync with the dataset', () => {
  assert.match(citation.title, /^Free LLM API Hub/);
  assert.equal(citation['repository-code'], 'https://github.com/pacocartones/free-llm-api-hub');
  assert.equal(citation.url, SITE_URL);
  assert.equal(citation.license, 'MIT');
  assert.ok(Array.isArray(citation.keywords) && citation.keywords.includes('dataset'));
  assert.deepEqual(citation.authors, ['pacocartones']);
  assert.match(citation.abstract, /continuously-verified dataset/);
  assert.ok(!citation.abstract.includes('\n'));
  assert.equal(citation.version, data.version);
});

test('the snapshot file list matches what scripts/release-snapshot.mjs writes', () => {
  const src = read('scripts/release-snapshot.mjs');
  for (const name of Object.keys(SNAPSHOT_FILES)) assert.ok(src.includes(`'${name}'`), `${name} is a snapshot file`);
  assert.equal(Object.keys(SNAPSHOT_FILES).length, 6);
});

test('the Hugging Face card has valid front matter: MIT, task, tags, size, CSV config', () => {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(card);
  assert.ok(m, 'YAML front matter at the top');
  const yaml = m[1];
  assert.match(yaml, /^license: mit$/m);
  assert.match(yaml, /^task_categories:\n- other$/m);
  assert.match(yaml, /^tags:\n(- [a-z-]+\n)+/m);
  assert.match(yaml, new RegExp(`^size_categories:\\n- ${sizeCategory(data.providers.length).replace(/[<>]/g, '.')}$`, 'm'));
  assert.match(yaml, /configs:\n- config_name: default\n {2}data_files:\n {2}- split: train\n {4}path: providers\.csv/);
  assert.doesNotMatch(yaml, /\t/);
});

test('the card links back, explains tri-state nulls and verified, lists every file and cites the dataset', () => {
  assert.ok(card.includes(SITE_URL) && card.includes(citation['repository-code']));
  assert.ok(card.includes(`/releases/tag/v${data.version}`));
  assert.match(card, /`null` means unconfirmed/);
  assert.match(card, /verified: true/);
  for (const f of Object.keys(SNAPSHOT_FILES)) assert.ok(card.includes(`\`${f}\``), f);
  assert.match(card, /@misc\{free_llm_api_hub,[\s\S]*author {7}= \{pacocartones\}[\s\S]*version {6}= \{\d+\.\d+\.\d+\}/);
  assert.ok(card.includes(`Providers: **${data.providers.length}**`));
  assert.ok(card.includes('commit `aaaaaaaaaaaa`'));
});

test('Kaggle metadata respects the documented limits and states the MIT license', () => {
  assert.equal(kaggle.id, DEFAULT_KAGGLE_ID);
  assert.ok(kaggle.title.length >= 6 && kaggle.title.length <= 50, kaggle.title);
  assert.ok(kaggle.subtitle.length >= 20 && kaggle.subtitle.length <= 80, kaggle.subtitle);
  assert.deepEqual(kaggle.licenses, [{ name: 'other' }]);
  assert.match(kaggle.description, /\*\*License: MIT\*\*/);
  assert.match(kaggle.description, /`null` means unconfirmed/);
  assert.deepEqual(kaggle.resources.map((r) => r.path).sort(), Object.keys(SNAPSHOT_FILES).sort());
  assert.ok(kaggle.keywords.length > 0);
});

test('output is deterministic and ids are validated', () => {
  assert.deepEqual(mirrorFiles({ data, citation, snapshot: { tag: `v${data.version}`, commit: 'a'.repeat(40) } }), files);
  assert.equal(JSON.parse(mirrorFiles({ data, citation, kaggleId: 'someone/other-slug' })['dataset-metadata.json']).id, 'someone/other-slug');
  assert.throws(() => mirrorFiles({ data, citation, kaggleId: 'no-slash' }), /Kaggle dataset id/);
  assert.throws(() => mirrorFiles({ data, citation, hfRepo: 'bad id' }), /Hugging Face repo id/);
  assert.match(mirrorFiles({ data, citation, hfRepo: 'org/free-llm-api-hub' })['README.md'], /load_dataset\("org\/free-llm-api-hub"/);
});

test('size categories', () => {
  assert.equal(sizeCategory(62), 'n<1K');
  assert.equal(sizeCategory(1500), '1K<n<10K');
});

test('the CLI writes both files into a new directory and refuses an existing one', () => {
  const snap = makeTmpDir('mirror-snap-');
  writeFileSync(join(snap, 'providers.json'), JSON.stringify(data));
  writeFileSync(join(snap, 'snapshot.json'), JSON.stringify({ tag: `v${data.version}`, version: data.version, commit: 'b'.repeat(40) }));
  const out = join(makeTmpDir('mirror-out-'), 'cards');
  writeMirrorFiles(snap, out, { hfRepo: 'org/name' });
  assert.ok(existsSync(join(out, 'README.md')) && existsSync(join(out, 'dataset-metadata.json')));
  assert.throws(() => writeMirrorFiles(snap, out), /EEXIST/);
  writeFileSync(join(snap, 'snapshot.json'), JSON.stringify({ version: '0.0.1' }));
  assert.throws(() => writeMirrorFiles(snap, join(snap, 'y')), /disagree/);
});

test('the mirror workflow: pinned actions, least privilege, secrets only from the secrets context, clean skips', () => {
  const wf = read('.github/workflows/mirror-dataset.yml');
  const code = wf.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  assert.match(code, /^on:\n {2}release:\n {4}types: \[published\]\n {2}workflow_dispatch:/m);
  assert.doesNotMatch(code, /pull_request/);
  assert.match(code, /^permissions: \{\}$/m);
  assert.match(code, /permissions:\n {6}contents: read/);
  assert.doesNotMatch(code, /contents: write|id-token|packages: write/);
  for (const [, ref] of code.matchAll(/uses: ([^\s]+)/g)) assert.match(ref, /@[0-9a-f]{40}$/, `${ref} pinned by full SHA`);
  assert.match(code, /persist-credentials: false/);
  for (const s of ['HF_TOKEN', 'KAGGLE_USERNAME', 'KAGGLE_KEY', 'KAGGLE_API_TOKEN']) {
    assert.match(code, new RegExp(`${s}: \\$\\{\\{ secrets\\.${s} \\}\\}`), `${s} comes from secrets`);
  }
  assert.match(code, /HF_DATASET_REPO: \$\{\{ vars\.HF_DATASET_REPO \}\}/);
  assert.match(code, /- name: Upload to Hugging Face\n {8}if: env\.HAS_HF == 'true'/);
  assert.match(code, /- name: Upload to Kaggle[^\n]*\n {8}if: env\.HAS_KAGGLE == 'true'/);
  assert.match(code, /sha256sum -c SHA256SUMS/);
  assert.match(code, /node scripts\/dataset-mirrors\.mjs snapshot cards/);
  // Untrusted event fields reach shell only through env, never interpolated into run scripts.
  const runBlocks = code.split(/\n {8}run: \|?/).slice(1).map((b) => b.split(/\n {6}- /)[0]);
  for (const b of runBlocks) assert.doesNotMatch(b, /\$\{\{/, 'no ${{ }} inside run scripts');
});
