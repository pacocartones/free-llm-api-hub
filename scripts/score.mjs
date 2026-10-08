#!/usr/bin/env node
// score.mjs — print the FLLMAPIHUB score ranking from the current data, for review.
//   node scripts/score.mjs            # the top 10 (text LLMs) and the full ranking
// The score itself lives in lib/score.mjs; this only reads the data files and prints.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { rankProviders, topProviders, SCORE_WEIGHTS, EDITORIAL_WEIGHT } from './lib/score.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
const { providers, generated } = read('data/providers.json');
const editorial = read('data/editorial.json');
const probeReport = read('data/probe-report.json');
const now = new Date(generated + 'T12:00:00Z'); // the dataset's own date, so the output is reproducible
const f = (x) => x.toFixed(1).padStart(5);
const row = (r, i) => `${String(i + 1).padStart(2)}  ${r.name.padEnd(30)} ${f(r.total)} = math ${f(r.math)} + editorial ${f(r.editorial)}  [${r.confirmed}/${r.of} confirmed]  ` +
  Object.entries(r.parts).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(' · ');

console.log(`Weights: ${Object.entries(SCORE_WEIGHTS).map(([k, v]) => `${k} ${v}`).join(', ')}, editorial ${EDITORIAL_WEIGHT}. Data of ${generated}.\n`);
console.log('Top 10 (verified, unexpired, text LLMs):');
topProviders(providers, { editorial, probeReport, now }).forEach((r, i) => console.log(row(r, i)));
console.log('\nAll eligible providers:');
rankProviders(providers, { editorial, probeReport, now }).forEach((r, i) => console.log(row(r, i)));
