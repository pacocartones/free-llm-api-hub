// assets.mjs — how pages load the site's own fonts, styles and scripts.
//
// Fonts. Brand direction H1: Roboto Flex (one variable file, the wght and wdth axes, display and text) and DM Mono 400/500
// (data, code, badges). All three are used above the fold (the hero, the nav, the stats line, the table), so every page
// preloads them and declares them in its <head> (fontHead) instead of in styles.css: the browser finds them while it
// parses the head, not after it has downloaded and parsed the stylesheet. `font-display: optional` lets a font that is not
// there within the first ~100 ms be skipped for that page view (it is cached for the next one), so the text never
// re-flows when the font arrives. The files are Latin subsets made from the Google Fonts sources (SIL OFL 1.1, licence
// next to them in site/fonts/); the recipe is in docs/brand.md. FONT_BUDGET_BYTES caps what a page may load, and the
// Lighthouse gate (scripts/lighthouse-gate.mjs) fails a page that declares more.
// Fingerprints. fingerprintSite() runs at the end of the build and adds `?v=<first 8 hex of the SHA-256 of the file>`
// to every reference to a local .css, .js or .woff2 file in the HTML under site/ (src, href and CSS url()). The
// query changes only when the file's bytes change, so the CDN can keep these files for a year (`immutable`) and a
// page can never run with a stale script. It is deterministic: the same files give the same pages.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, posix } from 'node:path';

// `weight` and `stretch` are the ranges each file covers (a variable font declares its axis ranges).
export const FONTS = [
  { family: 'Roboto Flex', weight: '300 900', stretch: '75% 130%', file: 'fonts/roboto-flex.woff2' },
  { family: 'DM Mono', weight: '400', stretch: '100%', file: 'fonts/dm-mono-400.woff2' },
  { family: 'DM Mono', weight: '500', stretch: '100%', file: 'fonts/dm-mono-500.woff2' },
];

// The most font bytes one page may load (all of FONTS together): the brand plan's budget for the new families.
export const FONT_BUDGET_BYTES = 90 * 1024;

// The font block of every page's <head>. `prefix` is the path to the site root ('', '../', '/').
export const fontHead = (prefix) =>
  FONTS.map((f) => `<link rel="preload" href="${prefix}${f.file}" as="font" type="font/woff2" crossorigin>`).join('\n') +
  '\n<style>' +
  FONTS.map((f) => `@font-face{font-family:'${f.family}';font-style:normal;font-weight:${f.weight};font-stretch:${f.stretch};font-display:optional;src:url('${prefix}${f.file}') format('woff2')}`).join('') +
  '</style>';

export const hash8 = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 8);

const ASSET_RE = /\.(?:css|js|woff2)$/;

// { 'styles.css': 'a1b2c3d4', 'fonts/roboto-flex.woff2': '…', … } for the files at the top of site/ and in site/fonts/.
export function assetHashes(siteDir) {
  const out = {};
  for (const dir of ['', 'fonts']) {
    const abs = join(siteDir, dir);
    if (!existsSync(abs)) continue;
    for (const e of readdirSync(abs, { withFileTypes: true })) {
      if (e.isFile() && ASSET_RE.test(e.name)) out[dir ? `${dir}/${e.name}` : e.name] = hash8(readFileSync(join(abs, e.name)));
    }
  }
  return out;
}

// The site path a reference points to, from the page at `pageRel` (e.g. 'p/groq.html'); null for anything off-site.
const resolveRef = (ref, pageRel) => {
  if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(ref)) return null;
  if (ref.startsWith('/')) return posix.normalize(ref.slice(1));
  return posix.normalize(posix.join(posix.dirname(pageRel), ref));
};

// Adds (or refreshes) ?v=<hash> on every local asset reference of one page. Idempotent.
export function fingerprintHtml(html, pageRel, hashes) {
  const stamp = (ref) => {
    const key = resolveRef(ref, pageRel);
    return key && hashes[key] ? `${ref}?v=${hashes[key]}` : ref;
  };
  return html
    .replace(/\b(src|href)="([^"?#\s]+\.(?:css|js|woff2))(?:\?v=[0-9a-f]{8})?"/g, (_m, attr, ref) => `${attr}="${stamp(ref)}"`)
    .replace(/url\((['"]?)([^'")?#\s]+\.woff2)(?:\?v=[0-9a-f]{8})?\1\)/g, (_m, q, ref) => `url(${q}${stamp(ref)}${q})`);
}

// Every .html under site/ except the social images; returns the number of pages rewritten.
export function fingerprintSite(siteDir) {
  const hashes = assetHashes(siteDir);
  let changed = 0;
  const walk = (dir, rel) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { if (r !== 'og') walk(join(dir, e.name), r); continue; }
      if (!e.name.endsWith('.html')) continue;
      const abs = join(dir, e.name);
      const html = readFileSync(abs, 'utf8');
      const next = fingerprintHtml(html, r, hashes);
      if (next !== html) { writeFileSync(abs, next); changed++; }
    }
  };
  walk(siteDir, '');
  return changed;
}
