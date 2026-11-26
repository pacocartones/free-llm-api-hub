// icons.mjs — every rendering of the brand mark, from one source: the hub's own aura (lib/aura.mjs, brand H1, Cálida
// radial bars), six modalities with rays from the centre and nothing unsaid. The favicon uses a four-sector version
// with fewer, thicker bars that stays legible at 16 px, on the warm near-black tile so it reads on light and dark tabs.
//   site/favicon.svg, favicon-32.png, favicon.ico, apple-touch-icon.png, icon-192.png, icon-512.png, site.webmanifest
//   assets/logo-light.svg, assets/logo-dark.svg (mark + outlined wordmark) and assets/logo-full.svg (mark only, large)
// Run by hand when the mark changes: `npm run icons`. Uses @resvg/resvg-js, a devDependency only; the outputs are
// committed. scripts/icons.test.mjs checks that the committed files are what this script writes.
import { writeFileSync } from 'node:fs';
import { pngToIco } from './lib/ico.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { auraSvg, HUB_AURA, FAVICON_AURA } from './lib/aura.mjs';
import { wordmarkSvg, wordmarkWidth } from './lib/wordmark.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const INK = '#17110f';
const PAPER = '#fff9f6';

// The mark at `size` px, in the dark theme's hues on the warm near-black ground. Small sizes use the favicon aura on a
// rounded tile; `bleed` fills the square (iOS and Android round it themselves) and keeps the aura inside their safe zone.
export const markSvg = (size, { bleed = false } = {}) => {
  const body = bleed
    ? `<rect width="32" height="32" fill="${INK}"/>${auraSvg(HUB_AURA, { cx: 16, cy: 16, r: 11, id: 'm', theme: 'dark' })}`
    : `<rect width="32" height="32" rx="7" fill="${INK}"/>${auraSvg(size <= 32 ? FAVICON_AURA : HUB_AURA, { cx: 16, cy: 16, r: 15, id: 'm', theme: 'dark' })}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">${body}</svg>`;
};

// The SVG favicon: the same tile and four sectors, with no animation (a tab icon should not move).
export const faviconSvg = () =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32"><rect width="32" height="32" rx="7" fill="${INK}"/>${auraSvg(FAVICON_AURA, { cx: 16, cy: 16, r: 15, id: 'f', theme: 'dark' })}</svg>\n`;

// The sprite symbol every page uses (#logo in the SVG sprite of build.mjs, index.html and 404.html).
// Its colours are the --h-* tokens, so the mark follows the page's theme.
export const logoSymbol = () => `<symbol id="logo" viewBox="0 0 32 32">${auraSvg(HUB_AURA, { cx: 16, cy: 16, r: 16, id: 'logo', theme: 'css' })}</symbol>`;

// Mark + wordmark, for the README and anyone who links the logo. Text is outlined (lib/wordmark.mjs): no font needed.
export const logoSvg = (theme) => {
  const size = 22, h = 40, gap = 12, mark = 32;
  const w = Math.ceil(4 + mark + gap + wordmarkWidth(size) + 4);
  const ink = theme === 'dark' ? '#fbf1ec' : '#22140f';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Free LLM API Hub">` +
    `${auraSvg(HUB_AURA, { cx: 4 + mark / 2, cy: h / 2, r: mark / 2, id: 'l', theme: theme === 'dark' ? 'dark' : 'light' })}` +
    `${wordmarkSvg({ x: 4 + mark + gap, y: 28, size, fill: ink })}</svg>\n`;
};

// The mark alone, large, for avatars and press kits: the light theme's hues, which keep 3:1 on white.
export const logoFullSvg = () =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="240" height="240" role="img" aria-label="Free LLM API Hub">${auraSvg(HUB_AURA, { cx: 120, cy: 120, r: 112, id: 'x' })}</svg>\n`;

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
  background_color: PAPER,
  theme_color: PAPER,
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
  writeFileSync(join(ROOT, 'site', 'favicon.svg'), faviconSvg());
  writeFileSync(join(ROOT, 'assets', 'logo-light.svg'), logoSvg('light'));
  writeFileSync(join(ROOT, 'assets', 'logo-dark.svg'), logoSvg('dark'));
  writeFileSync(join(ROOT, 'assets', 'logo-full.svg'), logoFullSvg());
  writeFileSync(join(ROOT, 'site', 'site.webmanifest'), JSON.stringify(manifest(), null, 2) + '\n');
  console.log('wrote site/favicon.svg, assets/logo-{light,dark,full}.svg and site/site.webmanifest');
}
