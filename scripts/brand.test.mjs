// The tagline is one placeholder constant (scripts/lib/brand.mjs) that every surface prints, and the brand images follow
// their generators. Each test names the mutant it catches.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { TAGLINE, TAGLINE_KEY, taglineParts } from './lib/brand.mjs';
import { renderHomeOg, homeTaglineSvg } from './lib/og.mjs';
import { socialPreviewSvg, bannerSvg, REPO_URL } from './brand-assets.mjs';
import { providerCardSvg, tagCardSvg, wrap, ogLimits } from './lib/og-art.mjs';

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const providers = JSON.parse(read('data/providers.json')).providers;
const pngSize = (rel) => { const b = readFileSync(new URL(`../${rel}`, import.meta.url)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

test('tagline: one marked placeholder, whose key phrase ends it', () => {
  // Mutant: a key that is not the end of the tagline (the hero would print a phrase twice), or a lost placeholder note.
  assert.ok(TAGLINE.endsWith(TAGLINE_KEY), 'TAGLINE_KEY closes TAGLINE');
  assert.deepEqual(taglineParts('Every limit quoted. Every quote dated.', 'Every quote dated.'), ['Every limit quoted.', 'Every quote dated.']);
  assert.deepEqual(taglineParts('No key here.', 'missing'), ['No key here.', '']);
  assert.match(read('scripts/lib/brand.mjs'), /PLACEHOLDER — TAGLINE NOT CHOSEN YET/);
});

test('tagline: the home H1, the README, the home social image and the brand assets all print it', () => {
  // Mutant: a surface that keeps its own copy of the words; changing TAGLINE would leave it behind.
  const [lead, key] = taglineParts();
  const home = read('site/index.html');
  assert.ok(home.includes(`<!-- AUTOGEN:tagline:start -->\n    <h1>${lead}<br> <span class="h1-key">${key}</span></h1>\n<!-- AUTOGEN:tagline:end -->`), 'home H1');
  assert.ok(read('README.md').includes(`<!-- AUTOGEN:tagline:start -->\n**${TAGLINE}**\n<!-- AUTOGEN:tagline:end -->`), 'README');
  const og = read('site/og.svg');
  assert.equal(renderHomeOg(og, providers), og, 'site/og.svg is rendered (npm run og)');
  assert.ok(og.includes(homeTaglineSvg()), 'the home social image');
  const words = (svg) => [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]).join(' ').replace(/\s+/g, ' ');
  assert.ok(words(homeTaglineSvg()).includes(TAGLINE), 'every word of it, in order');
  assert.ok(words(socialPreviewSvg(providers)).includes(TAGLINE), 'the GitHub social preview');
  assert.ok(words(bannerSvg(providers, 'light')).includes(TAGLINE), 'the README banner');
});

test('brand assets: the social preview is 1280×640 with the repository address, the banners exist in both themes', () => {
  // Mutant: a preview at the OG size (GitHub crops anything but 2:1) or a banner missing from one theme.
  assert.deepEqual(pngSize('assets/social-preview.png'), [1280, 640]);
  assert.match(socialPreviewSvg(providers), new RegExp(REPO_URL.replace(/[./]/g, '\\$&')));
  for (const t of ['light', 'dark']) { assert.deepEqual(pngSize(`assets/banner-${t}.png`), [1680, 420]); assert.ok(statSync(new URL(`../assets/banner-${t}.png`, import.meta.url)).size < 300 * 1024); }
  const readme = read('README.md');
  assert.match(readme, /<source media="\(prefers-color-scheme: dark\)" srcset="assets\/banner-dark\.png">\n  <img src="assets\/banner-light\.png" alt="[^"]+" width="840">/);
});

test('README badges: the static shields use brand colours; the data badges keep their own', () => {
  // Mutant: a badge left in the old palette (0b7285, blue, brightgreen, 9c4668).
  const readme = read('README.md');
  const statics = [...readme.matchAll(/img\.shields\.io\/badge\/[^)\s]+-([0-9A-Za-z]+)\.svg/g)].map((m) => m[1]);
  assert.ok(statics.length >= 4);
  for (const c of statics) assert.ok(['C2255C', '55565E', '5B3FE0', '1B7A44'].includes(c), 'brand colour: ' + c);
});

test('social images: a provider card draws its limits, its aura and the stamp; a tag card wraps its title', () => {
  // Mutant: a card that drops the numbers or the stamp, or a title that runs into the artwork.
  const groq = providers.find((p) => p.slug === 'groq');
  const svg = providerCardSvg(groq, 'Ongoing free tier');
  for (const [v, l] of ogLimits(groq)) { assert.ok(svg.includes(`>${v}</text>`), v); assert.ok(svg.includes(`>${l}</text>`), l); }
  assert.match(svg, />verified · sourced<\/text>/);
  assert.match(svg, /<path d="M948 318L/, 'the aura, centred on the right');
  assert.deepEqual(wrap('Free OCR & document AI APIs', 14, 3), ['Free OCR &', 'document AI', 'APIs']);
  assert.equal(wrap('one two three four five six', 7, 2).at(-1), 'three…');
  assert.match(tagCardSvg({ label: 'GUIDE', title: 'Free OCR APIs', subtitle: 's', specs: [] }), /<circle cx="950" cy="315" r="150"/, 'no members: the hub aura');
});
