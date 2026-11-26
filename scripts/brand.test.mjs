// The tagline is one constant (scripts/lib/brand.mjs) that every surface prints, and the brand images follow their
// generators, in the Cálida palette. Each test names the mutant it catches.
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

test('tagline: the owner\'s choice, whose key phrase ends it', () => {
  // Mutant: a key that is not the end of the tagline (the hero would print a phrase twice), or the old placeholder back.
  assert.equal(TAGLINE, 'We read the docs. You ship the code.');
  assert.ok(TAGLINE.endsWith(TAGLINE_KEY), 'TAGLINE_KEY closes TAGLINE');
  assert.deepEqual(taglineParts('Every limit quoted. Every quote dated.', 'Every quote dated.'), ['Every limit quoted.', 'Every quote dated.']);
  assert.deepEqual(taglineParts('No key here.', 'missing'), ['No key here.', '']);
  assert.doesNotMatch(read('scripts/lib/brand.mjs'), /PLACEHOLDER/);
});

test('tagline: the home H1, the README, the home social image and the brand assets all print it', () => {
  // Mutant: a surface that keeps its own copy of the words; changing TAGLINE would leave it behind.
  const [lead, key] = taglineParts();
  const home = read('site/index.html');
  assert.ok(home.includes(`<!-- AUTOGEN:tagline:start -->\n    <h1>${lead} <span class="h1-key">${key}</span></h1>\n<!-- AUTOGEN:tagline:end -->`), 'home H1');
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
  assert.ok(socialPreviewSvg(providers).includes(REPO_URL), 'the repository address');
  for (const t of ['light', 'dark']) { assert.deepEqual(pngSize(`assets/banner-${t}.png`), [1680, 420]); assert.ok(statSync(new URL(`../assets/banner-${t}.png`, import.meta.url)).size < 300 * 1024); }
  const readme = read('README.md');
  assert.match(readme, /<source media="\(prefers-color-scheme: dark\)" srcset="assets\/banner-dark\.png">\n  <img src="assets\/banner-light\.png" alt="[^"]+" width="840">/);
});

test('README badges: the static shields use the Cálida colours; the data badges keep their own', () => {
  // Mutant: a badge left in an old palette (0b7285, blue, brightgreen, 9c4668, or the provisional magenta C2255C).
  const readme = read('README.md');
  const statics = [...readme.matchAll(/img\.shields\.io\/badge\/[^)\s]+-([0-9A-Za-z]+)\.svg/g)].map((m) => m[1]);
  assert.ok(statics.length >= 4);
  for (const c of statics) assert.ok(['9C4A00', '6A5048', '7A2E8C', '2F6B1F'].includes(c), 'Cálida colour: ' + c);
});

test('social images: a provider card draws its limits, its aura and the perforated ticket; a tag card wraps its title', () => {
  // Mutant: a card that drops the numbers or the ticket, or a title that runs into the artwork.
  const groq = providers.find((p) => p.slug === 'groq');
  const svg = providerCardSvg(groq, 'Ongoing free tier', 7);
  for (const [v, l] of ogLimits(groq)) { assert.ok(svg.includes(`>${v}</text>`), v); assert.ok(svg.includes(`>${l}</text>`), l); }
  assert.match(svg, />Verified · 7 sources<\/text>/);
  assert.match(svg, /<rect width="\d+" height="\d+" rx="\d+" fill="#ffebd9"\/><circle cx="0" cy="[\d.]+" r="[\d.]+" fill="#fff9f6"\/>/, 'the apricot ticket, notched on the ground');
  assert.match(svg, /stroke-width="2.75" stroke-dasharray="6 5"\/>/, 'the cut line');
  assert.match(svg, /<g transform="translate\(778 148\) scale\(3.4\)">/, 'the aura, centred on the right');
  assert.match(svg, /<rect width="1200" height="630" fill="#fff9f6"\/>/, 'the Cálida light ground');
  assert.deepEqual(wrap('Free OCR & document AI APIs', 14, 3), ['Free OCR &', 'document AI', 'APIs']);
  assert.equal(wrap('one two three four five six', 7, 2).at(-1), 'three…');
  assert.match(tagCardSvg({ label: 'GUIDE', title: 'Free OCR APIs', subtitle: 's', specs: [] }), /<g transform="translate\(790 155\) scale\(3.2\)">/, 'no members: the hub aura');
});
