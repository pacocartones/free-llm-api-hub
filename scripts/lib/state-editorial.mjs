// state-editorial.mjs — the wording of a quarterly report, kept out of the code (content/state/, see
// docs/state-quarterly.md). The file of a quarter, `content/state/YYYY-qN.md`, wins; a quarter without one uses
// `content/state/quarter-default.md`, so every later quarter gets a page with no work.
//
// The file can only QUOTE the data: a number, a list of names or a date is a `{{key}}` from quarterFigures(), filled
// at build time, and the computed sections (with their charts and tables) go where the file puts a line holding only
// `{{block:name}}`. An unknown key or block, a block used twice or a required block left out fails the build, so a
// figure can never be typed by hand and no section of data can be dropped by an edit of the wording.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { markdownToHtml } from './markdown.mjs';

export const EDITORIAL_DIR = 'content/state';
export const DEFAULT_FILE = 'quarter-default.md';
export const REQUIRED_BLOCKS = Object.freeze(['headline', 'changes', 'modality', 'unknowns', 'methodology']);
export const OPTIONAL_BLOCKS = Object.freeze(['status', 'data-links']);

export const editorialPath = (root, quarter) => {
  const own = join(root, EDITORIAL_DIR, `${quarter}.md`);
  return existsSync(own) ? { path: own, file: `${EDITORIAL_DIR}/${quarter}.md`, own: true } : { path: join(root, EDITORIAL_DIR, DEFAULT_FILE), file: `${EDITORIAL_DIR}/${DEFAULT_FILE}`, own: false };
};

/** { meta: { title, description }, body } from a file with a `---` front matter of `key: "value"` lines. */
export const parseEditorial = (text, file = 'editorial file') => {
  const src = text.replace(/\r\n?/g, '\n');
  const m = src.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error(`${file}: missing the front matter (--- title / description ---)`);
  const meta = {};
  for (const line of m[1].split('\n')) {
    if (!line.trim()) continue;
    const kv = line.match(/^([a-z_]+):\s*(?:"((?:[^"\\]|\\.)*)"|(.*))\s*$/);
    if (!kv) throw new Error(`${file}: front matter line not understood: ${line}`);
    meta[kv[1]] = kv[2] !== undefined ? kv[2].replace(/\\(.)/g, '$1') : kv[3].trim();
  }
  for (const k of ['title', 'description']) if (!meta[k]) throw new Error(`${file}: front matter needs ${k}`);
  return { meta, body: m[2] };
};

/** Fills every {{key}}; an unknown key throws. Block lines are left for renderEditorial. */
export const fillFigures = (text, figures, file = 'editorial file') =>
  text.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/g, (_m, key) => {
    if (!Object.hasOwn(figures, key)) throw new Error(`${file}: unknown figure {{${key}}}`);
    return figures[key];
  });

const BLOCK_LINE = /^\s*\{\{block:([a-z0-9-]+)\}\}\s*$/;

/**
 * text: the file. figures: quarterFigures(). blocks: { name: html }. ctx: links context for markdownToHtml.
 * Returns { title, description, html }.
 */
export const renderEditorial = (text, { figures, blocks, ctx, file = 'editorial file' }) => {
  const { meta, body } = parseEditorial(text, file);
  const known = new Set([...REQUIRED_BLOCKS, ...OPTIONAL_BLOCKS]);
  const used = new Set();
  const out = [];
  let chunk = [];
  const flush = () => {
    const md = chunk.join('\n');
    if (md.trim()) out.push(markdownToHtml(fillFigures(md, figures, file), ctx));
    chunk = [];
  };
  for (const line of body.split('\n')) {
    const b = line.match(BLOCK_LINE);
    if (!b) {
      if (/\{\{\s*block:/.test(line)) throw new Error(`${file}: a {{block:…}} must be alone on its line: ${line.trim()}`);
      chunk.push(line);
      continue;
    }
    const name = b[1];
    if (!known.has(name)) throw new Error(`${file}: unknown block {{block:${name}}}`);
    if (used.has(name)) throw new Error(`${file}: block {{block:${name}}} is used twice`);
    if (!Object.hasOwn(blocks, name)) throw new Error(`${file}: block {{block:${name}}} has no generated content`);
    used.add(name);
    flush();
    out.push(blocks[name]);
  }
  flush();
  const missing = REQUIRED_BLOCKS.filter((n) => !used.has(n));
  if (missing.length) throw new Error(`${file}: required block(s) missing: ${missing.map((n) => `{{block:${n}}}`).join(', ')}`);
  return { title: fillFigures(meta.title, figures, file), description: fillFigures(meta.description, figures, file), html: out.join('\n') };
};

export const readEditorial = (root, quarter) => {
  const where = editorialPath(root, quarter);
  return { ...where, text: readFileSync(where.path, 'utf8') };
};
