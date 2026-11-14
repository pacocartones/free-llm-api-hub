#!/usr/bin/env node
// Checks that relative Markdown links across the repo's docs point to files that exist,
// so cross-links never silently rot. Skips external URLs, anchors, mailto and
// GitHub issue/discussion shortcuts. Strips queries and fragments from local paths. Fails CI (exit 1) on a broken local link.
// Zero dependencies. Run with: node scripts/check-links.mjs  (or `npm run links`)

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, relative, isAbsolute, sep, win32 } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Include release docs, templates, package READMEs and nested plans, as well as
// new Markdown awaiting git add. Ignored tool dependencies stay out of scope.
const files = [...new Set(execFileSync('git', [
  'ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', '*.md',
], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean))];

const LINK_RE = /\[[^\]]*\]\(([^)]+)\)/g;
const broken = [];
let checked = 0;

for (const file of files) {
  const md = readFileSync(join(ROOT, file), 'utf8');
  const baseDir = dirname(join(ROOT, file));
  let m;
  while ((m = LINK_RE.exec(md))) {
    let target = m[1].trim();
    // External destinations and GitHub shortcuts have no repository-local file.
    if (/^(https?:|mailto:|#)/i.test(target)) continue;
    // Only documented GitHub destinations are shortcuts, never arbitrary traversal.
    if (/^\.\.\/\.\.\/(?:issues(?:\/(?:new|[1-9]\d*))?|pull\/[1-9]\d*|discussions(?:\/[1-9]\d*)?)(?:[?#].*)?$/.test(target)) continue;
    target = target.split(/[?#]/)[0];
    try { target = decodeURIComponent(target); } catch {
      broken.push(`${file} → ${m[1]} (invalid percent encoding)`);
      continue;
    }
    if (!target) continue;
    checked++;
    // Check both path grammars on every host so Windows paths cannot slip
    // through Linux CI. Normalize separators before resolving parent segments.
    if (isAbsolute(target) || win32.isAbsolute(target) || /^[a-z]:/i.test(target)) {
      broken.push(`${file} → ${m[1]} (absolute path)`);
      continue;
    }
    const resolved = resolve(baseDir, target.replaceAll('\\', '/'));
    const fromRoot = relative(ROOT, resolved);
    if (fromRoot === '..' || fromRoot.startsWith('..' + sep) || isAbsolute(fromRoot)) {
      broken.push(`${file} → ${m[1]} (outside repository)`);
      continue;
    }
    if (!existsSync(resolved)) broken.push(`${file} → ${m[1]}`);
  }
}

if (broken.length) {
  console.error(`✗ ${broken.length} broken internal link(s):`);
  for (const b of broken) console.error('  - ' + b);
  process.exit(1);
}
console.log(`✓ internal links OK — ${checked} local links across ${files.length} files resolve.`);
