#!/usr/bin/env node
// Checks that relative Markdown links across the repo's docs point to files that exist,
// so cross-links never silently rot. Skips external (http), anchors (#), mailto, query
// strings and GitHub-web shortcuts (../../…). Fails CI (exit 1) on a broken local link.
// Zero dependencies. Run with: node scripts/check-links.mjs  (or `npm run links`)

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const files = [
  'README.md', 'CONTRIBUTING.md', 'GOVERNANCE.md', 'SECURITY.md', 'CODE_OF_CONDUCT.md', 'CHANGELOG.md',
  ...readdirSync(join(ROOT, 'docs')).filter((f) => f.endsWith('.md')).map((f) => `docs/${f}`),
  ...readdirSync(join(ROOT, 'collections')).filter((f) => f.endsWith('.md')).map((f) => `collections/${f}`),
];

const LINK_RE = /\[[^\]]*\]\(([^)]+)\)/g;
const broken = [];
let checked = 0;

for (const file of files) {
  const md = readFileSync(join(ROOT, file), 'utf8');
  const baseDir = dirname(join(ROOT, file));
  let m;
  while ((m = LINK_RE.exec(md))) {
    let target = m[1].trim();
    // Skip external, anchors, mailto, query strings, and GitHub-web shortcuts.
    if (/^(https?:|mailto:|#)/.test(target) || target.includes('?') || target.startsWith('../../')) continue;
    target = target.split('#')[0];
    if (!target) continue;
    checked++;
    const resolved = resolve(baseDir, target);
    if (!existsSync(resolved)) broken.push(`${file} → ${m[1]}`);
  }
}

if (broken.length) {
  console.error(`✗ ${broken.length} broken internal link(s):`);
  for (const b of broken) console.error('  - ' + b);
  process.exit(1);
}
console.log(`✓ internal links OK — ${checked} local links across ${files.length} files resolve.`);
