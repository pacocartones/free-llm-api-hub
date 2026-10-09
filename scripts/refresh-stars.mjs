#!/usr/bin/env node
// Writes data/repo-stats.json with the repository's current star count, for build.mjs to render
// into the pages. Network use is confined to this script; run it when you want the number moved.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const res = await fetch('https://api.github.com/repos/pacocartones/free-llm-api-hub', { headers: { accept: 'application/vnd.github+json' } });
if (!res.ok) { console.error(`GitHub answered ${res.status}; data/repo-stats.json not changed.`); process.exit(1); }
const { stargazers_count } = await res.json();
if (!Number.isInteger(stargazers_count)) { console.error('No star count in the answer; data/repo-stats.json not changed.'); process.exit(1); }
writeFileSync(join(ROOT, 'data/repo-stats.json'), JSON.stringify({ stars: stargazers_count, as_of: new Date().toISOString().slice(0, 10) }, null, 2) + '\n');
console.log(`${stargazers_count} stars.`);
