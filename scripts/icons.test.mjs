import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { ICONS, manifest } from './icons.mjs';

const site = (f) => new URL(`../site/${f}`, import.meta.url);

// PNG width and height live in the IHDR chunk, bytes 16..23.
const pngSize = (buf) => [buf.readUInt32BE(16), buf.readUInt32BE(20)];

test('every raster icon is committed at its declared size', () => {
  for (const { file, size } of ICONS) {
    assert.ok(existsSync(site(file)), `${file} exists (run npm run icons)`);
    const buf = readFileSync(site(file));
    assert.equal(buf.subarray(1, 4).toString('latin1'), 'PNG', `${file} is a PNG`);
    assert.deepEqual(pngSize(buf), [size, size], `${file} is ${size}x${size}`);
  }
});

test('site.webmanifest matches the generator and points at committed icons', () => {
  const committed = JSON.parse(readFileSync(site('site.webmanifest'), 'utf8'));
  assert.deepEqual(committed, manifest(), 'regenerate with npm run icons');
  for (const icon of committed.icons) assert.ok(existsSync(site(icon.src.replace(/^\//, ''))), `${icon.src} exists`);
});

// index.html and 404.html are committed; every other page comes from build.mjs's shared template
// (site/compare/ and the provider pages are gitignored), so the template itself is checked.
test('the committed pages and the generated-page template link the PNG favicon, the touch icon and the manifest', () => {
  const sources = {
    'site/index.html': readFileSync(site('index.html'), 'utf8'),
    'site/404.html': readFileSync(site('404.html'), 'utf8'),
    'scripts/build.mjs': readFileSync(new URL('./build.mjs', import.meta.url), 'utf8'),
  };
  for (const [name, html] of Object.entries(sources)) {
    assert.match(html, /<link rel="icon" href="[^"]*favicon-32\.png" type="image\/png" sizes="32x32">/, `${name}: PNG favicon`);
    assert.match(html, /<link rel="apple-touch-icon" href="[^"]*apple-touch-icon\.png">/, `${name}: touch icon`);
    assert.match(html, /<link rel="manifest" href="[^"]*site\.webmanifest">/, `${name}: manifest`);
  }
});
