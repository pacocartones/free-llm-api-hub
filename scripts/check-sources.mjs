#!/usr/bin/env node
// On-demand external source check: provider docs and claim evidence plus external links in docs/sources.md.
// It writes nothing and is intentionally outside npm test and CI, so a third-party outage never fails a build.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSources, collectSources, formatReport } from './lib/check-sources.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { providers } = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8'));
const sourcesMarkdown = readFileSync(join(ROOT, 'docs/sources.md'), 'utf8');
const entries = collectSources(providers, sourcesMarkdown);
const results = await checkSources(entries);
console.log(formatReport(results));
if (results.some((r) => !r.ok)) process.exitCode = 1;
