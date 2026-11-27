#!/usr/bin/env node
// Builds the Hugging Face dataset card (README.md) and the Kaggle dataset-metadata.json that go with a
// release snapshot (scripts/release-snapshot.mjs). The mirror workflow (.github/workflows/mirror-dataset.yml)
// runs it on the downloaded release assets, so the descriptions always match the files they ship with.
// Pure and offline: no network, no dates from the clock, no secrets.
//
//   node scripts/dataset-mirrors.mjs <snapshot-dir> <new-output-dir>
//
// Environment: KAGGLE_DATASET (owner/slug) overrides the Kaggle id placeholder below; HF_DATASET_REPO (owner/name)
// fills the repo id in the card's load_dataset example.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_KAGGLE_ID = 'pacocartones/free-llm-api-hub';
export const SITE_URL = 'https://freellmapihub.com/';

// The six files of a release snapshot, as written by scripts/release-snapshot.mjs.
export const SNAPSHOT_FILES = {
  'providers.json': 'Public dataset JSON (env_key removed): one object per provider, nested fields kept.',
  'providers.csv': 'Scalar CSV projection of providers.json. Empty cell = null/absent, never false or 0.',
  'providers.canonical.json': 'Byte-exact data/providers.json at the release tag.',
  'schema.json': 'JSON Schema of the canonical dataset at the release tag.',
  'snapshot.json': 'Manifest: release tag, source commit, tooling commit and file roles.',
  SHA256SUMS: 'SHA-256 checksums of the five files above (sha256sum -c SHA256SUMS).',
};

const unquote = (s) => s.trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');

/** Minimal reader for the flat CITATION.cff of this repository: scalars, folded blocks, string lists, author aliases. */
export function parseCitation(text) {
  const out = { authors: [] };
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = /^([a-z][a-z0-9-]*):\s*(.*)$/.exec(lines[i]);
    if (!m) continue;
    const [, key, rest] = m;
    const block = [];
    while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) block.push(lines[++i]);
    if (key === 'authors') {
      for (const b of block) { const a = /^\s*-?\s*(alias|name|family-names|given-names):\s*(.+)$/.exec(b); if (a && a[1] === 'alias') out.authors.push(unquote(a[2])); }
    } else if (/^>-?$/.test(rest)) out[key] = block.map((b) => b.trim()).join(' ');
    else if (rest === '') out[key] = block.map((b) => unquote(b.replace(/^\s*-\s*/, '')));
    else out[key] = unquote(rest);
  }
  return out;
}

export function sizeCategory(n) {
  if (n < 1e3) return 'n<1K';
  if (n < 1e4) return '1K<n<10K';
  if (n < 1e5) return '10K<n<100K';
  return '100K<n<1M';
}

const yamlStr = (s) => JSON.stringify(String(s)); // JSON strings are valid YAML scalars.

function bibtex(cit, data) {
  const year = (cit['date-released'] || data.generated || '').slice(0, 4);
  return [
    '@misc{free_llm_api_hub,',
    `  title        = {${cit.title}},`,
    `  author       = {${cit.authors.join(' and ')}},`,
    year && `  year         = {${year}},`,
    `  version      = {${data.version}},`,
    `  url          = {${cit['repository-code']}},`,
    `  howpublished = {\\url{${cit.url}}}`,
    '}',
  ].filter(Boolean).join('\n');
}

/** @returns {{ 'README.md': string, 'dataset-metadata.json': string }} */
export function mirrorFiles({ data, citation, snapshot = {}, kaggleId = DEFAULT_KAGGLE_ID, hfRepo = '' }) {
  if (hfRepo && !/^[\w.-]+\/[\w.-]+$/.test(hfRepo)) throw new Error(`Bad Hugging Face repo id: ${hfRepo}`);
  if (!/^[a-z0-9-]+\/[a-z0-9-]{3,50}$/.test(kaggleId)) throw new Error(`Bad Kaggle dataset id: ${kaggleId}`);
  const cit = citation;
  const repo = cit['repository-code'];
  const providers = data.providers;
  const verified = providers.filter((p) => p.verified === true).length;
  const tag = snapshot.tag || `v${data.version}`;
  const release = `${repo}/releases/tag/${tag}`;
  const pretty = 'Free LLM API Hub';

  const front = [
    '---',
    'license: mit',
    `pretty_name: ${yamlStr(pretty)}`,
    'language:',
    '- en',
    'task_categories:',
    '- other',
    'tags:',
    ...['llm', 'llm-api', 'free-tier', 'api-providers', 'openai-compatible', 'tabular'].map((t) => `- ${t}`),
    'size_categories:',
    `- ${sizeCategory(providers.length)}`,
    'configs:',
    '- config_name: default',
    '  data_files:',
    '  - split: train',
    '    path: providers.csv',
    '---',
  ].join('\n');

  const fileRows = Object.entries(SNAPSHOT_FILES).map(([f, d]) => `| \`${f}\` | ${d} |`).join('\n');
  const honesty = [
    '- **`null` means unconfirmed, not "no".** Tri-state fields such as `phone_required`, `card_required` and',
    '  `commercial_ok` are `true`, `false` or `null`; `null` (an empty CSV cell) means nobody has confirmed the',
    '  answer from the provider\'s own documentation. `commercial_ok` may also be `"conditional"`, with the',
    '  reason in `commercial_ok_condition`.',
    '- **`multi_account_forbidden` and `limit_circumvention_forbidden`** record whether the provider\'s own terms',
    '  forbid several accounts per person and getting around rate limits. `null` means the terms are silent, never',
    '  permission. `multi_account_forbidden` may be `"conditional"`, with the scope in `multi_account_condition`.',
    '- **`verified: true`** means the core facts (tier, limits, key catch, link) were confirmed against the',
    '  provider\'s own docs on `last_verified`. `verified: false` entries come from community tracking and are',
    '  indicative only.',
    '- **Free tiers change.** Every entry is dated; check `docs_url` and `last_verified` before relying on one.',
    '- `models_free` is a sampled list of model IDs, not a complete catalogue.',
    '- The CSV is a scalar projection: nested objects (`free_limits`, `data_policy`, `model_tier_source`, …) are',
    '  only in the JSON files. String cells that start with `=`, `+`, `-` or `@` carry a leading apostrophe.',
  ].join('\n');

  const readme = `${front}

# ${pretty}

${cit.abstract}

This is a **mirror** of the GitHub release [${tag}](${release}) of
[${repo.replace('https://github.com/', '')}](${repo}). The repository is the source of truth; this copy is
uploaded automatically when a release is published. Browse and filter the data on the website:
[${SITE_URL.replace(/^https:\/\/|\/$/g, '')}](${SITE_URL}).

- Dataset version: **${data.version}**${snapshot.commit ? ` (commit \`${snapshot.commit.slice(0, 12)}\`)` : ''}
- Providers: **${providers.length}** (${verified} with \`verified: true\`)
- License: **MIT** (see the repository's [LICENSE](${repo}/blob/main/LICENSE))

## Files

| File | Contents |
| --- | --- |
${fileRows}

The dataset viewer and \`load_dataset\` read \`providers.csv\`. For nested fields, read \`providers.json\`
(its rows are under the \`providers\` key):

\`\`\`python
from datasets import load_dataset

ds = load_dataset("${hfRepo || '<this-repo-id>'}", split="train")  # providers.csv
\`\`\`

## How to read the data

${honesty}

Field-by-field documentation: [docs/architecture.md](${repo}/blob/main/docs/architecture.md) and the
[API notes](${repo}/blob/main/docs/api.md). Corrections are welcome as issues or pull requests in the repository.

## Citation

${cit.message || ''}

\`\`\`bibtex
${bibtex(cit, data)}
\`\`\`

The repository also has a [CITATION.cff](${repo}/blob/main/CITATION.cff).
`;

  const description = `${cit.abstract}

Mirror of the GitHub release ${tag} (dataset version ${data.version}, ${providers.length} providers) of ${repo} — the repository is the source of truth. Website: ${SITE_URL}

**License: MIT** (${repo}/blob/main/LICENSE).

## Files

${Object.entries(SNAPSHOT_FILES).map(([f, d]) => `- \`${f}\`: ${d}`).join('\n')}

## How to read the data

${honesty}

## Citation

${cit.message || ''}

\`\`\`
${bibtex(cit, data)}
\`\`\`
`;

  const kaggle = {
    title: 'Free LLM API Hub: free-tier LLM API providers',
    subtitle: 'Dated, sourced dataset of free-tier and trial-credit LLM API providers',
    id: kaggleId,
    licenses: [{ name: 'other' }], // Kaggle's list has no MIT entry; "other" = specified in the description.
    keywords: ['artificial intelligence', 'nlp', 'computer science', 'programming', 'software'],
    description,
    resources: Object.entries(SNAPSHOT_FILES).map(([path, d]) => ({ path, description: d })),
  };
  return { 'README.md': readme, 'dataset-metadata.json': JSON.stringify(kaggle, null, 2) + '\n' };
}

export function writeMirrorFiles(snapshotDir, outDir, { kaggleId = DEFAULT_KAGGLE_ID, hfRepo = '', root = ROOT } = {}) {
  if (!snapshotDir || !outDir) throw new Error('Usage: node scripts/dataset-mirrors.mjs <snapshot-dir> <new-output-dir>');
  const data = JSON.parse(readFileSync(join(snapshotDir, 'providers.json'), 'utf8'));
  let snapshot = {};
  try { snapshot = JSON.parse(readFileSync(join(snapshotDir, 'snapshot.json'), 'utf8')); } catch { /* optional */ }
  if (snapshot.version && snapshot.version !== data.version) throw new Error('snapshot.json and providers.json disagree on the version.');
  const citation = parseCitation(readFileSync(join(root, 'CITATION.cff'), 'utf8'));
  const files = mirrorFiles({ data, citation, snapshot, kaggleId, hfRepo });
  mkdirSync(outDir);
  for (const name of ['README.md', 'dataset-metadata.json']) writeFileSync(join(outDir, name), files[name], { flag: 'wx' });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 4) throw new Error('Usage: node scripts/dataset-mirrors.mjs <snapshot-dir> <new-output-dir>');
    writeMirrorFiles(process.argv[2], process.argv[3], { kaggleId: process.env.KAGGLE_DATASET || DEFAULT_KAGGLE_ID, hfRepo: process.env.HF_DATASET_REPO || '' });
  } catch (error) { console.error(`dataset-mirrors: ${error.message}`); process.exitCode = 1; }
}
