// The first line of README.md is generated from the data (lib/readme-headline.mjs): "# Free LLM API list: N providers,
// checked <date>", N from data/providers.json and the date from the dataset's own as-of day, so it is citable on its own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readmeHeadline, withReadmeHeadline, README_HEADLINE_PREFIX } from './lib/readme-headline.mjs';
import { datasetAsOf } from './lib/release-stamp.mjs';
import { humanDate } from './lib/dates.mjs';

const REPO = join(import.meta.dirname, '..');
const data = JSON.parse(readFileSync(join(REPO, 'data/providers.json'), 'utf8'));
const readme = readFileSync(join(REPO, 'README.md'), 'utf8');

test('README.md opens with the generated headline: every provider, checked on the dataset’s as-of day', () => {
  const first = readme.split('\n')[0];
  assert.equal(first, `# Free LLM API list: ${data.providers.length} providers, checked ${humanDate(datasetAsOf(data))}`);
  assert.equal(first, readmeHeadline({ providers: data.providers, asOf: datasetAsOf(data) }));
});

test('readmeHeadline follows the data, never a typed number or the clock', () => {
  assert.equal(readmeHeadline({ providers: [{}, {}, {}], asOf: '2027-01-05' }), '# Free LLM API list: 3 providers, checked 5 Jan 2027');
  assert.equal(readmeHeadline({ providers: [{}], asOf: '2027-01-05' }), '# Free LLM API list: 1 provider, checked 5 Jan 2027');
  assert.throws(() => readmeHeadline({ providers: [], asOf: 'Nov 2026' }), /YYYY-MM-DD/);
});

test('withReadmeHeadline replaces only line 1, and refuses a README whose first line is not the headline', () => {
  const md = `${README_HEADLINE_PREFIX}1 provider, checked 1 Jan 2026\n\n<div align="center">\nbody\n`;
  const out = withReadmeHeadline(md, '# Free LLM API list: 2 providers, checked 2 Jan 2026');
  assert.equal(out, '# Free LLM API list: 2 providers, checked 2 Jan 2026\n\n<div align="center">\nbody\n');
  assert.equal(withReadmeHeadline(out, out.split('\n')[0]), out, 'idempotent');
  assert.throws(() => withReadmeHeadline('<div align="center">\n', 'x'), /first line must be the generated headline/);
});
