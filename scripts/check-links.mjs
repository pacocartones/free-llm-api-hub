#!/usr/bin/env node
// Checks that relative Markdown links across the repo's docs point to files that exist
// and that #fragment anchors to local Markdown files (or the same file) match a heading.
// Skips external URLs, mailto and GitHub issue/discussion shortcuts. Fails CI (exit 1) on a broken local link or missing anchor.
// Zero dependencies. Run with: node scripts/check-links.mjs  (or `npm run links`)

import { readFileSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, relative, isAbsolute, sep, win32 } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GITHUB_SHORTCUT_RE = /^\.\.\/\.\.\/(?:issues(?:\/(?:new|[1-9]\d*))?|pull\/[1-9]\d*|discussions(?:\/[1-9]\d*)?)(?:[?#].*)?$/;
const FENCE_RE = /^\s*(`{3,}|~{3,})(.*)$/;
const ATX_HEADING_RE = /^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;

/**
 * Strip inline Markdown formatting from heading text while keeping visible content
 * and protecting inline code spans so literal underscores inside code stay intact.
 */
function stripInlineMarkdown(text) {
  const codeSpans = [];
  const out = text
    .replace(/(`+)(.*?)\1/g, (_, _ticks, code) => {
      codeSpans.push(code);
      return `\0CODE${codeSpans.length - 1}\0`;
    })
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/(^|[^\p{L}\p{N}_])__([^_]+)__(?=[^\p{L}\p{N}_]|$)/gu, '$1$2')
    .replace(/(^|[^\p{L}\p{N}_])_([^_]+)_(?=[^\p{L}\p{N}_]|$)/gu, '$1$2')
    .replace(/\\([\\`*_{}[\]()#+\-.!|>~])/g, '$1');
  return out.replace(/\0CODE(\d+)\0/g, (_, idx) => codeSpans[Number(idx)]);
}

/** Compute GitHub-style heading slug for a heading's raw Markdown text. */
function toGitHubSlug(headingText) {
  return stripInlineMarkdown(headingText)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '')
    .trim()
    .replace(/\s/g, '-');
}

/** Update fence state for a line; returns true if the line itself is a fence delimiter. */
function updateFence(line, fence) {
  const m = line.match(FENCE_RE);
  if (!m) return { fence, isFenceLine: false };
  const [, marker, rest] = m;
  if (!fence) {
    // A backtick info string cannot contain backticks in CommonMark (that's inline code).
    if (marker[0] === '`' && rest.includes('`')) return { fence: null, isFenceLine: false };
    return { fence: { char: marker[0], len: marker.length }, isFenceLine: true };
  }
  if (marker[0] === fence.char && marker.length >= fence.len && !/\S/.test(rest)) {
    return { fence: null, isFenceLine: true };
  }
  return { fence, isFenceLine: false };
}

/** Extract all GitHub-style heading anchors (including -1, -2 duplicate suffixes) from Markdown. */
function extractAnchors(md) {
  const lines = md.split(/\r?\n/);
  const counts = new Map();
  const anchors = new Set();
  let fence = null;
  for (const line of lines) {
    const next = updateFence(line, fence);
    fence = next.fence;
    if (next.isFenceLine || fence) continue;
    const heading = line.match(ATX_HEADING_RE);
    if (!heading) continue;
    const base = toGitHubSlug(heading[2]);
    if (!base) continue;
    let n = counts.get(base) ?? 0;
    let slug = n === 0 ? base : `${base}-${n}`;
    while (anchors.has(slug)) {
      n++;
      slug = `${base}-${n}`;
    }
    counts.set(base, n + 1);
    anchors.add(slug);
  }
  return anchors;
}

/** Extract `[text](target)` destinations from a single Markdown line outside inline code spans. */
function extractLineLinks(line) {
  const links = [];
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '\\') { i++; continue; }
    if (line[i] === '`') {
      let ticks = 1;
      while (line[i + ticks] === '`') ticks++;
      const close = line.indexOf('`'.repeat(ticks), i + ticks);
      if (close !== -1) { i = close + ticks - 1; continue; }
    }
    if (line[i] === '[') {
      let j = i + 1;
      let depth = 1;
      while (j < line.length && depth > 0) {
        if (line[j] === '\\') { j += 2; continue; }
        if (line[j] === '`') {
          let ticks = 1;
          while (line[j + ticks] === '`') ticks++;
          const close = line.indexOf('`'.repeat(ticks), j + ticks);
          if (close !== -1) { j = close + ticks; continue; }
        }
        if (line[j] === '[') depth++;
        else if (line[j] === ']') depth--;
        j++;
      }
      if (depth === 0 && line[j] === '(') {
        let k = j + 1;
        let parens = 1;
        while (k < line.length && parens > 0) {
          if (line[k] === '\\') { k += 2; continue; }
          if (line[k] === '(') parens++;
          else if (line[k] === ')') parens--;
          k++;
        }
        if (parens === 0) {
          links.push(line.slice(j + 1, k - 1));
          i = k - 1;
        }
      }
    }
  }
  return links;
}

// Include release docs, templates, package READMEs and nested plans, as well as
// new Markdown awaiting git add. Ignored tool dependencies stay out of scope.
// A file deleted but not yet staged (the changelog fragments right after
// `npm run release:prepare`) is still in the index: skip it rather than crash.
// Links that point to it are still reported, because their target is missing.
const files = [...new Set(execFileSync('git', [
  'ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', '*.md',
], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean))]
  .filter((file) => existsSync(join(ROOT, file)));

const anchorCache = new Map();
function getAnchors(absPath) {
  if (!anchorCache.has(absPath)) {
    anchorCache.set(absPath, extractAnchors(readFileSync(absPath, 'utf8')));
  }
  return anchorCache.get(absPath);
}

const broken = [];
let checked = 0;

for (const file of files) {
  const filePath = join(ROOT, file);
  const md = readFileSync(filePath, 'utf8');
  const baseDir = dirname(filePath);
  const lines = md.split(/\r?\n/);
  let fence = null;

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const lineNumber = idx + 1;
    const next = updateFence(line, fence);
    fence = next.fence;
    if (next.isFenceLine || fence) continue;

    for (const rawLink of extractLineLinks(line)) {
      const rawTarget = rawLink.trim();
      // External destinations and GitHub shortcuts have no repository-local file.
      if (/^(https?:|mailto:)/i.test(rawTarget)) continue;
      if (GITHUB_SHORTCUT_RE.test(rawTarget)) continue;

      const hashIdx = rawTarget.indexOf('#');
      const hasFragment = hashIdx !== -1;
      const pathAndQuery = hasFragment ? rawTarget.slice(0, hashIdx) : rawTarget;
      let fragment = hasFragment ? rawTarget.slice(hashIdx + 1) : '';

      if (hasFragment) {
        try { fragment = decodeURIComponent(fragment); } catch {
          broken.push(`${file}:${lineNumber} → ${rawLink} (invalid percent encoding)`);
          continue;
        }
      }

      let target = pathAndQuery.split('?')[0];
      try { target = decodeURIComponent(target); } catch {
        broken.push(`${file} → ${rawLink} (invalid percent encoding)`);
        continue;
      }

      let resolved;
      if (!target) {
        if (!hasFragment) continue;
        resolved = resolve(filePath);
      } else {
        // Check both path grammars on every host so Windows paths cannot slip
        // through Linux CI. Normalize separators before resolving parent segments.
        if (isAbsolute(target) || win32.isAbsolute(target) || /^[a-z]:/i.test(target)) {
          broken.push(`${file} → ${rawLink} (absolute path)`);
          continue;
        }
        resolved = resolve(baseDir, target.replaceAll('\\', '/'));
        const fromRoot = relative(ROOT, resolved);
        if (fromRoot === '..' || fromRoot.startsWith('..' + sep) || isAbsolute(fromRoot)) {
          broken.push(`${file} → ${rawLink} (outside repository)`);
          continue;
        }
        if (!existsSync(resolved)) {
          broken.push(`${file} → ${rawLink}`);
          continue;
        }
      }

      checked++;
      if (hasFragment && /\.md$/i.test(resolved) && statSync(resolved).isFile()) {
        if (!fragment || !getAnchors(resolved).has(fragment)) {
          broken.push(`${file}:${lineNumber} → ${rawLink} (missing anchor #${fragment})`);
        }
      }
    }
  }
}

if (broken.length) {
  console.error(`✗ ${broken.length} broken internal link(s):`);
  for (const b of broken) console.error('  - ' + b);
  process.exit(1);
}
console.log(`✓ internal links OK — ${checked} local links across ${files.length} files resolve.`);
