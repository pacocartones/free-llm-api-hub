#!/usr/bin/env node
// brand-assets.mjs — the brand images that live outside the site: `npm run brand-assets`.
//
//   assets/social-preview.png   1280×640, the GitHub social preview. GitHub does not read it from the repository: the
//                               owner uploads it in Settings → General → Social preview.
//   assets/banner-light.png     the README banner, light and dark (<picture> in README.md): the field of every
//   assets/banner-dark.png      provider's aura, the mark and the tagline.
//
// They show the dataset as of the run, like a release snapshot, and are not checked against the data in CI (the
// regeneration bot only writes under site/): run this at a release, or after changing the tagline (lib/brand.mjs).
// Same artwork and fonts as the social images (lib/og-art.mjs, tools/og-fonts/).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { OG, OG_FONT_FILES, frameSvg, ogAuraSpec, esc, wrap } from './lib/og-art.mjs';
import { homeTaglineSvg, homeAurasSvg } from './lib/og.mjs';
import { auraSvg, HUB_AURA } from './lib/aura.mjs';
import { wordmarkSvg } from './lib/wordmark.mjs';
import { TAGLINE, taglineParts } from './lib/brand.mjs';
import { providerFigures } from './lib/figures.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_URL = 'github.com/pacocartones/free-llm-api-hub';

// The Cálida tokens of each theme (site/styles.css): the banner follows the reader's GitHub theme.
const LIGHT = { theme: 'light', ground: '#fff9f6', ink: '#22140f', muted: '#6a5048', accent: '#9c4a00' };
const DARK = { theme: 'dark', ground: '#17110f', ink: '#fbf1ec', muted: '#c2a89e', accent: '#ffb25c' };

/** The GitHub social preview: the home card at 1280×640 with the repository's address. */
export function socialPreviewSvg(providers) {
  const f = providerFigures(providers);
  const shift = (svg) => `<g transform="translate(40 0)">${svg}</g>`;
  const body = homeTaglineSvg() +
    `<text x="80" y="508" fill="${OG.muted}" font-family="OG Mono" font-size="24"><tspan fill="${OG.ink}" font-weight="500">${f.providers}</tspan> free AI APIs · <tspan fill="${OG.ink}" font-weight="500">${f.verified}/${f.providers}</tspan> verified · every limit quoted and dated</text>` +
    shift(homeAurasSvg(providers)) +
    `<text x="880" y="470" fill="${OG.muted}" font-family="OG Mono" font-size="18">one aura per provider</text>`;
  return frameSvg(body, { width: 1280, height: 640, footer: REPO_URL });
}

/** The README banner: mark, wordmark and tagline over the field of every provider's aura. 1680×420 (shown at 840). */
export function bannerSvg(providers, theme) {
  const t = theme === 'dark' ? DARK : LIGHT;
  const W = 1680, H = 420;
  const specs = providers.map(ogAuraSpec);
  const cols = Math.ceil(specs.length / 4);
  const field = specs.map((s, i) => auraSvg(s, {
    cx: 760 + (i % cols) * 48 + 20, cy: 92 + Math.floor(i / cols) * 76 + (i % 2) * 18, r: 21, theme: t.theme, id: `b${i}`,
  })).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<rect width="${W}" height="${H}" rx="28" fill="${t.ground}"/>` +
    auraSvg(HUB_AURA, { cx: 108, cy: 120, r: 42, id: 'hub', theme: t.theme }) +
    wordmarkSvg({ x: 168, y: 136, size: 46, fill: t.ink }) +
    taglineParts().map((l, i) => `<text x="72" y="${236 + i * 64}" fill="${i ? t.accent : t.ink}" font-family="OG Display" font-size="62" letter-spacing="-1">${esc(l)}</text>`).join('') +
    `<text x="74" y="360" fill="${t.muted}" font-family="OG Mono" font-size="26">${providers.length} free AI APIs, each dated and sourced</text>` +
    field + `</svg>`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { Resvg } = await import('@resvg/resvg-js');
  const font = { fontFiles: OG_FONT_FILES.map((f) => join(ROOT, 'tools/og-fonts', f)), loadSystemFonts: false, defaultFontFamily: 'OG Text' };
  const png = (svg, width) => new Resvg(Buffer.from(svg), { fitTo: { mode: 'width', value: width }, font }).render().asPng();
  const { providers } = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8'));
  for (const [file, svg, width] of [
    ['assets/social-preview.png', socialPreviewSvg(providers), 1280],
    ['assets/banner-light.png', bannerSvg(providers, 'light'), 1680],
    ['assets/banner-dark.png', bannerSvg(providers, 'dark'), 1680],
  ]) {
    const out = png(svg, width);
    writeFileSync(join(ROOT, file), out);
    console.log(`wrote ${file} (${(out.length / 1024).toFixed(0)} KB)`);
  }
}
