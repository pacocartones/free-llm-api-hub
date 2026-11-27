// The provider counts quoted in site/index.html (the hand-written home page template) agree with the dataset. This check
// used to run in scripts/validate.mjs; it moved here so the data validator never reads site/. Same rule, same messages:
// a typed count must be a {verified}/{providers} token or a FIG marker, or match the data (scripts/lib/figures.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { providerFigures, figureErrors } from './lib/figures.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

test('site/index.html quotes no provider count that disagrees with the dataset', () => {
  const data = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8'));
  const figs = providerFigures(data.providers);
  assert.deepEqual(figureErrors(readFileSync(join(ROOT, 'site/index.html'), 'utf8'), figs, 'site/index.html'), []);
});
