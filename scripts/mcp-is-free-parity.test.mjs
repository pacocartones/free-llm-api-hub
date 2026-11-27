// The MCP server's is_free tool answers "Is <provider> free?" with the same sentence as the provider page.
// packages/mcp is published on its own and cannot import scripts/, so it carries a copy of the wording;
// this test keeps the two in step over every provider of the real dataset, as the API publishes it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { answerFirst } from './lib/provider-faq.mjs';
import { toApiV1Provider } from './lib/api-v1.mjs';
import { normalizeDataset } from '../packages/mcp/src/data.js';
import { isFree, limitFigures as mcpLimitFigures, shortDate as mcpShortDate } from '../packages/mcp/src/tools.js';
import { limitFigures } from './lib/provider-meta.mjs';
import { humanDate as shortDate } from './lib/dates.mjs';

const raw = JSON.parse(readFileSync(new URL('../data/providers.json', import.meta.url), 'utf8'));
const published = normalizeDataset({ ...raw, providers: raw.providers.map(toApiV1Provider) }, 'parity');

test('is_free gives the provider page sentence for every provider, from the published (v1) projection', () => {
  assert.ok(raw.providers.length > 0);
  for (const p of raw.providers) {
    const site = answerFirst(p).text;
    const mcp = isFree(published, { slug: p.slug }).answer;
    assert.equal(mcp, site, `${p.slug}: MCP is_free differs from the provider page`);
  }
});

test('the copied helpers agree with the site helpers', () => {
  for (const d of ['2026-01-05', '2026-12-31', '2026-13-01', 'x', null]) assert.equal(mcpShortDate(d), shortDate(d));
  for (const p of raw.providers) assert.deepEqual(mcpLimitFigures(p.free_limits), limitFigures(p.free_limits), p.slug);
});
