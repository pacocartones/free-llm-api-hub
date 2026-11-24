// Fonts in the head, asset fingerprints, security.txt and favicon.ico (scripts/lib/assets.mjs, security-txt.mjs, ico.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { FONTS, fontHead, fingerprintHtml, hash8 } from './lib/assets.mjs';
import { securityTxt, securityTxtExpires, SECURITY_TXT_ISSUED } from './lib/security-txt.mjs';
import { pngToIco } from './lib/ico.mjs';

const file = (rel) => new URL(`../${rel}`, import.meta.url);
const read = (rel) => readFileSync(file(rel), 'utf8');
const sha8 = (rel) => createHash('sha256').update(readFileSync(file(rel))).digest('hex').slice(0, 8);

test('fontHead preloads every weight it declares, with the same URL, and never swaps fonts in late', () => {
  const head = fontHead('../');
  for (const f of FONTS) {
    assert.ok(head.includes(`<link rel="preload" href="../${f.file}" as="font" type="font/woff2" crossorigin>`), `preload ${f.weight}`);
    assert.ok(head.includes(`font-weight:${f.weight};font-display:optional;src:url('../${f.file}')`), `@font-face ${f.weight}`);
  }
  // A late swap re-flows the hero on a slow network; `optional` keeps the first paint's font for the whole view.
  assert.doesNotMatch(head, /font-display:swap/);
  assert.doesNotMatch(read('site/styles.css'), /@font-face/, 'the faces live in the head only, so the preload and the face never disagree');
});

test('fingerprintHtml stamps local styles, scripts and fonts by their hash, resolved from the page, and is idempotent', () => {
  const hashes = { 'styles.css': 'aaaaaaaa', 'site.js': 'bbbbbbbb', 'fonts/x.woff2': 'cccccccc' };
  const html = '<link rel="stylesheet" href="../styles.css"><script src="/site.js"></script><link rel="preload" href="../fonts/x.woff2">'
    + "<style>@font-face{src:url('../fonts/x.woff2') format('woff2')}</style>"
    + '<script src="https://freellmapihub.com/widget.js"></script><script src="../missing.js"></script><a href="../providers.json">';
  const out = fingerprintHtml(html, 'p/groq.html', hashes);
  assert.ok(out.includes('href="../styles.css?v=aaaaaaaa"'));
  assert.ok(out.includes('src="/site.js?v=bbbbbbbb"'));
  assert.ok(out.includes('href="../fonts/x.woff2?v=cccccccc"'));
  assert.ok(out.includes("url('../fonts/x.woff2?v=cccccccc')"));
  assert.ok(out.includes('src="https://freellmapihub.com/widget.js"'), 'off-site URLs are left alone');
  assert.ok(out.includes('src="../missing.js"'), 'a file that does not exist gets no stamp');
  assert.ok(out.includes('href="../providers.json"'), 'data files are not stamped');
  assert.equal(fingerprintHtml(out, 'p/groq.html', hashes), out, 'a second pass changes nothing');
  assert.ok(fingerprintHtml(out, 'p/groq.html', { ...hashes, 'styles.css': 'dddddddd' }).includes('styles.css?v=dddddddd'), 'a new hash replaces the old one');
  assert.equal(hash8(Buffer.from('a')), 'ca978112');
});

test('the committed home and 404 carry the fonts and the current hash of every asset they load', () => {
  for (const [rel, prefix] of [['site/index.html', ''], ['site/404.html', '/']]) {
    const html = read(rel);
    const refs = [...html.matchAll(/(?:src|href)="([^"]+\.(?:css|js|woff2))(\?v=[0-9a-f]{8})?"/g)].filter((m) => !/^https?:/.test(m[1]));
    assert.ok(refs.length >= 4, `${rel}: assets found`);
    for (const [, ref, v] of refs) {
      const site = 'site/' + (ref.startsWith('/') ? ref.slice(1) : ref);
      // shared-*.js and consent.js are build output, absent from a fresh checkout: there only the stamp is checked.
      if (existsSync(file(site))) assert.equal(v, `?v=${sha8(site)}`, `${rel}: ${ref} carries the hash of ${site}`);
      else assert.match(v || '', /^\?v=[0-9a-f]{8}$/, `${rel}: ${ref} is stamped`);
    }
    for (const f of FONTS) assert.ok(html.includes(`<link rel="preload" href="${prefix}${f.file}?v=${sha8('site/' + f.file)}" as="font"`), `${rel}: preloads ${f.file}`);
    assert.match(html, new RegExp(`<link rel="icon" href="${prefix.replace('/', '\\/')}favicon\\.ico" sizes="32x32">`), `${rel}: favicon.ico`);
  }
});

test('security.txt: RFC 9116 fields, Expires a year after a fixed date (not the clock), committed as built', () => {
  assert.equal(securityTxtExpires('2026-11-24'), '2027-11-24T00:00:00Z');
  assert.throws(() => securityTxtExpires('soon'));
  const txt = securityTxt({ site: 'https://freellmapihub.com', repo: 'https://github.com/pacocartones/free-llm-api-hub' });
  assert.equal(read('site/.well-known/security.txt'), txt);
  const lines = txt.split('\n');
  assert.equal(lines[2], 'Contact: https://github.com/pacocartones/free-llm-api-hub/security/advisories/new', 'private reporting first, as in SECURITY.md');
  assert.ok(lines.includes('Contact: mailto:admin@freellmapihub.com'));
  assert.ok(lines.includes(`Expires: ${securityTxtExpires(SECURITY_TXT_ISSUED)}`));
  assert.ok(lines.includes('Preferred-Languages: en'));
  assert.ok(lines.includes('Canonical: https://freellmapihub.com/.well-known/security.txt'));
  assert.ok(lines.includes('Policy: https://github.com/pacocartones/free-llm-api-hub/blob/main/SECURITY.md'));
  assert.ok(read('SECURITY.md').includes('security/advisories/new') && read('SECURITY.md').includes('admin@freellmapihub.com'), 'same channels as SECURITY.md');
  // The Pages artifact drops dot-folders unless asked, which would leave /.well-known/ unpublished.
  assert.match(read('.github/workflows/pages.yml'), /upload-pages-artifact@[0-9a-f]{40}[^\n]*\n\s+with:\n\s+path: site\n(?:\s+#[^\n]*\n)*\s+include-hidden-files: true\n/);
});

test('favicon.ico is the committed 32 px PNG favicon in an ICO container', () => {
  const png = readFileSync(file('site/favicon-32.png'));
  const ico = readFileSync(file('site/favicon.ico'));
  assert.deepEqual(ico, pngToIco(png));
  assert.deepEqual([ico.readUInt16LE(2), ico.readUInt16LE(4), ico[6], ico[7], ico.readUInt32LE(18)], [1, 1, 32, 32, 22]);
  assert.throws(() => pngToIco(Buffer.from('not a png at all, really not')));
});
