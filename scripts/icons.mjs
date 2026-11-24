// icons.mjs — raster app icons from the brand mark, for browsers and platforms that ignore the SVG favicon
// (Safari tabs, iOS home screen, Android install). Run by hand when the mark changes: `npm run icons`.
// Uses @resvg/resvg-js, a devDependency only; the generated PNGs, favicon.ico (the 32 px PNG in an ICO container) and
// site.webmanifest are committed.
import { writeFileSync } from 'node:fs';
import { pngToIco } from './lib/ico.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const INK = '#0a0d0b';
const ACCENT = '#3fce8f';

// The favicon mark without its animation. `bleed` fills the whole square (iOS and Android round it themselves).
export const markSvg = (size, { bleed = false } = {}) => {
  const tile = bleed
    ? `<rect width="32" height="32" fill="${INK}"/>`
    : `<rect width="32" height="32" rx="8" fill="${INK}"/><rect x="2.5" y="2.5" width="27" height="27" rx="6.5" fill="none" stroke="${ACCENT}" stroke-width="1.6" stroke-opacity=".6"/>`;
  // With bleed the glyph is scaled down around the centre so it stays inside the platform's safe zone.
  const glyph = `<path d="M9 11 L14 16 L9 21" fill="none" stroke="${ACCENT}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><rect x="16.5" y="19.4" width="7" height="2.4" rx="1.2" fill="${ACCENT}"/>`;
  const body = bleed ? `${tile}<g transform="translate(16 16) scale(.82) translate(-16 -16)">${glyph}</g>` : `${tile}${glyph}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">${body}</svg>`;
};

export const ICONS = [
  { file: 'favicon-32.png', size: 32, bleed: false },
  { file: 'apple-touch-icon.png', size: 180, bleed: true },
  { file: 'icon-192.png', size: 192, bleed: true },
  { file: 'icon-512.png', size: 512, bleed: true },
];

export const manifest = () => ({
  name: 'Free LLM API Hub',
  short_name: 'LLM API Hub',
  description: 'A continuously-verified dataset of free LLM & AI-model APIs.',
  start_url: '/',
  display: 'browser',
  background_color: INK,
  theme_color: INK,
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
  ],
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { Resvg } = await import('@resvg/resvg-js');
  for (const { file, size, bleed } of ICONS) {
    const png = new Resvg(markSvg(size, { bleed }), { fitTo: { mode: 'width', value: size } }).render().asPng();
    writeFileSync(join(ROOT, 'site', file), png);
    console.log(`wrote site/${file} (${size}px)`);
    if (file === 'favicon-32.png') {
      writeFileSync(join(ROOT, 'site', 'favicon.ico'), pngToIco(png));
      console.log('wrote site/favicon.ico (32px)');
    }
  }
  writeFileSync(join(ROOT, 'site', 'site.webmanifest'), JSON.stringify(manifest(), null, 2) + '\n');
  console.log('wrote site/site.webmanifest');
}
